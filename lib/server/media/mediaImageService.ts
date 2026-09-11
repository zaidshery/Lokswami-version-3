import path from 'path';
import sharp from 'sharp';
import type { SpacesAdapter } from './spacesAdapter';

function replaceImageExtension(filename: string, suffix: string, extension: 'webp' | 'avif'): string {
  const stem = path.parse(filename || 'article-image').name || 'article-image';
  return `${stem}-${suffix}.${extension}`;
}

function resolveFocalCrop(input: {
  width: number;
  height: number;
  targetAspect: number;
  focalPointX: number;
  focalPointY: number;
}) {
  const sourceAspect = input.width / input.height;
  if (sourceAspect > input.targetAspect) {
    const width = Math.max(1, Math.round(input.height * input.targetAspect));
    const available = Math.max(0, input.width - width);
    return {
      left: Math.round(available * (input.focalPointX / 100)),
      top: 0,
      width,
      height: input.height,
    };
  }
  const height = Math.max(1, Math.round(input.width / input.targetAspect));
  const available = Math.max(0, input.height - height);
  return {
    left: 0,
    top: Math.round(available * (input.focalPointY / 100)),
    width: input.width,
    height,
  };
}

export class MediaImageService {
  async uploadOptimizedArticleImage(
    input: {
      buffer: Buffer;
      filename: string;
      folder: string;
      focalPointX: number;
      focalPointY: number;
    },
    spacesAdapter: SpacesAdapter
  ) {
    const normalized = await sharp(input.buffer).rotate().toBuffer();
    const metadata = await sharp(normalized).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (!width || !height) throw new Error('Could not read image dimensions');

    const primaryBuffer = await sharp(normalized)
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
    const avifBuffer = await sharp(normalized)
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .avif({ quality: 64, effort: 4 })
      .toBuffer();

    const cropSpecs = [
      { key: 'landscape16x9' as const, suffix: '16x9', width: 1600, height: 900 },
      { key: 'standard4x3' as const, suffix: '4x3', width: 1200, height: 900 },
      { key: 'square1x1' as const, suffix: '1x1', width: 1080, height: 1080 },
    ];

    const cropUploads = await Promise.all(
      cropSpecs.map(async (spec) => {
        const crop = resolveFocalCrop({
          width,
          height,
          targetAspect: spec.width / spec.height,
          focalPointX: input.focalPointX,
          focalPointY: input.focalPointY,
        });
        const buffer = await sharp(normalized)
          .extract(crop)
          .resize(spec.width, spec.height)
          .webp({ quality: 86, effort: 4 })
          .toBuffer();
        const uploaded = await spacesAdapter.uploadBuffer(buffer, {
          folder: input.folder,
          resourceType: 'image',
          originalFilename: replaceImageExtension(input.filename, spec.suffix, 'webp'),
        });
        return [spec.key, uploaded.secureUrl] as const;
      })
    );

    const [primary, avif] = await Promise.all([
      spacesAdapter.uploadBuffer(primaryBuffer, {
        folder: input.folder,
        resourceType: 'image',
        originalFilename: replaceImageExtension(input.filename, 'optimized', 'webp'),
      }),
      spacesAdapter.uploadBuffer(avifBuffer, {
        folder: input.folder,
        resourceType: 'image',
        originalFilename: replaceImageExtension(input.filename, 'optimized', 'avif'),
      }),
    ]);

    return {
      primary,
      width,
      height,
      filename: replaceImageExtension(input.filename, 'optimized', 'webp'),
      variants: {
        ...Object.fromEntries(cropUploads),
        webp: primary.secureUrl,
        avif: avif.secureUrl,
      },
    };
  }
}

export const mediaImageService = new MediaImageService();
