import { describe, expect, it } from 'vitest';
import {
  checkMemoryPressure,
  PdfWorkerTimeoutError,
  PdfWorkerMemoryExceededError,
  renderPdfPageWithWorkerIsolation,
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

describe('PDF worker isolation & memory guard', () => {
  it('correctly reports heap memory stats and safety limits', () => {
    const stats = checkMemoryPressure();
    expect(stats.heapUsedMb).toBeGreaterThan(0);
    expect(stats.heapLimitMb).toBeGreaterThan(0);
    expect(stats.heapPercent).toBeGreaterThanOrEqual(0);

    // If threshold is forced lower than current heap used, it must report safe = false
    const unsafeStats = checkMemoryPressure(1); // 1 MB limit
    expect(unsafeStats.safe).toBe(false);
  });

  it('instantiates typed worker errors with appropriate codes', () => {
    const timeoutErr = new PdfWorkerTimeoutError('Operation timed out');
    expect(timeoutErr.name).toBe('PdfWorkerTimeoutError');
    expect(timeoutErr.code).toBe('PDF_WORKER_TIMEOUT');
    expect(timeoutErr.message).toBe('Operation timed out');

    const memoryErr = new PdfWorkerMemoryExceededError('Out of memory');
    expect(memoryErr.name).toBe('PdfWorkerMemoryExceededError');
    expect(memoryErr.code).toBe('PDF_WORKER_MEMORY_EXCEEDED');
    expect(memoryErr.message).toBe('Out of memory');
  });

  it('aborts with PdfWorkerMemoryExceededError when memory guard ceiling is breached', async () => {
    const pdf = createSinglePagePdf();
    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        maxHeapMb: 1, // Artificially low ceiling to trigger memory guard
      })
    ).rejects.toThrowError(PdfWorkerMemoryExceededError);
  });

  it('aborts with PdfWorkerTimeoutError when execution exceeds timeout threshold', async () => {
    const pdf = createSinglePagePdf();
    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 1, // 1 millisecond timeout guarantees timeout
      })
    ).rejects.toThrowError(PdfWorkerTimeoutError);
  });

  it('queues concurrent render requests sequentially through the mutex lock without memory thrashing', async () => {
    const pdf = createSinglePagePdf();

    // Fire 2 concurrent requests
    const [first, second] = await Promise.all([
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 500, // smaller width for test speed
      }),
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        targetWidth: 500,
      }),
    ]);

    expect(first.width).toBe(500);
    expect(second.width).toBe(500);
    expect(first.buffer).toBeInstanceOf(Buffer);
    expect(second.buffer).toBeInstanceOf(Buffer);
  }, 45_000);
});
