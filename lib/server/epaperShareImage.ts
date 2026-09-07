import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { isTrustedEpaperAssetPath, resolveEpaperAssetPath, EPAPER_IMAGE_MAX_BYTES } from '@/lib/utils/epaperStorage';
import { calculateEpaperHotspotCrop } from '@/lib/utils/epaperHotspotCrop';
import type { EPaperArticleHotspot } from '@/lib/types/epaper';

export const EPAPER_BRAND_VERSION = '1';

export async function loadTrustedEpaperImage(source: string): Promise<Buffer> {
  if (!isTrustedEpaperAssetPath(source)) throw new Error('Unsupported publication image.');
  const local = resolveEpaperAssetPath(source);
  if (local) {
    const stat = await fs.stat(local.absolutePath);
    if (stat.size > EPAPER_IMAGE_MAX_BYTES) throw new Error('Publication image is too large.');
    return fs.readFile(local.absolutePath);
  }
  const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok || !response.body) throw new Error('Publication image is unavailable.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > EPAPER_IMAGE_MAX_BYTES) throw new Error('Publication image is too large.');
      chunks.push(result.value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => undefined); }
}

function xml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}

/** Header/footer are embedded in the file; clipping pixels remain unobstructed. */
export async function renderBrandedEpaperImage(input: { image: Buffer; hotspot?: EPaperArticleHotspot; label: string; preview?: boolean }) {
  const upright = await sharp(input.image, { limitInputPixels: 50_000_000 }).rotate().toBuffer();
  const metadata = await sharp(upright).metadata();
  let pipeline = sharp(upright);
  if (input.hotspot) {
    const crop = calculateEpaperHotspotCrop({ pageWidth: metadata.width || 0, pageHeight: metadata.height || 0, hotspot: input.hotspot, paddingMode: 'tight' });
    pipeline = pipeline.extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height });
  }
  const clip = await pipeline.resize({ width: 1120, height: input.preview ? 410 : 6000, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  const width = 1200;
  const height = input.preview ? 630 : clip.info.height + 220;

  const icon = await sharp(path.join(process.cwd(), 'public', 'logo-header-cutout.png'))
    .resize({ width: 70, height: 70, fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });

  const wordmark = await sharp(path.join(process.cwd(), 'public', 'logo-wordmark-final.png'))
    .resize({ width: 320, height: 70, fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });

  const logo = await sharp({
    create: {
      width: icon.info.width + 16 + wordmark.info.width,
      height: 80,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: icon.data, left: 0, top: Math.floor((80 - icon.info.height) / 2) },
      { input: wordmark.data, left: icon.info.width + 16, top: Math.floor((80 - wordmark.info.height) / 2) },
    ])
    .png()
    .toBuffer();

  const footer = Buffer.from(`<svg width="1200" height="80"><rect width="1200" height="80" fill="#fff"/><text x="600" y="26" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#27272a">${xml(input.label.slice(0, 110))}</text><text x="600" y="58" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#b91c1c">Read the full publication at lokswami.com</text></svg>`);
  return sharp({ create: { width, height, channels: 4, background: '#ffffff' } }).composite([
    { input: logo, top: 15, left: 40 },
    { input: clip.data, top: 120, left: Math.floor((width - clip.info.width) / 2) },
    { input: footer, top: height - 80, left: 0 },
  ]).png().toBuffer();
}
