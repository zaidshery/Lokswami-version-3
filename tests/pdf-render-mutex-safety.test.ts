import { beforeEach, describe, expect, it } from 'vitest';
import {
  PdfWorkerTimeoutError,
  PdfWorkerTerminationError,
  renderPdfPageWithWorkerIsolation,
  isPdfWorkerLocked,
  isPdfWorkerHealthy,
  getPdfWorkerStatus,
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

describe('GAP-009 & P1-A: PDF Worker Isolation, Mutex & True Hang Recovery', () => {
  beforeEach(() => {
    _resetPdfWorkerForTestingOnly();
  });

  // 1. Normal render succeeds and cleans resources
  it('1. normal render succeeds and cleans resources', async () => {
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
    expect(isPdfWorkerHealthy()).toBe(true);
  }, 45_000);

  // 2. Ordinary render rejection: resources cleaned, next render succeeds
  it('2. ordinary render rejection: resources cleaned, next render succeeds', async () => {
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

    // Next render immediately succeeds
    const nextResult = await renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      targetWidth: 500,
    });
    expect(nextResult.width).toBe(500);
    expect(nextResult.buffer).toBeInstanceOf(Buffer);
  }, 45_000);

  // 3. Cooperative timeout: cancel/settlement, cleanup, next render succeeds
  it('3. cooperative timeout: cancel/settlement, cleanup, next render succeeds', async () => {
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

      // Request 1: Times out at 40ms; cancellation hook simulates cooperative task settlement
      const req1Promise = renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 40,
        _renderFn: (_options, cancelRef) => {
          render1Started = true;
          return new Promise<any>((_resolve, reject) => {
            if (cancelRef) {
              cancelRef.cancel = () => {
                cancelCalled = true;
                setTimeout(() => {
                  render1Settled = true;
                  reject(new PdfWorkerTimeoutError('PDF page render cancelled.'));
                }, 20);
              };
            }
          });
        },
      });

      await expect(req1Promise).rejects.toThrow(PdfWorkerTimeoutError);
      expect(render1Started).toBe(true);

      // Wait for cooperative cancellation to complete settlement
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(cancelCalled).toBe(true);
      expect(render1Settled).toBe(true);

      // Mutex released and worker healthy
      expect(isPdfWorkerLocked()).toBe(false);
      expect(isPdfWorkerHealthy()).toBe(true);

      // Request 2: Renders successfully
      const req2Result = await renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 500,
        timeoutMs: 15_000,
      });

      expect(req2Result.width).toBe(500);
      expect(req2Result.buffer).toBeInstanceOf(Buffer);
      expect(unhandledRejectionCaught).toBe(false);
    } finally {
      process.off('unhandledRejection', unhandledHandler);
    }
  }, 45_000);

  // 4. NEVER-SETTLING native job: timeout occurs, execution boundary terminated, old worker dead, replacement created, next render succeeds
  it('4. never-settling native job: execution boundary is terminated, old worker dead, replacement worker created, next render succeeds', async () => {
    const pdf = createSinglePagePdf();
    let unhandledRejectionCaught = false;

    const unhandledHandler = () => {
      unhandledRejectionCaught = true;
    };
    process.on('unhandledRejection', unhandledHandler);

    try {
      // Request 1: Simulates native render that ignores cancellation and never settles
      const req1Promise = renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 40,
        _simulateNeverSettle: true,
      });

      await expect(req1Promise).rejects.toThrow(PdfWorkerTimeoutError);

      // Wait for hard-termination and recycle confirmation
      await new Promise((resolve) => setTimeout(resolve, 100));

      // After confirmed recycle, worker is healthy and mutex is unlocked
      const status = getPdfWorkerStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.isRendering).toBe(false);
      expect(status.recyclesCount).toBeGreaterThanOrEqual(1);

      // Request 2: Uses replacement worker and succeeds cleanly!
      const req2Result = await renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 500,
        timeoutMs: 15_000,
      });

      expect(req2Result.width).toBe(500);
      expect(req2Result.buffer).toBeInstanceOf(Buffer);
      expect(isPdfWorkerLocked()).toBe(false);
      expect(isPdfWorkerHealthy()).toBe(true);
      expect(unhandledRejectionCaught).toBe(false);
    } finally {
      process.off('unhandledRejection', unhandledHandler);
    }
  }, 45_000);

  // 5. No overlap: prove replacement work does NOT begin before old worker termination completes
  it('5. no overlap: prove replacement work does NOT begin before old worker termination completes', async () => {
    const pdf = createSinglePagePdf();
    const eventTimeline: string[] = [];

    // Request 1: Never settles
    const req1Promise = renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      timeoutMs: 50,
      _simulateNeverSettle: true,
    }).catch((err) => {
      eventTimeline.push('req1_timed_out');
      expect(err).toBeInstanceOf(PdfWorkerTimeoutError);
    });

    // Request 2: Queued behind Request 1
    const req2Promise = renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      targetWidth: 500,
      timeoutMs: 20_000,
    }).then((res) => {
      eventTimeline.push('req2_succeeded');
      return res;
    });

    await req1Promise;
    const req2Res = await req2Promise;

    expect(req2Res.width).toBe(500);
    expect(eventTimeline).toEqual(['req1_timed_out', 'req2_succeeded']);

    const status = getPdfWorkerStatus();
    expect(status.recyclesCount).toBeGreaterThanOrEqual(1);
    expect(isPdfWorkerLocked()).toBe(false);
    expect(isPdfWorkerHealthy()).toBe(true);
  }, 45_000);

  // 6. Queued callers remain bounded
  it('6. queued callers remain bounded: queue wait timeout rejects without hanging', async () => {
    const pdf = createSinglePagePdf();

    // Start a blocking render
    const req1Promise = renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      timeoutMs: 1500,
      _simulateNeverSettle: true,
    }).catch(() => {});

    // Request 2: Queued with a very short queue wait timeout (50ms)
    const req2StartTime = Date.now();
    const req2Promise = renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      timeoutMs: 50,
    });

    await expect(req2Promise).rejects.toThrow(PdfWorkerTimeoutError);
    const elapsed = Date.now() - req2StartTime;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(1200);

    await req1Promise;
  }, 45_000);

  // 7. Repeated hung jobs: no permanent queue wedge
  it('7. repeated hung jobs: no permanent queue wedge', async () => {
    const pdf = createSinglePagePdf();

    // Hung job 1
    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 40,
        _simulateNeverSettle: true,
      })
    ).rejects.toThrow(PdfWorkerTimeoutError);

    await new Promise((r) => setTimeout(r, 80));

    // Hung job 2
    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 40,
        _simulateNeverSettle: true,
      })
    ).rejects.toThrow(PdfWorkerTimeoutError);

    await new Promise((r) => setTimeout(r, 80));

    // Normal job 3: must succeed
    const result3 = await renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      targetWidth: 500,
      timeoutMs: 15_000,
    });

    expect(result3.width).toBe(500);
    expect(result3.buffer).toBeInstanceOf(Buffer);

    const status = getPdfWorkerStatus();
    expect(status.recyclesCount).toBeGreaterThanOrEqual(2);
    expect(isPdfWorkerLocked()).toBe(false);
    expect(isPdfWorkerHealthy()).toBe(true);
  }, 45_000);

  // 8. Worker termination failure: deterministic error, do not unsafe force-release
  it('8. worker termination failure: deterministic error, do not unsafe force-release', async () => {
    const pdf = createSinglePagePdf();

    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 30,
        _simulateNeverSettle: true,
        _simulateTerminationFailure: true,
      })
    ).rejects.toThrow(PdfWorkerTerminationError);

    // Mutex must NOT be released when termination failed
    expect(isPdfWorkerLocked()).toBe(true);
    expect(isPdfWorkerHealthy()).toBe(false);

    const status = getPdfWorkerStatus();
    expect(status.isHealthy).toBe(false);
    expect(status.isRendering).toBe(true);
    expect(status.unhealthyReason).toContain('PDF worker termination failed');
  }, 45_000);

  // 9. Disposal behavior: exact ordering on timeout + cancellation, no force disposal on hung native jobs
  it('9. disposal behavior: exact ordering on timeout + cancellation and no force-disposal on hung jobs', async () => {
    const pdf = createSinglePagePdf();
    const eventLog: string[] = [];
    let disposedCount = 0;

    // Start Request 1 with 40ms timeout and cooperative cancellation hook
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

    const renderSettledIdx = eventLog.indexOf('render_settled');
    const canvasDisposedIdx = eventLog.indexOf('canvas_disposed');
    const nextRenderStartedIdx = eventLog.indexOf('next_render_started');

    expect(renderSettledIdx).toBeGreaterThanOrEqual(0);
    expect(canvasDisposedIdx).toBeGreaterThanOrEqual(renderSettledIdx);
    expect(nextRenderStartedIdx).toBeGreaterThan(canvasDisposedIdx);
  }, 45_000);
});
