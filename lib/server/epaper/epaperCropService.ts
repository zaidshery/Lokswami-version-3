import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { canEditEpaper } from '@/lib/auth/permissions';
import { buildEpaperCropOcrImageSource } from '@/lib/server/epaperOcrPreprocess';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
import { uploadBufferToDigitalOceanSpaces } from '@/lib/utils/digitalOceanSpaces';
import { calculateEpaperHotspotCrop, type EpaperHotspotCropPaddingMode } from '@/lib/utils/epaperHotspotCrop';
import { formatPublishDateFolder, isTrustedEpaperAssetPath, resolveEpaperAssetPath } from '@/lib/utils/epaperStorage';
import { asObject, toPositiveInt } from './epaperMapper';
import { epaperRepository, EpaperRepository } from './epaperRepository';
import { EpaperConflictError, EpaperForbiddenError, EpaperNotFoundError, EpaperValidationError, InvalidEpaperIdError, type AdminSessionIdentity } from './epaperTypes';

function paddingMode(value: unknown): EpaperHotspotCropPaddingMode {
  return value === 'normal' || value === 'loose' ? value : 'tight';
}

function fileStem(value: string, fallback: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || fallback;
}

async function loadImage(imagePath: string) {
  const value = imagePath.trim();
  if (!value) throw new EpaperValidationError('Page image is missing.');
  const data = /^data:image\/(?:png|jpe?g|webp);base64,([\s\S]+)$/i.exec(value);
  if (data) return Buffer.from(data[1], 'base64');
  if (/^https?:\/\//i.test(value)) {
    if (!isTrustedEpaperAssetPath(value)) throw new EpaperValidationError('Page image URL is not a trusted e-paper asset.');
    const response = await fetch(value, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Page image fetch failed with status ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  }
  const resolved = resolveEpaperAssetPath(value);
  if (!resolved) throw new EpaperValidationError('Page image path is not supported for server-side cropping.');
  return fs.readFile(resolved.absolutePath);
}

export class EpaperCropService {
  constructor(private readonly repo: EpaperRepository = epaperRepository) {}

  async crop(actor: AdminSessionIdentity, id: string, body: unknown) {
    if (!canEditEpaper(actor.role)) throw new EpaperForbiddenError();
    if (!this.repo.isValidId(id)) throw new InvalidEpaperIdError();
    const source = asObject(body); const pageNumber = toPositiveInt(source.pageNumber);
    if (!pageNumber) throw new EpaperValidationError('pageNumber is required');
    await this.repo.connect();
    const paper = await this.repo.findEditionById(id, '_id title citySlug publishDate pages pageCount status productionStatus');
    if (!paper) throw new EpaperNotFoundError();
    try { assertEpaperDraftEditable(paper); } catch (error) { throw new EpaperConflictError(error instanceof Error ? error.message : 'Edition is immutable.'); }
    if (pageNumber > Number(paper.pageCount || 0)) throw new EpaperValidationError(`pageNumber must be between 1 and ${paper.pageCount}`);
    const pages = Array.isArray(paper.pages) ? paper.pages.map(asObject) : [];
    const page = pages.find((entry) => Number(entry.pageNumber) === pageNumber);
    const imagePath = String(page?.imagePath || '').trim();
    if (!imagePath) throw new EpaperValidationError(`Page ${pageNumber} image is missing`);
    const buffer = await loadImage(imagePath); const metadata = await sharp(buffer).metadata();
    const mode = paddingMode(source.paddingMode);
    const hotspotSource = asObject(source.hotspot);
    const crop = calculateEpaperHotspotCrop({ pageWidth: Number(metadata.width || page?.width || 0), pageHeight: Number(metadata.height || page?.height || 0),
      hotspot: { x: Number(hotspotSource.x), y: Number(hotspotSource.y), w: Number(hotspotSource.w), h: Number(hotspotSource.h) }, paddingMode: mode });
    const cropped = await sharp(buffer).extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height }).webp({ quality: 92 }).toBuffer();
    const ocr = source.includeOcrSource ? await buildEpaperCropOcrImageSource(buffer, crop) : null;
    const publishDate = paper.publishDate instanceof Date ? paper.publishDate : new Date(String(paper.publishDate || ''));
    if (Number.isNaN(publishDate.getTime())) throw new EpaperValidationError('E-paper publish date is invalid');
    const city = fileStem(String(paper.citySlug || ''), 'city'); const title = typeof source.title === 'string' ? source.title : '';
    const filename = `${String(pageNumber).padStart(3, '0')}-${fileStem(title || String(paper.title || ''), `page-${pageNumber}-crop`)}.webp`;
    const uploaded = await uploadBufferToDigitalOceanSpaces(cropped, { folder: path.posix.join('lokswami', 'epapers', city, formatPublishDateFolder(publishDate), 'clips'), resourceType: 'image', originalFilename: filename });
    return { success: true, coverImagePath: uploaded.secureUrl, width: crop.width, height: crop.height, paddingMode: mode,
      data: { coverImagePath: uploaded.secureUrl, width: crop.width, height: crop.height, paddingMode: mode, crop,
        ocrImageSource: ocr?.dataUrl, ocrImageWidth: ocr?.width, ocrImageHeight: ocr?.height } };
  }
}

export const epaperCropService = new EpaperCropService();
