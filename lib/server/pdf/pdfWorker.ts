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
}

export interface PdfWorkerRenderResult {
  buffer: Buffer;
  width: number;
  height: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_TARGET_WIDTH = 3000;
const DEFAULT_JPEG_QUALITY = 90;

// Mutex queue ensuring at most ONE heavy 3000px canvas exists in memory at any instant
let activeCanvasLock: Promise<unknown> = Promise.resolve();

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
async function executeRenderPage(options: PdfWorkerRenderOptions): Promise<PdfWorkerRenderResult> {
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

    await page.render({
      canvasContext: context as never,
      viewport,
      background: '#ffffff',
    }).promise;

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
 */
export async function renderPdfPageWithWorkerIsolation(
  options: PdfWorkerRenderOptions
): Promise<PdfWorkerRenderResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Chain into sequential concurrency mutex queue
  const previousLock = activeCanvasLock;
  let releaseLock = () => {};
  activeCanvasLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  let renderPromise: Promise<PdfWorkerRenderResult> | null = null;
  let isSettled = false;
  const markSettledAndRelease = () => {
    if (!isSettled) {
      isSettled = true;
      releaseLock();
    }
  };

  try {
    // Wait for any previously active canvas render to complete and release
    await previousLock;

    // Execute with hard timeout
    let timerId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        reject(
          new PdfWorkerTimeoutError(
            `PDF page ${options.pageNumber} render timed out after ${timeoutMs}ms.`
          )
        );
      }, timeoutMs);
    });

    renderPromise = executeRenderPage(options);

    // GAP-009: Mutex & Timeout Safety
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
    // If renderPromise never started (e.g. error thrown before executeRenderPage), release immediately.
    // Otherwise, the lock will be released when the underlying render settles.
    if (!renderPromise) {
      markSettledAndRelease();
    }
  }
}
