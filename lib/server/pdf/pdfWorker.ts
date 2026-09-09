import 'server-only';

import {
  IsolatedPdfWorker,
  PdfWorkerExecutionBoundary,
  PdfWorkerTerminationError,
  PdfWorkerTimeoutError,
  PdfWorkerMemoryExceededError,
  checkMemoryPressure,
  disposeCanvas,
} from '@/lib/server/pdf/pdfRenderWorker';

export {
  PdfWorkerTerminationError,
  PdfWorkerTimeoutError,
  PdfWorkerMemoryExceededError,
  checkMemoryPressure,
  disposeCanvas,
};

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
  _onCanvasDisposed?: (info: { width: number; height: number }) => void;
  _simulateRenderError?: Error;
  _simulateNeverSettle?: boolean;
  _simulateTerminationFailure?: boolean;
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

// Mutex queue ensuring at most ONE heavy canvas render exists across threads/processes
let activeWorker: IsolatedPdfWorker | null = null;
let isRendering = false;
let isWorkerUnhealthy = false;
let unhealthyReason: string | null = null;
let recyclesCount = 0;
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
  recyclesCount: number;
} {
  return {
    isRendering,
    isHealthy: !isWorkerUnhealthy,
    unhealthyReason,
    queueLength: waitQueue.length,
    recyclesCount,
  };
}

/**
 * STRICTLY TEST-ONLY: Clear in-memory state and terminate active worker between tests.
 */
export function _resetPdfWorkerForTestingOnly(): void {
  if (activeWorker) {
    try {
      activeWorker.terminate().catch(() => {});
    } catch {
      // Ignore
    }
    activeWorker = null;
  }
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

// Deprecated aliases strictly for backwards-compatible test teardowns
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
  drainWaitQueue();
}

/**
 * Adapter boundary for test mocks when _renderFn is passed in options.
 */
class MockPdfWorkerBoundary implements PdfWorkerExecutionBoundary {
  private terminated = false;
  private cancelFn?: () => void;

  constructor(
    private renderFn: (
      options: PdfWorkerRenderOptions,
      cancelRef?: { cancel?: () => void }
    ) => Promise<PdfWorkerRenderResult>,
    private options: PdfWorkerRenderOptions
  ) {}

  render(
    task?: unknown,
    onCanvasDisposed?: (info: { width: number; height: number }) => void
  ): Promise<PdfWorkerRenderResult> {
    void task;
    void onCanvasDisposed;
    if (this.terminated) {
      return Promise.reject(new Error('Cannot render on terminated mock worker.'));
    }
    const cancelRef: { cancel?: () => void } = {};
    const promise = this.renderFn(this.options, cancelRef);
    this.cancelFn = cancelRef.cancel;
    return promise;
  }

  cancel(): void {
    if (this.cancelFn && !this.terminated) {
      try {
        this.cancelFn();
      } catch {
        // Ignore
      }
    }
  }

  async terminate(simulateFailure = false): Promise<void> {
    if (simulateFailure) {
      throw new PdfWorkerTerminationError('Simulated worker termination failure.');
    }
    this.terminated = true;
  }

  isTerminated(): boolean {
    return this.terminated;
  }
}

/**
 * Public isolated worker function:
 * - Enforces single-canvas concurrency mutex
 * - Enforces runtime memory checks
 * - Enforces execution timeout
 * - Dedicated terminable execution boundary (Node.js worker_threads)
 * - True hang recovery: hard-terminates never-settling workers, confirms termination,
 *   and creates fresh replacement workers with zero overlapping native renders.
 */
export async function renderPdfPageWithWorkerIsolation(
  options: PdfWorkerRenderOptions
): Promise<PdfWorkerRenderResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 1. Runtime memory pressure verification before acquiring lock
  const memoryStatus = checkMemoryPressure(options.maxHeapMb);
  if (!memoryStatus.safe) {
    throw new PdfWorkerMemoryExceededError(
      `Cannot render PDF page ${options.pageNumber}: heap usage is at ${memoryStatus.heapUsedMb}MB (${memoryStatus.heapPercent}% of limit).`
    );
  }

  const startTime = Date.now();

  // 2. Acquire mutex with bounded queue-wait timeout
  const reqId = await acquireCanvasLock(timeoutMs, options.pageNumber);

  // 3. Compute remaining execution timeout after queue wait
  const elapsedQueueTime = Date.now() - startTime;
  const remainingTimeoutMs = Math.max(1, timeoutMs - elapsedQueueTime);

  let timerId: NodeJS.Timeout | null = null;
  let settled = false;

  const markSettledAndRelease = () => {
    if (!settled) {
      settled = true;
      if (!isWorkerUnhealthy) {
        releaseCanvasLock();
      }
    }
  };

  let boundary: PdfWorkerExecutionBoundary;

  if (options._renderFn) {
    boundary = new MockPdfWorkerBoundary(options._renderFn, options);
  } else {
    if (!activeWorker || activeWorker.isTerminated()) {
      activeWorker = new IsolatedPdfWorker();
    }
    boundary = activeWorker;
  }

  let renderPromise: Promise<PdfWorkerRenderResult> | null = null;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(async () => {
        // Step A: Trigger cooperative cancellation signal
        try {
          boundary.cancel(reqId);
        } catch {
          // Ignore
        }

        // Step B: Wait observation window for cooperative settlement
        let taskSettledCooperatively = false;
        if (renderPromise) {
          taskSettledCooperatively = await Promise.race([
            renderPromise.then(() => true).catch(() => true),
            new Promise<false>((resolve) => setTimeout(() => resolve(false), 50)),
          ]);
        }

        if (!taskSettledCooperatively) {
          // Step C: True Hang Recovery
          // Native render failed to settle after cancellation.
          // Hard-terminate the isolated worker execution boundary.
          try {
            if (options._simulateTerminationFailure) {
              throw new PdfWorkerTerminationError('Simulated worker termination failure.');
            }
            await boundary.terminate();
            // Confirmed terminated: old worker is dead and native memory is reclaimed.
            if (boundary === activeWorker) {
              activeWorker = null;
            }
            recyclesCount++;
            isWorkerUnhealthy = false;
            unhealthyReason = null;
            markSettledAndRelease();
          } catch (termErr) {
            // Termination failed: unsafe to release slot, worker marked unhealthy
            isWorkerUnhealthy = true;
            unhealthyReason = `PDF worker termination failed: ${(termErr as Error).message}`;
            reject(
              termErr instanceof PdfWorkerTerminationError
                ? termErr
                : new PdfWorkerTerminationError((termErr as Error).message)
            );
            return;
          }
        }

        reject(
          new PdfWorkerTimeoutError(
            `PDF page ${options.pageNumber} render timed out after ${timeoutMs}ms.`
          )
        );
      }, remainingTimeoutMs);
    });

    renderPromise = boundary.render(
      {
        id: reqId,
        pdfBuffer: options.pdfBuffer,
        pageNumber: options.pageNumber,
        targetWidth: options.targetWidth ?? DEFAULT_TARGET_WIDTH,
        jpegQuality: options.jpegQuality ?? DEFAULT_JPEG_QUALITY,
        simulateNeverSettle: options._simulateNeverSettle,
        simulateRenderError: options._simulateRenderError?.message,
      },
      options._onCanvasDisposed
    );

    // Retain mutex until render completes OR hung worker is confirmed terminated
    renderPromise
      .catch(() => undefined)
      .finally(() => {
        markSettledAndRelease();
      });

    return await Promise.race([renderPromise, timeoutPromise]).finally(() => {
      if (timerId) clearTimeout(timerId);
    });
  } finally {
    if (!renderPromise) {
      markSettledAndRelease();
    }
  }
}
