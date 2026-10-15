import crypto from 'crypto';
import { isValidDigitalOceanSpacesObjectKey } from '@/lib/utils/digitalOceanSpaces';

export const STORY_VIDEO_STORAGE_PROVIDER = 'do-spaces' as const;
export const STORY_VIDEO_MIN_BYTES = 1;
export const STORY_VIDEO_MAX_BYTES = Math.round(1.9 * 1024 * 1024 * 1024);
export const STORY_VIDEO_UPLOAD_EXPIRY_SECONDS = 10 * 60;

type SpacesConfig = {
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  originHost: string;
  cdnBaseUrl: string;
};

export type StoryVideoUploadInitInput = {
  fileName: string;
  fileType: string;
  fileSize: number;
  storyId?: string | null;
};

export type StoryVideoAsset = {
  mediaUrl: string;
  mediaKey: string;
  mediaSizeBytes: number;
  mediaMimeType: string;
  storageProvider: typeof STORY_VIDEO_STORAGE_PROVIDER;
};

type SignedRequestOptions = {
  method: 'GET' | 'HEAD';
  key: string;
};

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function createSha256Hex(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function createHmac(key: Buffer | string, value: string) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string) {
  const kDate = createHmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = createHmac(kDate, region);
  const kService = createHmac(kRegion, 's3');
  return createHmac(kService, 'aws4_request');
}

function getEnv(name: string) {
  return String(process.env[name] || '').trim();
}

function getSpacesConfig(): SpacesConfig {
  const accessKey = getEnv('DIGITALOCEAN_SPACES_ACCESS_KEY');
  const secretKey = getEnv('DIGITALOCEAN_SPACES_SECRET_KEY');
  const bucket = getEnv('DIGITALOCEAN_SPACES_BUCKET').toLowerCase();
  const region = getEnv('DIGITALOCEAN_SPACES_REGION').toLowerCase();

  if (!accessKey || !secretKey || !bucket || !region) {
    throw new Error(
      'DigitalOcean Spaces is not configured. Set DIGITALOCEAN_SPACES_ACCESS_KEY, DIGITALOCEAN_SPACES_SECRET_KEY, DIGITALOCEAN_SPACES_BUCKET, and DIGITALOCEAN_SPACES_REGION.'
    );
  }

  const originHost = `${bucket}.${region}.digitaloceanspaces.com`;
  const configuredCdnBaseUrl = getEnv('DIGITALOCEAN_SPACES_CDN_BASE_URL');

  return {
    accessKey,
    secretKey,
    bucket,
    region,
    originHost,
    cdnBaseUrl:
      configuredCdnBaseUrl ||
      `https://${bucket}.${region}.cdn.digitaloceanspaces.com`,
  };
}

function formatAmzDateParts(now: Date) {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${now.getUTCDate()}`.padStart(2, '0');
  const hours = `${now.getUTCHours()}`.padStart(2, '0');
  const minutes = `${now.getUTCMinutes()}`.padStart(2, '0');
  const seconds = `${now.getUTCSeconds()}`.padStart(2, '0');

  return {
    dateStamp: `${year}${month}${day}`,
    amzDate: `${year}${month}${day}T${hours}${minutes}${seconds}Z`,
    year: String(year),
    month,
    day,
  };
}

function buildCanonicalUri(key: string) {
  return `/${key.split('/').map((segment) => encodeRfc3986(segment)).join('/')}`;
}

function buildCanonicalQuery(query: Record<string, string>) {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
}

function sanitizePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || fallback;
}

function sanitizeFileStem(fileName: string) {
  const normalized = fileName.replace(/\.[^.]+$/, '');
  return sanitizePathSegment(normalized, 'video').slice(0, 40);
}

export function validateStoryVideoSelection(input: {
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}) {
  const fileName = String(input.fileName || '').trim();
  const fileType = String(input.fileType || '').trim().toLowerCase();
  const fileSize = Number(input.fileSize || 0);

  if (!fileName) return 'Video file name is required.';
  if (!fileName.toLowerCase().endsWith('.mp4')) return 'Video must be an MP4 file.';
  if (fileType && fileType !== 'video/mp4') return 'Video must be an MP4 file.';
  if (!Number.isFinite(fileSize) || fileSize <= 0) return 'Video size is invalid.';
  if (fileSize < STORY_VIDEO_MIN_BYTES) return 'Video size is invalid.';
  if (fileSize > STORY_VIDEO_MAX_BYTES) return 'Video must be 1.9 GB or smaller.';

  return null;
}

export function buildStoryVideoObjectKey(options: {
  storyId?: string | null;
  fileName: string;
  now?: Date;
}) {
  const now = options.now || new Date();
  const { year, month, day } = formatAmzDateParts(now);
  const storySegment = sanitizePathSegment(
    options.storyId || `pending-${crypto.randomUUID().slice(0, 8)}`,
    'pending'
  );
  const fileStem = sanitizeFileStem(options.fileName);
  const timestamp = `${year}${month}${day}-${`${now.getUTCHours()}`.padStart(2, '0')}${`${now.getUTCMinutes()}`.padStart(2, '0')}${`${now.getUTCSeconds()}`.padStart(2, '0')}`;
  const unique = crypto.randomUUID().slice(0, 8);

  return `stories/videos/${year}/${month}/${day}/${storySegment}-${timestamp}-${fileStem}-${unique}.mp4`;
}

export function buildStoryVideoPublicUrl(mediaKey: string) {
  const { cdnBaseUrl } = getSpacesConfig();
  return `${cdnBaseUrl.replace(/\/+$/g, '')}/${mediaKey}`;
}

function assertValidStoryVideoKey(mediaKey: string) {
  if (
    !isValidDigitalOceanSpacesObjectKey(mediaKey) ||
    !mediaKey.startsWith('stories/videos/') ||
    !mediaKey.toLowerCase().endsWith('.mp4')
  ) {
    throw new Error('Uploaded video key is invalid.');
  }
}

export function createStoryVideoUploadTarget(input: StoryVideoUploadInitInput) {
  const validationError = validateStoryVideoSelection(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const config = getSpacesConfig();
  const now = new Date();
  const { dateStamp, amzDate } = formatAmzDateParts(now);
  const key = buildStoryVideoObjectKey({
    storyId: input.storyId,
    fileName: input.fileName,
    now,
  });
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const canonicalUri = buildCanonicalUri(key);
  const signedHeaders = 'host';
  const query = buildCanonicalQuery({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(STORY_VIDEO_UPLOAD_EXPIRY_SECONDS),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonicalHeaders = `host:${config.originHost}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createSha256Hex(canonicalRequest),
  ].join('\n');
  const signature = crypto
    .createHmac('sha256', getSignatureKey(config.secretKey, dateStamp, config.region))
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    mediaKey: key,
    mediaUrl: buildStoryVideoPublicUrl(key),
    uploadUrl: `https://${config.originHost}${canonicalUri}?${query}&X-Amz-Signature=${signature}`,
    uploadHeaders: {
      'Content-Type': 'video/mp4',
    },
    expiresAt: new Date(now.getTime() + STORY_VIDEO_UPLOAD_EXPIRY_SECONDS * 1000).toISOString(),
  };
}

function buildSignedObjectRequest(options: SignedRequestOptions) {
  const config = getSpacesConfig();
  const now = new Date();
  const { dateStamp, amzDate } = formatAmzDateParts(now);
  const canonicalUri = buildCanonicalUri(options.key);
  const emptyBodyHash = createSha256Hex('');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = [
    `host:${config.originHost}`,
    `x-amz-content-sha256:${emptyBodyHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n');
  const canonicalRequest = [
    options.method,
    canonicalUri,
    '',
    `${canonicalHeaders}\n`,
    signedHeaders,
    emptyBodyHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    createSha256Hex(canonicalRequest),
  ].join('\n');
  const signature = crypto
    .createHmac('sha256', getSignatureKey(config.secretKey, dateStamp, config.region))
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    url: `https://${config.originHost}${canonicalUri}`,
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': emptyBodyHash,
      'x-amz-date': amzDate,
    },
  };
}

export function createStoryVideoDownloadRequest(mediaKey: string) {
  assertValidStoryVideoKey(mediaKey);
  return buildSignedObjectRequest({ method: 'GET', key: mediaKey });
}

export async function verifyStoryVideoUpload(mediaKey: string): Promise<StoryVideoAsset> {
  assertValidStoryVideoKey(mediaKey);

  const request = buildSignedObjectRequest({ method: 'HEAD', key: mediaKey });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: 'HEAD', headers: request.headers, cache: 'no-store',
      redirect: 'error', signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    throw new Error('Uploaded video was not found in storage.');
  }

  if (!response.ok) {
    throw new Error(`Failed to verify uploaded video (${response.status}).`);
  }

  const mediaSizeBytes = Number(response.headers.get('content-length') || 0);
  const mediaMimeType = String(response.headers.get('content-type') || '').trim().toLowerCase();

  if (!Number.isFinite(mediaSizeBytes) || mediaSizeBytes < STORY_VIDEO_MIN_BYTES) {
    throw new Error('Uploaded video size is invalid.');
  }

  if (mediaSizeBytes > STORY_VIDEO_MAX_BYTES) {
    throw new Error('Uploaded video must be 1.9 GB or smaller.');
  }

  if (mediaMimeType && mediaMimeType !== 'video/mp4') {
    throw new Error('Uploaded video must be stored as MP4.');
  }

  return {
    mediaUrl: buildStoryVideoPublicUrl(mediaKey),
    mediaKey,
    mediaSizeBytes,
    mediaMimeType: mediaMimeType || 'video/mp4',
    storageProvider: STORY_VIDEO_STORAGE_PROVIDER,
  };
}

export function parseStoryVideoSize(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
