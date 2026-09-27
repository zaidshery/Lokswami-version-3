import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  PDF_RENDER_WORKER_SCRIPT,
  selectPdfRendererEngine,
} from '@/lib/server/pdf/pdfRenderWorker';
import {
  checkMemoryPressure,
  PdfWorkerTimeoutError,
  PdfWorkerMemoryExceededError,
  renderPdfPageWithWorkerIsolation,
} from '@/lib/server/pdf/pdfWorker';

function createPdf(pageCount = 1): Buffer {
  const pageRefs = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`);
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageCount} >>\nendobj\n`,
  ];

  for (let index = 0; index < pageCount; index += 1) {
    const pageObjectNumber = index + 3;
    const contentObjectNumber = index + 3 + pageCount;
    objects.push(
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`
    );
  }
  for (let index = 0; index < pageCount; index += 1) {
    const contentObjectNumber = index + 3 + pageCount;
    objects.push(
      `${contentObjectNumber} 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n`
    );
  }

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
  it('selects PDFium on Windows and PDF.js on non-Windows platforms', () => {
    expect(selectPdfRendererEngine('win32')).toBe('pdfium');
    expect(selectPdfRendererEngine('linux')).toBe('pdfjs');
    expect(selectPdfRendererEngine('darwin')).toBe('pdfjs');
  });

  it('loads PDFium WASM from a local file without a remote fetch path', () => {
    expect(PDF_RENDER_WORKER_SCRIPT).toContain('fs.readFileSync');
    expect(PDF_RENDER_WORKER_SCRIPT).toContain('wasmBinary');
    expect(PDF_RENDER_WORKER_SCRIPT).not.toMatch(/fetch\s*\(|https?:\/\//);
  });

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
    const pdf = createPdf();
    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        maxHeapMb: 1, // Artificially low ceiling to trigger memory guard
      })
    ).rejects.toThrowError(PdfWorkerMemoryExceededError);
  });

  it('aborts with PdfWorkerTimeoutError when execution exceeds timeout threshold', async () => {
    const pdf = createPdf();
    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        timeoutMs: 1, // 1 millisecond timeout guarantees timeout
      })
    ).rejects.toThrowError(PdfWorkerTimeoutError);
  });

  it('queues concurrent render requests sequentially through the mutex lock without memory thrashing', async () => {
    const pdf = createPdf();

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

  it('renders a valid JPEG with the PDFium override at the requested width', async () => {
    const rendered = await renderPdfPageWithWorkerIsolation({
      pdfBuffer: createPdf(),
      pageNumber: 1,
      targetWidth: 320,
      _rendererEngine: 'pdfium',
    });
    const metadata = await sharp(rendered.buffer).metadata();

    expect(rendered.width).toBe(320);
    expect(rendered.height).toBe(320);
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(320);
  }, 45_000);

  it('renders sequential PDFium pages through the same isolated worker', async () => {
    const pdf = createPdf(2);
    const first = await renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      targetWidth: 240,
      _rendererEngine: 'pdfium',
    });
    const second = await renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 2,
      targetWidth: 240,
      _rendererEngine: 'pdfium',
    });

    expect(first.width).toBe(240);
    expect(second.width).toBe(240);
    expect((await sharp(first.buffer).metadata()).format).toBe('jpeg');
    expect((await sharp(second.buffer).metadata()).format).toBe('jpeg');
  }, 45_000);

  it('keeps the PDF.js renderer available through the non-Windows override', async () => {
    const rendered = await renderPdfPageWithWorkerIsolation({
      pdfBuffer: createPdf(),
      pageNumber: 1,
      targetWidth: 240,
      _rendererEngine: 'pdfjs',
    });

    expect(rendered.width).toBe(240);
    expect((await sharp(rendered.buffer).metadata()).format).toBe('jpeg');
  }, 45_000);

  it('returns a controlled PDFium error for an invalid page', async () => {
    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: createPdf(),
        pageNumber: 2,
        targetWidth: 240,
        _rendererEngine: 'pdfium',
      })
    ).rejects.toMatchObject({
      name: 'PdfiumRenderError',
      code: 'PDFIUM_RENDER_FAILED',
      message: 'PDFium failed to render PDF page 2.',
    });
  }, 45_000);

  it('contains an abnormal native-renderer exit and allows a fresh renderer process', async () => {
    const pdf = createPdf();

    await expect(
      renderPdfPageWithWorkerIsolation({
        pdfBuffer: pdf,
        pageNumber: 1,
        _simulateProcessExitCode: 91,
      })
    ).rejects.toThrow('PDF renderer process exited unexpectedly with code 91');

    const recovered = await renderPdfPageWithWorkerIsolation({
      pdfBuffer: pdf,
      pageNumber: 1,
      targetWidth: 500,
    });

    expect(recovered.width).toBe(500);
    expect(recovered.buffer).toBeInstanceOf(Buffer);
  }, 45_000);
});
