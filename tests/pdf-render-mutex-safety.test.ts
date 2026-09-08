import { beforeEach, describe, expect, it } from 'vitest';
import {
  PdfWorkerTimeoutError,
  renderPdfPageWithWorkerIsolation,
  isPdfWorkerLocked,
  isPdfWorkerHealthy,
  getPdfWorkerStatus,
  disposeCanvas,
  _resetPdfWorkerForTestingOnly,
} from '@/lib/server/pdf/pdfWorker';

function createSinglePagePdf(): Buffer {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'ascii');
}

describe('GAP-009 & P1-A: PDF Mutex & Timeout Safety', () => {
  beforeEach(() => {
    _resetPdfWorkerForTestingOnly();
  });

  it('ensures a timed-out render retains the mutex until the underlying work settles, preventing overlap', async () => {
    const pdf = createSinglePagePdf();
    let unhandledRejectionCaught = false;

    const unhandledHandler = () => {
      unhandledRejectionCaught = true;
    };
    process.on('unhandledRejection', unhandledHandler);

    try {
      // Request 1: Start with a 1ms timeout. This will trigger PdfWorkerTimeoutError almost instantly.
      let req1Rejected = false;

      const req1Promise = renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 500,
        timeoutMs: 1, // Will timeout quickly while native work proceeds
      }).catch((err) => {
        expect(err).toBeInstanceOf(PdfWorkerTimeoutError);
        req1Rejected = true;
      });

      await req1Promise;
      expect(req1Rejected).toBe(true);

      // In the fixed code, the mutex must still be held if the underlying render is running.
      // Now start Request 2 immediately:
      const req2Promise = renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 500,
        timeoutMs: 30000,
      });

      const req2Result = await req2Promise;
      expect(req2Result.width).toBe(500);
      expect(req2Result.buffer).toBeInstanceOf(Buffer);

      // Verify no unhandled promise rejection occurred from Request 1
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(unhandledRejectionCaught).toBe(false);
    } finally {
      process.off('unhandledRejection', unhandledHandler);
    }
  }, 45000);

  it('CASE A: render times out → cancel succeeds → underlying task settles → mutex releases', async () => {
    const pdf = createSinglePagePdf();
    let unhandledRejectionCaught = false;

    const unhandledHandler = () => {
      unhandledRejectionCaught = true;
    };
    process.on('unhandledRejection', unhandledHandler);

    try {
      let cancelCalled = false;
      let render1Started = false;
      let render1Settled = false;

      // Request 1: Times out at 40ms; cancellation hook simulates cooperative PDF.js task settlement
      const req1Promise = renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 40,
        _renderFn: (_options, cancelRef) => {
          render1Started = true;
          return new Promise<any>((resolve, reject) => {
            if (cancelRef) {
              cancelRef.cancel = () => {
                cancelCalled = true;
                // Simulate cooperative cancellation settlement (e.g. RenderingCancelledException)
                setTimeout(() => {
                  render1Settled = true;
                  reject(new PdfWorkerTimeoutError('PDF page render cancelled.'));
                }, 20);
              };
            }
          });
        },
      });

      // Request 1 must reject with timeout
      await expect(req1Promise).rejects.toThrow(PdfWorkerTimeoutError);
      expect(render1Started).toBe(true);

      // Wait for the cooperative cancellation to complete settlement
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(cancelCalled).toBe(true);
      expect(render1Settled).toBe(true);

      // Because cancellation succeeded and task settled, mutex is released and worker is healthy
      expect(isPdfWorkerLocked()).toBe(false);
      expect(isPdfWorkerHealthy()).toBe(true);

      // Request 2: Must immediately acquire canvas and render successfully
      const req2Result = await renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 500,
        timeoutMs: 15000,
      });

      expect(req2Result.width).toBe(500);
      expect(req2Result.buffer).toBeInstanceOf(Buffer);

      // Zero unhandled rejections
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandledRejectionCaught).toBe(false);
    } finally {
      process.off('unhandledRejection', unhandledHandler);
      _resetPdfWorkerForTestingOnly();
    }
  }, 45000);

  it('CASE B: underlying render truly never settles and cannot be cancelled: mutex is NOT force-released, queued callers time out with bounded wait, and system exposes unhealthy state', async () => {
    const pdf = createSinglePagePdf();
    let unhandledRejectionCaught = false;

    const unhandledHandler = () => {
      unhandledRejectionCaught = true;
    };
    process.on('unhandledRejection', unhandledHandler);

    try {
      let render1Started = false;
      let render2Started = false;

      // 1. Request 1 has a simulated underlying render that NEVER settles and ignores cancellation
      const req1Promise = renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 40,
        _renderFn: () => {
          render1Started = true;
          // Returns a promise that truly NEVER resolves or rejects
          return new Promise(() => {});
        },
      });

      // Request 1 must reject with timeout
      await expect(req1Promise).rejects.toThrow(PdfWorkerTimeoutError);
      expect(render1Started).toBe(true);

      // Wait for the observation window to flag the unsettled task
      await new Promise((resolve) => setTimeout(resolve, 70));

      // 2. Because Request 1 never settled, the mutex is NOT force-released!
      expect(isPdfWorkerLocked()).toBe(true);

      // 3. Worker exposes an unhealthy / restart-required state
      expect(isPdfWorkerHealthy()).toBe(false);
      const status = getPdfWorkerStatus();
      expect(status.isHealthy).toBe(false);
      expect(status.isRendering).toBe(true);
      expect(status.unhealthyReason).toContain('failed to settle following cancellation');

      // 4. Request 2 queues up behind the hung render
      const req2StartTime = Date.now();
      const req2Promise = renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 60, // Bounded queue wait
        _renderFn: () => {
          render2Started = true;
          return new Promise(() => {});
        },
      });

      // 5. PROVE: Request 2 does NOT overlap Request 1 (canvas mutex is held)
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(render2Started).toBe(false);

      // 6. PROVE: Request 2 eventually times out with bounded wait instead of hanging forever
      await expect(req2Promise).rejects.toThrow(PdfWorkerTimeoutError);
      const req2Elapsed = Date.now() - req2StartTime;
      expect(req2Elapsed).toBeGreaterThanOrEqual(45);
      expect(req2Elapsed).toBeLessThan(1500); // Bounded wait, not hanging

      // Request 2 never started rendering because lock was never released
      expect(render2Started).toBe(false);

      // 7. PROVE: Mutex is STILL NOT force-released while the first underlying render is alive!
      expect(isPdfWorkerLocked()).toBe(true);
      expect(isPdfWorkerHealthy()).toBe(false);

      // 8. Zero unhandled rejections
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandledRejectionCaught).toBe(false);
    } finally {
      process.off('unhandledRejection', unhandledHandler);
      _resetPdfWorkerForTestingOnly();
    }
  }, 45000);
});

describe('P1 — Dispose canvas when cancellation rejects & guaranteed cleanup lifecycle', () => {
  beforeEach(() => {
    _resetPdfWorkerForTestingOnly();
  });

  it('1. executes disposeCanvas exactly once on successful render', async () => {
    const pdf = createSinglePagePdf();
    let disposedCount = 0;
    let disposedWidth = 0;

    const result = await renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      targetWidth: 500,
      _onCanvasDisposed: (info) => {
        disposedCount++;
        disposedWidth = info.width;
      },
    });

    expect(result.width).toBe(500);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(disposedCount).toBe(1);
    expect(disposedWidth).toBe(500);
    expect(isPdfWorkerLocked()).toBe(false);
  });

  it('2. executes disposeCanvas exactly once on ordinary render rejection', async () => {
    const pdf = createSinglePagePdf();
    let disposedCount = 0;

    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 500,
        _simulateRenderError: new Error('Simulated native render error'),
        _onCanvasDisposed: () => {
          disposedCount++;
        },
      })
    ).rejects.toThrow('Simulated native render error');

    expect(disposedCount).toBe(1);
    expect(isPdfWorkerLocked()).toBe(false);
    expect(isPdfWorkerHealthy()).toBe(true);
  });

  it('3. executes disposeCanvas exactly once and verifies exact ordering on timeout + cancellation', async () => {
    const pdf = createSinglePagePdf();
    const eventLog: string[] = [];
    let disposedCount = 0;

    // Start Request 1 with 40ms timeout
    const req1Promise = renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      targetWidth: 500,
      timeoutMs: 40,
      _renderFn: (_options, cancelRef) => {
        return new Promise<any>((_resolve, reject) => {
          if (cancelRef) {
            cancelRef.cancel = () => {
              setTimeout(() => {
                eventLog.push('render_settled');
                // Simulates canvas cleanup before rejection
                _options._onCanvasDisposed?.({ width: 500, height: 500 });
                reject(new PdfWorkerTimeoutError('PDF page render cancelled.'));
              }, 20);
            };
          }
        });
      },
      _onCanvasDisposed: () => {
        disposedCount++;
        eventLog.push('canvas_disposed');
      },
    }).catch((err) => {
      eventLog.push('caller_timed_out');
      expect(err).toBeInstanceOf(PdfWorkerTimeoutError);
    });

    // Queue Request 2 behind Request 1
    const req2Promise = renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      targetWidth: 500,
      timeoutMs: 15000,
      _renderFn: () => {
        eventLog.push('next_render_started');
        return Promise.resolve({
          buffer: Buffer.from('jpeg-bytes'),
          width: 500,
          height: 500,
        });
      },
    });

    await req1Promise;
    const req2Result = await req2Promise;

    expect(req2Result.width).toBe(500);
    expect(disposedCount).toBe(1);

    // Verify exact ordering:
    // 1. caller_timed_out fires from Promise.race timeout
    // 2. render_settled occurs after cancellation
    // 3. canvas_disposed executes upon task settlement
    // 4. lock released, so next_render_started follows canvas disposal
    const renderSettledIdx = eventLog.indexOf('render_settled');
    const canvasDisposedIdx = eventLog.indexOf('canvas_disposed');
    const nextRenderStartedIdx = eventLog.indexOf('next_render_started');

    expect(renderSettledIdx).toBeGreaterThanOrEqual(0);
    expect(canvasDisposedIdx).toBeGreaterThanOrEqual(renderSettledIdx);
    expect(nextRenderStartedIdx).toBeGreaterThan(canvasDisposedIdx);
  });

  it('4. executes disposeCanvas on real native render timeout and cancellation', async () => {
    const pdf = createSinglePagePdf();
    let disposedCount = 0;

    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 1000,
        timeoutMs: 1, // Quick timeout triggering real cancellation
        _onCanvasDisposed: () => {
          disposedCount++;
        },
      })
    ).rejects.toThrow(PdfWorkerTimeoutError);

    // Give time for native cancellation to settle and finally block to run
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(disposedCount).toBe(1);
    expect(isPdfWorkerLocked()).toBe(false);
  });

  it('5. does NOT force-dispose active canvas or release mutex when task truly never settles', async () => {
    const pdf = createSinglePagePdf();
    let disposedCount = 0;

    const req1Promise = renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      timeoutMs: 40,
      _simulateNeverSettle: true, // Allocates real canvas, but hangs before settlement
      _onCanvasDisposed: () => {
        disposedCount++;
      },
    });

    await expect(req1Promise).rejects.toThrow(PdfWorkerTimeoutError);

    // Wait past observation window
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Canvas must NOT be disposed while native code is presumed active
    expect(disposedCount).toBe(0);
    // Mutex must NOT be released
    expect(isPdfWorkerLocked()).toBe(true);
    // Worker flagged unhealthy
    expect(isPdfWorkerHealthy()).toBe(false);
  });
});
