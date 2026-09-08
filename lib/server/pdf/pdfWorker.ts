import 'server-only';

import sharp from 'sharp';
import v8 from 'v8';

export class PdfWorkerTimeoutError extends Error {
  readonly code = 'PDF_WORKER_TIMEOUT';
  constructor(message = 'PDF rendering exceeded execution timeout limit.') {
    super(message);
    this.name = 'PdfWorkerTimeoutError';
  }
}

export class PdfWorkerMemoryExceededError extends Error {
  readonly code = 'PDF_WORKER_MEMORY_EXCEEDED';
  constructor(message = 'System memory threshold exceeded for PDF canvas allocation.') {
    super(message);
    this.name = 'PdfWorkerMemoryExceededError';
  }
}

export interface PdfWorkerRenderOptions {
  pdfBuffer: Buffer;
  pageNumber: number;
  targetWidth?: number;
  jpegQuality?: number;
  timeoutMs?: number;
  maxHeapMb?: number;
  _renderFn?: (
    options: PdfWorkerRenderOptions,
    cancelRef?: { cancel?: () => void }
  ) => Promise<PdfWorkerRenderResult>;
}

export interface PdfWorkerRenderResult {
  buffer: Buffer;
  width: number;
  height: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_TARGET_WIDTH = 3000;
const DEFAULT_JPEG_QUALITY = 90;

interface QueuedCaller {
  id: number;
  acquire: () => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

// Mutex queue ensuring at most ONE heavy 3000px canvas exists in memory at any instant
let isRendering = false;
let isWorkerUnhealthy = false;
let unhealthyReason: string | null = null;
let cancelActiveRender: (() => void) | null = null;
const waitQueue: QueuedCaller[] = [];
let nextRequestId = 1;

export function isPdfWorkerLocked(): boolean {
  return isRendering;
}

export function isPdfWorkerHealthy(): boolean {
  return !isWorkerUnhealthy;
}

export function getPdfWorkerStatus(): {
  isRendering: boolean;
  isHealthy: boolean;
  unhealthyReason: string | null;
  queueLength: number;
} {
  return {
    isRendering,
    isHealthy: !isWorkerUnhealthy,
    unhealthyReason,
    queueLength: waitQueue.length,
  };
}

/**
 * STRICTLY TEST-ONLY: Clear in-memory state between unit test cases in a single test process.
 * In production, an active native render cannot be safely force-reset in-process;
 * process or worker restart is required if an active render hung.
 */
export function _resetPdfWorkerForTestingOnly(): void {
  if (cancelActiveRender) {
    try {
      cancelActiveRender();
    } catch {
      // Ignore
    }
  }
  cancelActiveRender = null;
  isRendering = false;
  isWorkerUnhealthy = false;
  unhealthyReason = null;
  while (waitQueue.length > 0) {
    const next = waitQueue.shift();
    if (next) {
      clearTimeout(next.timer);
    }
  }
}

// Deprecated alias strictly for backwards-compatible test teardowns
export const resetPdfWorkerLock = _resetPdfWorkerForTestingOnly;
export const recoverPdfWorkerLock = _resetPdfWorkerForTestingOnly;

function drainWaitQueue() {
  while (waitQueue.length > 0) {
    const next = waitQueue.shift();
    if (next) {
      clearTimeout(next.timer);
      isRendering = true;
      next.acquire();
      return;
    }
  }
  isRendering = false;
}

function acquireCanvasLock(timeoutMs: number, pageNumber: number): Promise<number> {
  const reqId = nextRequestId++;

  if (!isRendering) {
    isRendering = true;
    return Promise.resolve(reqId);
  }

  return new Promise<number>((resolve, reject) => {
    const item: QueuedCaller = {
      id: reqId,
      acquire: () => {
        resolve(reqId);
      },
      reject,
      timer: null as unknown as NodeJS.Timeout,
    };

    item.timer = setTimeout(() => {
      const idx = waitQueue.findIndex((q) => q.id === reqId);
      if (idx !== -1) {
        waitQueue.splice(idx, 1);
      }
      reject(
        new PdfWorkerTimeoutError(
          `PDF page ${pageNumber} render timed out waiting for canvas lock after ${timeoutMs}ms.`
        )
      );
    }, timeoutMs);

    waitQueue.push(item);
  });
}

function releaseCanvasLock() {
  cancelActiveRender = null;
  drainWaitQueue();
}

function copyPdfBytes(buffer: Buffer) {
  return Uint8Array.from(buffer);
}

async function installPdfCanvasGlobals() {
  const canvasModule = await import('@napi-rs/canvas');
  const globalScope = globalThis as unknown as Record<string, unknown>;
  globalScope.DOMMatrix ||= canvasModule.DOMMatrix;
  globalScope.ImageData ||= canvasModule.ImageData;
  globalScope.Path2D ||= canvasModule.Path2D;
  return canvasModule;
}

async function loadPdfJs() {
  const globalScope = globalThis as unknown as Record<string, unknown>;
  globalScope.pdfjsWorker ||=
    await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

/**
 * Checks system heap memory and optionally triggers garbage collection
 * if running with --expose-gc.
 */
export function checkMemoryPressure(maxHeapMb?: number): {
  safe: boolean;
  heapUsedMb: number;
  heapLimitMb: number;
  heapPercent: number;
} {
  const heapStats = v8.getHeapStatistics();
  const heapUsedMb = Math.round(heapStats.used_heap_size / (1024 * 1024));
  const heapLimitMb = Math.round(heapStats.heap_size_limit / (1024 * 1024));
  const heapPercent = Math.round((heapStats.used_heap_size / heapStats.heap_size_limit) * 100);

  const configuredMaxMb =
    maxHeapMb ??
    (Number(process.env.PDF_WORKER_MAX_HEAP_MB) || Math.floor(heapLimitMb * 0.88));

  // If memory is close to ceiling, attempt garbage collection if exposed
  if (heapUsedMb > configuredMaxMb * 0.85) {
    try {
      const gc = (globalThis as unknown as { gc?: () => void }).gc;
      if (typeof gc === 'function') {
        gc();
      }
    } catch {
      // GC may not be exposed
    }
  }

  const isSafe = heapUsedMb <= configuredMaxMb && heapPercent <= 92;

  return {
    safe: isSafe,
    heapUsedMb,
    heapLimitMb,
    heapPercent,
  };
}

/**
 * Explicitly releases canvas memory and dereferences native context.
 */
function disposeCanvas(canvas: unknown, context: unknown, width: number, height: number) {
  try {
    if (context && typeof (context as { clearRect?: (x: number, y: number, w: number, h: number) => void }).clearRect === 'function') {
      (context as { clearRect: (x: number, y: number, w: number, h: number) => void }).clearRect(0, 0, width, height);
    }
    if (canvas && typeof canvas === 'object') {
      const canvasObj = canvas as { width?: number; height?: number };
      canvasObj.width = 0;
      canvasObj.height = 0;
    }
  } catch {
    // Best-effort resource disposal
  }

  // Hint garbage collection
  try {
    const gc = (globalThis as unknown as { gc?: () => void }).gc;
    if (typeof gc === 'function') {
      gc();
    }
  } catch {
    // Ignore
  }
}

/**
 * Internal single-page render worker implementation.
 */
async function executeRenderPage(
  options: PdfWorkerRenderOptions,
  cancelRef?: { cancel?: () => void }
): Promise<PdfWorkerRenderResult> {
  const targetWidth = options.targetWidth ?? DEFAULT_TARGET_WIDTH;
  const jpegQuality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;

  // Runtime memory pressure verification before allocating native canvas
  const memoryStatus = checkMemoryPressure(options.maxHeapMb);
  if (!memoryStatus.safe) {
    throw new PdfWorkerMemoryExceededError(
      `Cannot render PDF page ${options.pageNumber}: heap usage is at ${memoryStatus.heapUsedMb}MB (${memoryStatus.heapPercent}% of limit).`
    );
  }

  const canvasModule = await installPdfCanvasGlobals();
  const pdfjs = await loadPdfJs();
  const document = await pdfjs.getDocument({
    data: copyPdfBytes(options.pdfBuffer),
    useSystemFonts: true,
  }).promise;

  let width = 0;
  let height = 0;

  try {
    if (options.pageNumber < 1 || options.pageNumber > document.numPages) {
      throw new Error(`PDF page ${options.pageNumber} does not exist.`);
    }

    const page = await document.getPage(options.pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    width = Math.round(viewport.width);
    height = Math.round(viewport.height);

    const canvas = canvasModule.createCanvas(width, height);
    const context = canvas.getContext('2d');

    const renderTask = page.render({
      canvasContext: context as never,
      viewport,
      background: '#ffffff',
    });

    if (cancelRef) {
      cancelRef.cancel = () => {
        try {
          renderTask.cancel();
        } catch {
          // Ignore
        }
      };
    }

    try {
      await renderTask.promise;
    } catch (renderError: unknown) {
      if (
        renderError &&
        typeof renderError === 'object' &&
        'name' in renderError &&
        (renderError as { name: string }).name === 'RenderingCancelledException'
      ) {
        throw new PdfWorkerTimeoutError('PDF page render cancelled.');
      }
      throw renderError;
    }

    const rawJpeg = canvas.toBuffer('image/jpeg', jpegQuality);
    // Explicit disposal of native canvas and context resources immediately
    disposeCanvas(canvas, context, width, height);

    const normalized = await sharp(rawJpeg)
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toBuffer();

    return { buffer: normalized, width, height };
  } finally {
    try {
      await document.destroy();
    } catch {
      // Best-effort document cleanup
    }
  }
}

/**
 * Public isolated worker function:
 * - Enforces single-canvas concurrency mutex
 * - Enforces runtime memory checks
 * - Enforces execution timeout
 * - Ensures explicit memory release
 * - Provides bounded queue wait and cancellation recovery
 */
export async function renderPdfPageWithWorkerIsolation(
  options: PdfWorkerRenderOptions
): Promise<PdfWorkerRenderResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startTime = Date.now();

  // 1. Acquire mutex with bounded queue-wait timeout
  await acquireCanvasLock(timeoutMs, options.pageNumber);

  // 2. Compute remaining execution timeout after queue wait
  const elapsedQueueTime = Date.now() - startTime;
  const remainingTimeoutMs = Math.max(1, timeoutMs - elapsedQueueTime);

  let timerId: NodeJS.Timeout | null = null;
  let settled = false;

  const markSettledAndRelease = () => {
    if (!settled) {
      settled = true;
      isWorkerUnhealthy = false;
      unhealthyReason = null;
      releaseCanvasLock();
    }
  };

  const cancelRef: { cancel?: () => void } = {};
  cancelActiveRender = () => {
    if (cancelRef.cancel) {
      try {
        cancelRef.cancel();
      } catch {
        // Ignore
      }
    }
  };

  let renderPromise: Promise<PdfWorkerRenderResult> | null = null;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        // Option A: Trigger cooperative cancellation on the active render
        if (cancelActiveRender) {
          cancelActiveRender();
        }

        // Observe whether cancellation settles the task within observation window.
        // If the task truly never settles, mark worker unhealthy while retaining mutex.
        setTimeout(() => {
          if (!settled) {
            isWorkerUnhealthy = true;
            unhealthyReason = `PDF worker is unhealthy: page ${options.pageNumber} timed out after ${timeoutMs}ms and failed to settle following cancellation. Mutex is retained to prevent unsafe canvas overlap; process/worker restart required.`;
          }
        }, 50);

        reject(
          new PdfWorkerTimeoutError(
            `PDF page ${options.pageNumber} render timed out after ${timeoutMs}ms.`
          )
        );
      }, remainingTimeoutMs);
    });

    const runner = options._renderFn ?? executeRenderPage;
    renderPromise = runner(options, cancelRef);

    // GAP-009 & P1-A: Mutex & Timeout Safety
    // 1. Attach a catch handler to swallow any late rejection when timeoutPromise wins,
    //    preventing unhandledRejection events in Node.js.
    // 2. Retain the lock until renderPromise completely settles (finally), ensuring
    //    subsequent memory-heavy renders never overlap a timed-out native canvas job.
    renderPromise
      .catch(() => undefined)
      .finally(() => {
        markSettledAndRelease();
      });

    return await Promise.race([renderPromise, timeoutPromise]).finally(() => {
      if (timerId) clearTimeout(timerId);
    });
  } finally {
    // If renderPromise never started (e.g. error thrown before runner), release immediately.
    if (!renderPromise) {
      markSettledAndRelease();
    }
  }
}
