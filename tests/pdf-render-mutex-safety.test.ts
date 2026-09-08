import { describe, expect, it } from 'vitest';
import {
  PdfWorkerTimeoutError,
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

describe('GAP-009: PDF Mutex & Timeout Safety', () => {
  it('ensures a timed-out render retains the mutex until the underlying work settles, preventing overlap', async () => {
    const pdf = createSinglePagePdf();
    let unhandledRejectionCaught = false;

    const unhandledHandler = () => {
      unhandledRejectionCaught = true;
    };
    process.on('unhandledRejection', unhandledHandler);

    try {
      // Request 1: Start with a 1ms timeout. This will trigger PdfWorkerTimeoutError almost instantly.
      const startTime = Date.now();
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
});
