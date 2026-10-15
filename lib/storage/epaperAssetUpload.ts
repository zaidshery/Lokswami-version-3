import crypto from 'crypto';
import path from 'path';
import { parsePublishDate } from '@/lib/utils/epaperStorage';
import {
  buildDigitalOceanSpacesPublicUrl,
  createDigitalOceanSpacesBrowserUploadTarget,
  verifyDigitalOceanSpacesUploadedObject,
} from '@/lib/utils/digitalOceanSpaces';
import {
  normalizeEPaperPublicationType,
  type EPaperPublicationType,
} from '@/lib/types/epaper';
import {
  normalizePublicationCityScope,
  normalizePublicationIssueDate,
  shouldUseGlobalPublicationScope,
} from '@/lib/utils/epaperPublication';

export const EPAPER_ASSET_STORAGE_PROVIDER = 'do-spaces' as const;
export const EPAPER_ASSET_UPLOAD_EXPIRY_SECONDS = 10 * 60;
export const EPAPER_ASSET_MIN_BYTES = 1;
export const EPAPER_PDF_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const EPAPER_IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const EPAPER_AUDIO_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export const EPAPER_ASSET_KINDS = [
  'epaper_pdf',
  'epaper_thumbnail',
  'epaper_page_image',
  'epaper_story_audio',
] as const;

export type EpaperAssetKind = (typeof EPAPER_ASSET_KINDS)[number];

export type EpaperAssetUploadInitInput = {
  kind: EpaperAssetKind;
  publicationType?: EPaperPublicationType;
  fileName: string;
  fileType: string;
  fileSize: number;
  citySlug?: string;
  publishDate?: string;
  pageNumber?: number;
  articleId?: string;
};

export type EpaperUploadedAsset = {
  kind: EpaperAssetKind;
  mediaUrl: string;
  mediaKey: string;
  mediaSizeBytes: number;
  mediaMimeType: string;
  storageProvider: typeof EPAPER_ASSET_STORAGE_PROVIDER;
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a']);
const IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const AUDIO_CONTENT_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
  'application/octet-stream',
]);

const CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

function sanitizePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || fallback;
}

function sanitizeFileStem(fileName: string, fallback: string) {
  const parsed = path.parse(fileName.trim());
  return sanitizePathSegment(parsed.name || fallback, fallback).slice(0, 80);
}

function normalizeExtension(fileName: string) {
  return path.extname(fileName.trim()).toLowerCase();
}

function toPublishDateFolder(value: string) {
  const parsed = parsePublishDate(value);
  if (!parsed) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizePositiveInt(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.floor(parsed);
}

function requireEditionContext(input: EpaperAssetUploadInitInput) {
  const publicationType = normalizeEPaperPublicationType(input.publicationType);
  const scope = normalizePublicationCityScope({
    publicationType,
    citySlug: input.citySlug,
  });
  const publishDateFolder = toPublishDateFolder(
    normalizePublicationIssueDate(input.publishDate, publicationType)
  );

  if (!scope.citySlug) {
    throw new Error('Valid citySlug is required for e-paper uploads.');
  }
  if (!publishDateFolder) {
    throw new Error('Valid publishDate is required for e-paper uploads.');
  }

  return { citySlug: scope.citySlug, publicationType, publishDateFolder };
}

function resolveEditionStorageBase(input: ReturnType<typeof requireEditionContext>) {
  if (shouldUseGlobalPublicationScope(input.publicationType)) {
    return `lokswami/emagazines/${input.publishDateFolder}`;
  }

  return `lokswami/epapers/${input.citySlug}/${input.publishDateFolder}`;
}

function normalizeContentType(fileName: string, fileType: string) {
  const fromType = fileType.trim().toLowerCase();
  if (fromType) return fromType;
  return CONTENT_TYPES_BY_EXTENSION[normalizeExtension(fileName)] || 'application/octet-stream';
}

function validateFileBasics(input: EpaperAssetUploadInitInput) {
  const fileName = String(input.fileName || '').trim();
  const fileType = String(input.fileType || '').trim().toLowerCase();
  const fileSize = Number(input.fileSize || 0);

  if (!EPAPER_ASSET_KINDS.includes(input.kind)) {
    return 'Invalid e-paper asset kind.';
  }
  if (!fileName) {
    return 'File name is required.';
  }
  if (!Number.isFinite(fileSize) || fileSize < EPAPER_ASSET_MIN_BYTES) {
    return 'File size is invalid.';
  }

  const extension = normalizeExtension(fileName);
  if (input.kind === 'epaper_pdf') {
    if (extension !== '.pdf') return 'E-paper PDF must be a PDF file.';
    if (fileType && fileType !== 'application/pdf') return 'E-paper PDF must be a PDF file.';
    if (fileSize > EPAPER_PDF_UPLOAD_MAX_BYTES) return 'E-paper PDF must be 25MB or smaller.';
  }

  if (input.kind === 'epaper_thumbnail' || input.kind === 'epaper_page_image') {
    if (!IMAGE_EXTENSIONS.has(extension)) return 'E-paper images must be JPG, PNG, or WEBP.';
    if (fileType && !IMAGE_CONTENT_TYPES.has(fileType)) {
      return 'E-paper images must be JPG, PNG, or WEBP.';
    }
    if (fileSize > EPAPER_IMAGE_UPLOAD_MAX_BYTES) return 'E-paper image must be 10MB or smaller.';
  }

  if (input.kind === 'epaper_story_audio') {
    if (!AUDIO_EXTENSIONS.has(extension)) return 'Story audio must be MP3, WAV, or M4A.';
    if (fileType && !AUDIO_CONTENT_TYPES.has(fileType)) {
      return 'Story audio must be MP3, WAV, or M4A.';
    }
    if (fileSize > EPAPER_AUDIO_UPLOAD_MAX_BYTES) return 'Story audio must be 50MB or smaller.';
  }

  return null;
}

function extensionForKind(kind: EpaperAssetKind, fileName: string) {
  const extension = normalizeExtension(fileName);
  if (kind === 'epaper_pdf') return '.pdf';
  if (kind === 'epaper_thumbnail' || kind === 'epaper_page_image') {
    return IMAGE_EXTENSIONS.has(extension) ? extension : '.jpg';
  }
  if (kind === 'epaper_story_audio') {
    return AUDIO_EXTENSIONS.has(extension) ? extension : '.mp3';
  }
  return extension || '.bin';
}

function buildTimestamp(now = new Date()) {
  const date = now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  return `${date}-${crypto.randomUUID().slice(0, 8)}`;
}

export function parseEpaperAssetSize(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function validateEpaperAssetSelection(input: EpaperAssetUploadInitInput) {
  try {
    if (input.kind !== 'epaper_story_audio') {
      requireEditionContext(input);
    }
    if (input.kind === 'epaper_page_image') {
      const pageNumber = normalizePositiveInt(input.pageNumber);
      if (!pageNumber || pageNumber > 1000) {
        return 'Valid pageNumber is required for page image uploads.';
      }
    }
    if (input.kind === 'epaper_story_audio' && !String(input.articleId || '').trim()) {
      return 'articleId is required for story audio uploads.';
    }
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid e-paper upload metadata.';
  }

  return validateFileBasics(input);
}

export function buildEpaperAssetObjectKey(input: EpaperAssetUploadInitInput) {
  const validationError = validateEpaperAssetSelection(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const extension = extensionForKind(input.kind, input.fileName);
  const stem = sanitizeFileStem(input.fileName, 'asset');
  const uniqueName = `${buildTimestamp()}-${stem}${extension}`;

  if (input.kind === 'epaper_story_audio') {
    const articleSegment = sanitizePathSegment(String(input.articleId || ''), 'story');
    return `lokswami/tts/epaperArticle/${articleSegment}/manual/${uniqueName}`;
  }

  const base = resolveEditionStorageBase(requireEditionContext(input));

  if (input.kind === 'epaper_pdf') {
    return `${base}/pdf/${uniqueName}`;
  }
  if (input.kind === 'epaper_thumbnail') {
    return `${base}/thumbnail/${uniqueName}`;
  }

  const pageNumber = normalizePositiveInt(input.pageNumber);
  return `${base}/pages/${String(pageNumber).padStart(3, '0')}-${uniqueName}`;
}

export function assertValidEpaperAssetKey(kind: EpaperAssetKind, mediaKey: string) {
  const key = mediaKey.trim();
  if (!key) {
    throw new Error('Uploaded asset key is required.');
  }

  if (kind === 'epaper_story_audio') {
    if (!/^lokswami\/tts\/epaperArticle\/[^/]+\/manual\/[^/]+\.(mp3|wav|m4a)$/i.test(key)) {
      throw new Error('Uploaded story audio key is invalid.');
    }
    return;
  }

  const escapedKindPattern =
    kind === 'epaper_pdf'
      ? 'pdf\\/[^/]+\\.pdf'
      : kind === 'epaper_thumbnail'
        ? 'thumbnail\\/[^/]+\\.(jpg|jpeg|png|webp)'
        : 'pages\\/[^/]+\\.(jpg|jpeg|png|webp)';
  const pattern = new RegExp(
    `^lokswami\\/(?:epapers\\/[^/]+|emagazines(?:\\/[^/]+)?)\\/\\d{4}-\\d{2}-\\d{2}\\/${escapedKindPattern}$`,
    'i'
  );

  if (!pattern.test(key)) {
    throw new Error('Uploaded e-paper asset key is invalid.');
  }
}

export function createEpaperAssetUploadTarget(input: EpaperAssetUploadInitInput) {
  const key = buildEpaperAssetObjectKey(input);
  const contentType = normalizeContentType(input.fileName, input.fileType);
  const target = createDigitalOceanSpacesBrowserUploadTarget({
    key,
    contentType,
    expiresSeconds: EPAPER_ASSET_UPLOAD_EXPIRY_SECONDS,
  });

  return {
    kind: input.kind,
    mediaKey: target.publicId,
    mediaUrl: target.secureUrl,
    uploadUrl: target.uploadUrl,
    uploadHeaders: target.uploadHeaders,
    expiresAt: target.expiresAt,
  };
}

function isContentTypeAllowed(kind: EpaperAssetKind, contentType: string) {
  const normalized = contentType.trim().toLowerCase();
  if (!normalized) return true;
  if (kind === 'epaper_pdf') return normalized === 'application/pdf';
  if (kind === 'epaper_thumbnail' || kind === 'epaper_page_image') {
    return IMAGE_CONTENT_TYPES.has(normalized);
  }
  return AUDIO_CONTENT_TYPES.has(normalized) || normalized.startsWith('audio/');
}

export async function verifyEpaperAssetUpload(input: {
  kind: EpaperAssetKind;
  mediaKey: string;
  expectedSize?: number;
  expectedFileType?: string;
  expectedFileName?: string;
}) {
  assertValidEpaperAssetKey(input.kind, input.mediaKey);

  const expectedSize = parseEpaperAssetSize(input.expectedSize);
  const expectedFileName = String(input.expectedFileName || input.mediaKey.split('/').pop() || '');
  const selectionError = validateFileBasics({
    kind: input.kind,
    fileName: expectedFileName,
    fileType: String(input.expectedFileType || ''),
    fileSize: expectedSize || EPAPER_ASSET_MIN_BYTES,
  });
  if (selectionError) {
    throw new Error(selectionError);
  }

  const verified = await verifyDigitalOceanSpacesUploadedObject({ key: input.mediaKey });
  if (!verified.bytes || verified.bytes < EPAPER_ASSET_MIN_BYTES) {
    throw new Error('Uploaded asset size is invalid.');
  }
  if (expectedSize && Math.abs(verified.bytes - expectedSize) > 1024) {
    throw new Error('Uploaded asset size does not match the selected file.');
  }
  if (!isContentTypeAllowed(input.kind, verified.contentType)) {
    throw new Error('Uploaded asset content type is invalid.');
  }

  return {
    kind: input.kind,
    mediaUrl: buildDigitalOceanSpacesPublicUrl(input.mediaKey),
    mediaKey: verified.publicId,
    mediaSizeBytes: verified.bytes,
    mediaMimeType:
      verified.contentType ||
      normalizeContentType(expectedFileName, String(input.expectedFileType || '')),
    storageProvider: EPAPER_ASSET_STORAGE_PROVIDER,
  } satisfies EpaperUploadedAsset;
}

export {
  createEpaperUploadReceipt,
  verifyEpaperUploadReceipt,
  type EpaperUploadReceiptPayload,
} from './epaperUploadReceipt';
