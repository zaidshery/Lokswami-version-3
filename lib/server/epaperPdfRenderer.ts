import 'server-only';

import { EPAPER_PDF_MAX_BYTES } from '@/lib/utils/epaperStorage';

const PDF_SIGNATURE = Buffer.from('%PDF-');
export const TARGET_WIDTH = 3000;
export const JPEG_QUALITY = 90;

import {
  renderPdfPageWithWorkerIsolation,
  PdfWorkerTimeoutError,
  PdfWorkerMemoryExceededError,
} from '@/lib/server/pdf/pdfWorker';

export { PdfWorkerTimeoutError, PdfWorkerMemoryExceededError };

function copyPdfBytes(buffer: Buffer) {
  return Uint8Array.from(buffer);
}

function hasPdfSignature(buffer: Buffer) {
  return (
    buffer.length >= PDF_SIGNATURE.length &&
    buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
  );
}

export async function downloadVerifiedEpaperPdf(pdfUrl: string) {
  const parsed = new URL(pdfUrl);
  const isSpacesAsset =
    parsed.protocol === 'https:' &&
    (parsed.hostname.endsWith('.digitaloceanspaces.com') ||
      parsed.hostname.endsWith('.cdn.digitaloceanspaces.com')) &&
    (parsed.pathname.includes('/lokswami/epapers/') ||
      parsed.pathname.includes('/lokswami/emagazines/'));

  if (!isSpacesAsset) {
    throw new Error('Only verified DigitalOcean Spaces e-paper PDFs can be processed.');
  }

  const response = await fetch(parsed, {
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`PDF download failed (${response.status}).`);
  }

  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > EPAPER_PDF_MAX_BYTES) {
    throw new Error('PDF exceeds the 25MB processing limit.');
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > EPAPER_PDF_MAX_BYTES) {
    throw new Error('PDF is empty or exceeds the 25MB processing limit.');
  }
  if (!hasPdfSignature(buffer)) {
    throw new Error('PDF signature is invalid.');
  }

  return buffer;
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

export async function getPdfPageCountFromBuffer(pdfBuffer: Buffer) {
  await installPdfCanvasGlobals();
  const pdfjs = await loadPdfJs();
  const document = await pdfjs.getDocument({
    data: copyPdfBytes(pdfBuffer),
    useSystemFonts: true,
  }).promise;
  const pageCount = document.numPages;
  await document.destroy();
  return pageCount;
}

export async function renderPdfPageToJpeg(input: {
  pdfBuffer: Buffer;
  pageNumber: number;
}) {
  return renderPdfPageWithWorkerIsolation({
    pdfBuffer: input.pdfBuffer,
    pageNumber: input.pageNumber,
    targetWidth: TARGET_WIDTH,
    jpegQuality: JPEG_QUALITY,
  });
}
