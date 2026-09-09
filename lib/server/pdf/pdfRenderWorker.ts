import 'server-only';

import { Worker } from 'node:worker_threads';
import v8 from 'v8';

export class PdfWorkerTerminationError extends Error {
  readonly code = 'PDF_WORKER_TERMINATION_FAILED';
  constructor(message = 'Failed to terminate hung PDF worker execution boundary.') {
    super(message);
    this.name = 'PdfWorkerTerminationError';
  }
}

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

export interface IsolatedRenderTask {
  id: number;
  pdfBuffer: Buffer;
  pageNumber: number;
  targetWidth: number;
  jpegQuality: number;
  simulateNeverSettle?: boolean;
  simulateRenderError?: string;
}

export interface IsolatedRenderResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Worker thread script executed inside an isolated V8 thread.
 * Native canvas allocation and PDF.js execution reside entirely within this boundary.
 */
export const PDF_RENDER_WORKER_SCRIPT = `
const { parentPort } = require('node:worker_threads');
const sharp = require('sharp');

let activeCancel = null;

async function executeRender(msg) {

  const canvasModule = require('@napi-rs/canvas');
  globalThis.DOMMatrix = canvasModule.DOMMatrix;
  globalThis.ImageData = canvasModule.ImageData;
  globalThis.Path2D = canvasModule.Path2D;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const pdfBuffer = Buffer.from(msg.pdfBuffer);
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  }).promise;

  let width = 0;
  let height = 0;
  let canvas = null;
  let context = null;
  let canvasDisposed = false;

  const performCanvasDisposal = () => {
    if (!canvasDisposed && canvas) {
      canvasDisposed = true;
      try {
        if (context && typeof context.clearRect === 'function') {
          context.clearRect(0, 0, width, height);
        }
        canvas.width = 0;
        canvas.height = 0;
        parentPort.postMessage({ type: 'canvasDisposed', id: msg.id, info: { width, height } });
      } catch {
        // Best-effort disposal
      }
    }
  };

  try {
    if (msg.pageNumber < 1 || msg.pageNumber > doc.numPages) {
      throw new Error('PDF page ' + msg.pageNumber + ' does not exist.');
    }

    const page = await doc.getPage(msg.pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = (msg.targetWidth || 3000) / baseViewport.width;
    const viewport = page.getViewport({ scale });
    width = Math.round(viewport.width);
    height = Math.round(viewport.height);

    canvas = canvasModule.createCanvas(width, height);
    context = canvas.getContext('2d');

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      background: '#ffffff',
    });

    activeCancel = () => {
      try {
        renderTask.cancel();
      } catch {
        // Ignore
      }
    };

    try {
      if (msg.simulateNeverSettle) {
        // Simulates an underlying native engine that never settles and ignores cancellation
        await new Promise(() => {});
      }
      if (msg.simulateRenderError) {
        throw new Error(msg.simulateRenderError);
      }
      await renderTask.promise;
    } catch (renderError) {
      if (
        renderError &&
        typeof renderError === 'object' &&
        'name' in renderError &&
        renderError.name === 'RenderingCancelledException'
      ) {
        const err = new Error('PDF page render cancelled.');
        err.name = 'PdfWorkerTimeoutError';
        err.code = 'PDF_WORKER_TIMEOUT';
        throw err;
      }
      throw renderError;
    }

    const rawJpeg = canvas.toBuffer('image/jpeg', msg.jpegQuality || 90);
    performCanvasDisposal();

    const normalized = await sharp(rawJpeg)
      .jpeg({ quality: msg.jpegQuality || 90, mozjpeg: true })
      .toBuffer();

    return { buffer: normalized, width, height };
  } finally {
    performCanvasDisposal();
    activeCancel = null;
    try {
      await doc.destroy();
    } catch {
      // Best-effort
    }
  }
}

parentPort.on('message', async (msg) => {
  if (msg.type === 'render') {
    try {
      const result = await executeRender(msg);
      parentPort.postMessage({ type: 'success', id: msg.id, result });
    } catch (err) {
      parentPort.postMessage({
        type: 'error',
        id: msg.id,
        error: err.message || String(err),
        name: err.name,
        code: err.code,
      });
    }
  } else if (msg.type === 'cancel') {
    if (activeCancel) {
      activeCancel();
    }
  }
});
`;

export interface PdfWorkerExecutionBoundary {
  render(
    task: IsolatedRenderTask,
    onCanvasDisposed?: (info: { width: number; height: number }) => void
  ): Promise<IsolatedRenderResult>;
  cancel(taskId: number): void;
  terminate(simulateFailure?: boolean): Promise<void>;
  isTerminated(): boolean;
}

/**
 * Encapsulates a terminable Node.js worker_threads worker.
 */
export class IsolatedPdfWorker implements PdfWorkerExecutionBoundary {
  private worker: Worker | null = null;
  private terminated = false;
  private activeReject: ((err: Error) => void) | null = null;
  private terminationPromise: Promise<void> | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    this.worker = new Worker(PDF_RENDER_WORKER_SCRIPT, { eval: true });
    this.terminated = false;
  }

  isTerminated(): boolean {
    return this.terminated || this.worker === null;
  }

  render(
    task: IsolatedRenderTask,
    onCanvasDisposed?: (info: { width: number; height: number }) => void
  ): Promise<IsolatedRenderResult> {
    if (this.isTerminated() || !this.worker) {
      return Promise.reject(new Error('Cannot render on terminated PDF worker.'));
    }

    const worker = this.worker;
    return new Promise<IsolatedRenderResult>((resolve, reject) => {
      this.activeReject = reject;

      const onMessage = (msg: {
        type: string;
        id: number;
        result?: IsolatedRenderResult;
        error?: string;
        name?: string;
        code?: string;
        info?: { width: number; height: number };
      }) => {
        if (msg.id !== task.id) return;

        if (msg.type === 'canvasDisposed' && msg.info) {
          onCanvasDisposed?.(msg.info);
          return;
        }

        cleanup();

        if (msg.type === 'success' && msg.result) {
          resolve({
            ...msg.result,
            buffer: Buffer.isBuffer(msg.result.buffer)
              ? msg.result.buffer
              : Buffer.from(msg.result.buffer),
          });
        } else {
          const err = new Error(msg.error || 'PDF render failed');
          if (msg.name) err.name = msg.name;
          if (msg.code) (err as { code?: string }).code = msg.code;
          reject(err);
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onExit = (code: number) => {
        cleanup();
        if (!this.terminated) {
          this.terminated = true;
          this.worker = null;
          reject(new Error(`PDF worker exited unexpectedly with code ${code}`));
        }
      };

      const cleanup = () => {
        this.activeReject = null;
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      };

      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);

      worker.postMessage({
        type: 'render',
        id: task.id,
        pdfBuffer: task.pdfBuffer,
        pageNumber: task.pageNumber,
        targetWidth: task.targetWidth,
        jpegQuality: task.jpegQuality,
        simulateNeverSettle: task.simulateNeverSettle,
        simulateRenderError: task.simulateRenderError,
      });
    });
  }

  cancel(taskId: number): void {
    if (this.worker && !this.terminated) {
      try {
        this.worker.postMessage({ type: 'cancel', id: taskId });
      } catch {
        // Ignore send errors during cancellation
      }
    }
  }

  async terminate(simulateFailure = false, terminationError?: Error): Promise<void> {
    if (simulateFailure) {
      throw new PdfWorkerTerminationError('Simulated worker termination failure.');
    }

    const defaultTerminationError =
      terminationError || new PdfWorkerTimeoutError();

    if (this.terminated || !this.worker) {
      this.terminated = true;
      this.worker = null;
      if (this.activeReject) {
        this.activeReject(defaultTerminationError);
        this.activeReject = null;
      }
      return;
    }

    if (this.terminationPromise) {
      return this.terminationPromise;
    }

    const workerToKill = this.worker;
    this.terminated = true;
    this.worker = null;

    this.terminationPromise = (async () => {
      try {
        await workerToKill.terminate();
      } catch (err) {
        throw new PdfWorkerTerminationError(
          `Failed to terminate worker thread: ${(err as Error).message}`
        );
      } finally {
        if (this.activeReject) {
          this.activeReject(defaultTerminationError);
          this.activeReject = null;
        }
      }
    })();

    return this.terminationPromise;
  }
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
export function disposeCanvas(canvas: unknown, context: unknown, width: number, height: number) {
  try {
    if (
      context &&
      typeof (
        context as { clearRect?: (x: number, y: number, w: number, h: number) => void }
      ).clearRect === 'function'
    ) {
      (context as { clearRect: (x: number, y: number, w: number, h: number) => void }).clearRect(
        0,
        0,
        width,
        height
      );
    }
    if (canvas && typeof canvas === 'object') {
      const canvasObj = canvas as { width?: number; height?: number };
      canvasObj.width = 0;
      canvasObj.height = 0;
    }
  } catch {
    // Best-effort resource disposal
  }

  try {
    const gc = (globalThis as unknown as { gc?: () => void }).gc;
    if (typeof gc === 'function') {
      gc();
    }
  } catch {
    // Ignore
  }
}
