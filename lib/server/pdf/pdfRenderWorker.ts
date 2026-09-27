import 'server-only';

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import v8 from 'v8';

const PDFIUM_DIST_PATH = path.join(
  process.cwd(),
  'node_modules',
  '@hyzyla',
  'pdfium',
  'dist'
);
const PDFIUM_PACKAGE_ENTRY = path.join(PDFIUM_DIST_PATH, 'index.cjs');
const PDFIUM_WASM_PATH = path.join(PDFIUM_DIST_PATH, 'pdfium.wasm');

export type PdfRendererEngine = 'pdfium' | 'pdfjs';

export function selectPdfRendererEngine(
  platform: NodeJS.Platform = process.platform
): PdfRendererEngine {
  return platform === 'win32' ? 'pdfium' : 'pdfjs';
}

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
  rendererEngine: PdfRendererEngine;
  simulateNeverSettle?: boolean;
  simulateRenderError?: string;
  simulateProcessExitCode?: number;
}

export interface IsolatedRenderResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Renderer script executed in an isolated Node.js child process.
 * Native renderer allocation and PDF execution reside entirely within this boundary.
 */
export const PDF_RENDER_WORKER_SCRIPT = `
const sharp = require('sharp');
const fs = require('node:fs');

let activeCancel = null;

const send = (message) => {
  if (typeof process.send === 'function') {
    process.send(message);
  }
};

async function executePdfJsRender(msg) {
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
        send({ type: 'canvasDisposed', id: msg.id, info: { width, height } });
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
        // Simulates an underlying native engine that never settles and ignores cancellation.
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

async function executePdfiumRender(msg) {
  let library = null;
  let document = null;
  let width = 0;
  let height = 0;
  let resourcesAllocated = false;

  try {
    if (!process.env.LOKSWAMI_PDFIUM_ENTRY || !process.env.LOKSWAMI_PDFIUM_WASM_PATH) {
      throw new Error('Local PDFium renderer assets are unavailable.');
    }

    const { PDFiumLibrary } = require(process.env.LOKSWAMI_PDFIUM_ENTRY);
    const wasmBuffer = fs.readFileSync(process.env.LOKSWAMI_PDFIUM_WASM_PATH);
    const wasmBinary = wasmBuffer.buffer.slice(
      wasmBuffer.byteOffset,
      wasmBuffer.byteOffset + wasmBuffer.byteLength
    );

    library = await PDFiumLibrary.init({ wasmBinary });
    document = await library.loadDocument(new Uint8Array(Buffer.from(msg.pdfBuffer)));

    const pageCount = document.getPageCount();
    if (msg.pageNumber < 1 || msg.pageNumber > pageCount) {
      throw new Error('Requested PDF page is outside the document page range.');
    }

    const page = document.getPage(msg.pageNumber - 1);
    const { originalWidth, originalHeight } = page.getOriginalSize();
    width = Math.round(msg.targetWidth || 3000);
    height = Math.round((width * originalHeight) / originalWidth);
    resourcesAllocated = true;

    if (msg.simulateNeverSettle) {
      // PDFium has no cooperative page-render cancellation API; timeout recovery kills this process.
      await new Promise(() => {});
    }
    if (msg.simulateRenderError) {
      throw new Error(msg.simulateRenderError);
    }

    const rendered = await page.render({
      width,
      height,
      colorSpace: 'BGRA',
      transparent: false,
    });
    // @hyzyla/pdfium 2.1.13 accepts a BGRA bitmap format but renders it with
    // FPDF_REVERSE_BYTE_ORDER, so page.render() returns RGBA bytes for canvas consumers.
    // Keep that verified order intact for Sharp; swapping red and blue here would corrupt colors.
    const rgba = Buffer.from(rendered.data);

    const normalized = await sharp(rgba, {
      raw: {
        width: rendered.width,
        height: rendered.height,
        channels: 4,
      },
    })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: msg.jpegQuality || 90, mozjpeg: true })
      .toBuffer();

    return { buffer: normalized, width: rendered.width, height: rendered.height };
  } catch (cause) {
    if (msg.simulateRenderError && cause && cause.message === msg.simulateRenderError) {
      throw cause;
    }
    const error = new Error('PDFium failed to render PDF page ' + msg.pageNumber + '.');
    error.name = 'PdfiumRenderError';
    error.code = 'PDFIUM_RENDER_FAILED';
    error.cause = cause;
    throw error;
  } finally {
    activeCancel = null;
    if (resourcesAllocated) {
      send({ type: 'canvasDisposed', id: msg.id, info: { width, height } });
    }
    if (document) {
      try {
        document.destroy();
      } catch {
        // Best-effort
      }
    }
    if (library) {
      try {
        library.destroy();
      } catch {
        // Best-effort
      }
    }
  }
}

async function executeRender(msg) {
  if (msg.rendererEngine === 'pdfium') {
    return executePdfiumRender(msg);
  }
  if (msg.rendererEngine === 'pdfjs') {
    return executePdfJsRender(msg);
  }
  throw new Error('Unsupported PDF renderer engine.');
}

process.on('message', async (msg) => {
  if (msg.type === 'render') {
    if (msg.simulateProcessExitCode) {
      process.exit(msg.simulateProcessExitCode);
    }
    try {
      const result = await executeRender(msg);
      send({ type: 'success', id: msg.id, result });
    } catch (err) {
      send({
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
 * Encapsulates PDFium/PDF.js and native image work in a child process. A process
 * boundary is required because a native access violation in a worker thread
 * terminates the entire Node.js host on Windows.
 */
export class IsolatedPdfWorker implements PdfWorkerExecutionBoundary {
  private worker: ChildProcess | null = null;
  private terminated = false;
  private activeReject: ((err: Error) => void) | null = null;
  private terminationPromise: Promise<void> | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    this.worker = spawn(process.execPath, ['-e', PDF_RENDER_WORKER_SCRIPT], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
      windowsHide: true,
      env: {
        ...process.env,
        LOKSWAMI_PDFIUM_ENTRY: PDFIUM_PACKAGE_ENTRY,
        LOKSWAMI_PDFIUM_WASM_PATH: PDFIUM_WASM_PATH,
      },
    });
    this.terminated = false;
  }

  isTerminated(): boolean {
    return (
      this.terminated ||
      this.worker === null ||
      this.worker.exitCode !== null ||
      this.worker.signalCode !== null
    );
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

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        cleanup();
        if (!this.terminated) {
          this.terminated = true;
          this.worker = null;
          const exitDetail = code !== null ? `code ${code}` : `signal ${signal || 'unknown'}`;
          reject(new Error(`PDF renderer process exited unexpectedly with ${exitDetail}`));
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

      worker.send({
        type: 'render',
        id: task.id,
        pdfBuffer: task.pdfBuffer,
        pageNumber: task.pageNumber,
        targetWidth: task.targetWidth,
        jpegQuality: task.jpegQuality,
        rendererEngine: task.rendererEngine,
        simulateNeverSettle: task.simulateNeverSettle,
        simulateRenderError: task.simulateRenderError,
        simulateProcessExitCode: task.simulateProcessExitCode,
      });
    });
  }

  cancel(taskId: number): void {
    if (this.worker && !this.terminated) {
      try {
        this.worker.send({ type: 'cancel', id: taskId });
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
        if (workerToKill.exitCode === null && workerToKill.signalCode === null) {
          const signalled = workerToKill.kill();
          if (!signalled && workerToKill.exitCode === null && workerToKill.signalCode === null) {
            throw new Error('Renderer process did not accept termination.');
          }
          await new Promise<void>((resolve, reject) => {
            if (workerToKill.exitCode !== null || workerToKill.signalCode !== null) {
              resolve();
              return;
            }
            const timer = setTimeout(() => {
              reject(new Error('Timed out waiting for renderer process termination.'));
            }, 5_000);
            workerToKill.once('exit', () => {
              clearTimeout(timer);
              resolve();
            });
            workerToKill.once('error', (error) => {
              clearTimeout(timer);
              reject(error);
            });
          });
        }
      } catch (err) {
        throw new PdfWorkerTerminationError(
          `Failed to terminate renderer process: ${(err as Error).message}`
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
