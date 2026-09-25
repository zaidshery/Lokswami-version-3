import crypto from 'crypto';
import path from 'path';

type SpacesResourceType = 'image' | 'video' | 'raw' | 'auto';

type UploadBufferOptions = {
  folder?: string;
  publicId?: string;
  resourceType?: SpacesResourceType;
  overwrite?: boolean;
  originalFilename?: string;
};

export type UploadedDigitalOceanSpacesAsset = {
  secureUrl: string;
  url: string;
  publicId: string;
  resourceType: string;
  bytes: number;
  width?: number;
  height?: number;
  format?: string;
};

type ParsedDigitalOceanSpacesAsset = {
  publicId: string;
  resourceType: Exclude<SpacesResourceType, 'auto'>;
};

type SignedRawUploadUrlOptions = {
  publicId: string;
  format?: string;
};

type BrowserUploadTargetOptions = {
  key: string;
  contentType: string;
  expiresSeconds?: number;
};

type VerifyUploadedObjectOptions = {
  key: string;
};

export type DigitalOceanSpacesSignedRequest = {
  url: string;
  headers: Record<string, string>;
};

export type DigitalOceanSpacesBrowserUploadTarget = {
  publicId: string;
  secureUrl: string;
  url: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  expiresAt: string;
};

export type VerifiedDigitalOceanSpacesObject = {
  publicId: string;
  secureUrl: string;
  url: string;
  bytes: number;
  contentType: string;
};

type SpacesConfig = {
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  originHost: string;
  cdnBaseUrl: string;
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
};

function readEnv(name: string) {
  return String(process.env[name] || '').trim();
}

function getSpacesConfig(): SpacesConfig {
  const accessKey = readEnv('DIGITALOCEAN_SPACES_ACCESS_KEY');
  const secretKey = readEnv('DIGITALOCEAN_SPACES_SECRET_KEY');
  const bucket = readEnv('DIGITALOCEAN_SPACES_BUCKET').toLowerCase();
  const region = readEnv('DIGITALOCEAN_SPACES_REGION').toLowerCase();

  if (!accessKey || !secretKey || !bucket || !region) {
    throw new Error(
      'DigitalOcean Spaces environment variables are missing. Set DIGITALOCEAN_SPACES_ACCESS_KEY, DIGITALOCEAN_SPACES_SECRET_KEY, DIGITALOCEAN_SPACES_BUCKET, and DIGITALOCEAN_SPACES_REGION.'
    );
  }

  const originHost = `${bucket}.${region}.digitaloceanspaces.com`;
  const cdnBaseUrl =
    readEnv('DIGITALOCEAN_SPACES_CDN_BASE_URL') ||
    `https://${bucket}.${region}.cdn.digitaloceanspaces.com`;

  return {
    accessKey,
    secretKey,
    bucket,
    region,
    originHost,
    cdnBaseUrl,
  };
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function createSha256Hex(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function formatAmzDateParts(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${now.getUTCDate()}`.padStart(2, '0');
  const hours = `${now.getUTCHours()}`.padStart(2, '0');
  const minutes = `${now.getUTCMinutes()}`.padStart(2, '0');
  const seconds = `${now.getUTCSeconds()}`.padStart(2, '0');

  return {
    dateStamp: `${year}${month}${day}`,
    amzDate: `${year}${month}${day}T${hours}${minutes}${seconds}Z`,
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

function normalizeFolder(input = '') {
  return input
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
    .split('/')
    .map((segment) => sanitizePathSegment(segment, 'asset'))
    .filter(Boolean)
    .join('/');
}

function normalizePublicId(input: string) {
  return input
    .replace(/\\/g, '/')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
    .split('/')
    .map((segment) => sanitizePathSegment(segment, 'asset'))
    .filter(Boolean)
    .join('/');
}

export function isValidDigitalOceanSpacesObjectKey(input: string) {
  const value = input.trim();
  if (!value || value.length > 1024) return false;
  if (value.startsWith('/') || value.endsWith('/')) return false;
  if (value.includes('\\') || value.includes('\0')) return false;
  if (/%(?:2e|2f|5c)/i.test(value)) return false;

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }

  if (decoded !== value || decoded.includes('\\')) return false;

  const segments = value.split('/');
  return segments.every(
    (segment) =>
      Boolean(segment) &&
      segment !== '.' &&
      segment !== '..' &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment)
  );
}

function requireValidObjectKey(input: string) {
  if (!isValidDigitalOceanSpacesObjectKey(input)) {
    throw new Error('Invalid DigitalOcean Spaces object key');
  }
  return input.trim();
}

function sanitizePathSegment(value: string, fallback: string) {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || fallback;
}

function sanitizeFileStem(fileName: string) {
  const parsed = path.parse(fileName.trim());
  return sanitizePathSegment(parsed.name || 'asset', 'asset').slice(0, 80);
}

function normalizeExtension(fileName: string, resourceType: SpacesResourceType) {
  const ext = path.extname(fileName.trim()).toLowerCase();
  if (ext) return ext;
  if (resourceType === 'image') return '.jpg';
  if (resourceType === 'video') return '.mp4';
  if (resourceType === 'raw') return '.bin';
  return '.bin';
}

function resolveResourceType(
  resourceType: SpacesResourceType | undefined,
  fileName: string
): Exclude<SpacesResourceType, 'auto'> {
  if (resourceType && resourceType !== 'auto') return resourceType;
  const extension = normalizeExtension(fileName, 'auto');
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'raw';
}

function resolveContentType(fileName: string, resourceType: Exclude<SpacesResourceType, 'auto'>) {
  const extension = normalizeExtension(fileName, resourceType);
  return CONTENT_TYPES[extension] || (resourceType === 'image' ? 'image/jpeg' : 'application/octet-stream');
}

function buildObjectKey(options: UploadBufferOptions) {
  const fileName = options.originalFilename?.trim() || options.publicId?.split('/').pop() || 'asset';
  const extension = normalizeExtension(fileName, options.resourceType || 'auto');

  if (options.publicId) {
    const normalized = normalizePublicId(options.publicId);
    if (!normalized) {
      throw new Error('Invalid DigitalOcean Spaces object key');
    }
    return path.posix.extname(normalized) ? normalized : `${normalized}${extension}`;
  }

  const folder = normalizeFolder(options.folder || 'lokswami/uploads');
  if (!folder) {
    throw new Error('Invalid DigitalOcean Spaces folder');
  }

  const unique = crypto.randomUUID().slice(0, 8);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  return `${folder}/${timestamp}-${sanitizeFileStem(fileName)}-${unique}${extension}`;
}

function buildPublicUrl(config: SpacesConfig, key: string) {
  return `${config.cdnBaseUrl.replace(/\/+$/g, '')}/${key
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/')}`;
}

function createPresignedPutUrl(config: SpacesConfig, key: string) {
  const now = new Date();
  const { dateStamp, amzDate } = formatAmzDateParts(now);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const canonicalUri = buildCanonicalUri(key);
  const signedHeaders = 'host;x-amz-acl';
  const query = buildCanonicalQuery({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': '600',
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonicalHeaders = `host:${config.originHost}\nx-amz-acl:public-read\n`;
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

  return `https://${config.originHost}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
}

function createBrowserPresignedPutUrl(
  config: SpacesConfig,
  key: string,
  expiresSeconds: number
) {
  const now = new Date();
  const { dateStamp, amzDate } = formatAmzDateParts(now);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const canonicalUri = buildCanonicalUri(key);
  const signedHeaders = 'host;x-amz-acl';
  const query = buildCanonicalQuery({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonicalHeaders = `host:${config.originHost}\nx-amz-acl:public-read\n`;
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
    uploadUrl: `https://${config.originHost}${canonicalUri}?${query}&X-Amz-Signature=${signature}`,
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}

function createSignedObjectRequest(
  config: SpacesConfig,
  method: 'DELETE' | 'GET' | 'HEAD',
  key: string
) {
  const { dateStamp, amzDate } = formatAmzDateParts();
  const canonicalUri = buildCanonicalUri(key);
  const emptyBodyHash = createSha256Hex('');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = [
    `host:${config.originHost}`,
    `x-amz-content-sha256:${emptyBodyHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n');
  const canonicalRequest = [
    method,
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

export function createDigitalOceanSpacesBrowserUploadTarget(
  options: BrowserUploadTargetOptions
): DigitalOceanSpacesBrowserUploadTarget {
  const key = requireValidObjectKey(options.key);

  const contentType = options.contentType.trim() || 'application/octet-stream';
  const expiresSeconds = Math.max(60, Math.min(options.expiresSeconds || 600, 3600));
  const config = getSpacesConfig();
  const signed = createBrowserPresignedPutUrl(config, key, expiresSeconds);
  const publicUrl = buildPublicUrl(config, key);

  return {
    publicId: key,
    secureUrl: publicUrl,
    url: publicUrl,
    uploadUrl: signed.uploadUrl,
    uploadHeaders: {
      'Content-Type': contentType,
      'x-amz-acl': 'public-read',
    },
    expiresAt: signed.expiresAt,
  };
}

export function buildDigitalOceanSpacesPublicUrl(publicId: string) {
  const key = requireValidObjectKey(publicId);

  return buildPublicUrl(getSpacesConfig(), key);
}

export async function verifyDigitalOceanSpacesUploadedObject(
  options: VerifyUploadedObjectOptions
): Promise<VerifiedDigitalOceanSpacesObject> {
  const key = requireValidObjectKey(options.key);

  const config = getSpacesConfig();
  const request = createSignedObjectRequest(config, 'HEAD', key);
  const response = await fetch(request.url, {
    method: 'HEAD',
    headers: request.headers,
    cache: 'no-store',
  });

  if (response.status === 404) {
    throw new Error('Uploaded asset was not found in DigitalOcean Spaces.');
  }

  if (!response.ok) {
    throw new Error(`DigitalOcean Spaces HEAD failed (${response.status}).`);
  }

  const publicUrl = buildPublicUrl(config, key);
  const bytes = Number(response.headers.get('content-length') || 0);
  const contentType = String(response.headers.get('content-type') || '').trim().toLowerCase();

  return {
    publicId: key,
    secureUrl: publicUrl,
    url: publicUrl,
    bytes: Number.isFinite(bytes) ? bytes : 0,
    contentType,
  };
}

export async function uploadBufferToDigitalOceanSpaces(
  buffer: Buffer,
  options: UploadBufferOptions = {}
): Promise<UploadedDigitalOceanSpacesAsset> {
  if (!buffer.length) {
    throw new Error('Upload buffer is empty');
  }

  const config = getSpacesConfig();
  const key = buildObjectKey(options);
  const fileName = options.originalFilename?.trim() || key;
  const resourceType = resolveResourceType(options.resourceType, fileName);
  const contentType = resolveContentType(fileName, resourceType);
  const response = await fetch(createPresignedPutUrl(config, key), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-acl': 'public-read',
    },
    body: buffer as unknown as BodyInit,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(
      `DigitalOcean Spaces upload failed (${response.status})${message ? `: ${message.slice(0, 300)}` : ''}`
    );
  }

  const publicUrl = buildPublicUrl(config, key);
  const extension = normalizeExtension(key, resourceType).replace(/^\./, '');

  return {
    secureUrl: publicUrl,
    url: publicUrl,
    publicId: key,
    resourceType,
    bytes: buffer.length,
    format: extension || undefined,
  };
}

export async function deleteDigitalOceanSpacesAssetByPublicId(
  publicId: string,
  _resourceType: Exclude<SpacesResourceType, 'auto'> = 'image'
) {
  void _resourceType;

  const key = requireValidObjectKey(publicId);

  const config = getSpacesConfig();
  const request = createSignedObjectRequest(config, 'DELETE', key);
  const response = await fetch(request.url, {
    method: 'DELETE',
    headers: request.headers,
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`DigitalOcean Spaces delete failed (${response.status}).`);
  }
}

export async function hasDigitalOceanSpacesAssetByPublicId(publicId: string) {
  const key = requireValidObjectKey(publicId);

  const config = getSpacesConfig();
  const request = createSignedObjectRequest(config, 'HEAD', key);
  const response = await fetch(request.url, {
    method: 'HEAD',
    headers: request.headers,
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`DigitalOcean Spaces HEAD failed (${response.status}).`);
  }

  return true;
}

function inferResourceTypeFromKey(key: string): ParsedDigitalOceanSpacesAsset['resourceType'] {
  const extension = path.posix.extname(key).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return 'raw';
}

function parseDigitalOceanSpacesUrl(parsed: URL): ParsedDigitalOceanSpacesAsset | null {
  const host = parsed.hostname.toLowerCase();
  const isSpacesHost =
    host.endsWith('.digitaloceanspaces.com') ||
    host.endsWith('.cdn.digitaloceanspaces.com');

  if (!isSpacesHost) return null;

  const key = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, '');
  if (!key) return null;

  return {
    publicId: key,
    resourceType: inferResourceTypeFromKey(key),
  };
}

export function parseDigitalOceanSpacesAssetFromUrl(value: string): ParsedDigitalOceanSpacesAsset | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  return parseDigitalOceanSpacesUrl(parsed);
}

export function parseTrustedDigitalOceanSpacesAssetFromUrl(
  value: string
): ParsedDigitalOceanSpacesAsset | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return null;
  }

  let config;
  try {
    config = getSpacesConfig();
  } catch {
    return null;
  }
  const trustedOrigins = new Set([
    `https://${config.originHost}`,
    new URL(config.cdnBaseUrl).origin,
  ]);
  if (!trustedOrigins.has(parsed.origin)) return null;

  let key: string;
  try {
    key = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, '');
  } catch {
    return null;
  }
  if (!isValidDigitalOceanSpacesObjectKey(key)) return null;

  return {
    publicId: key,
    resourceType: inferResourceTypeFromKey(key),
  };
}

export function createDigitalOceanSpacesDownloadRequest(
  publicId: string
): DigitalOceanSpacesSignedRequest {
  const key = requireValidObjectKey(publicId);
  return createSignedObjectRequest(getSpacesConfig(), 'GET', key);
}

export async function deleteDigitalOceanSpacesAssetByUrl(value: string) {
  const parsed = parseDigitalOceanSpacesAssetFromUrl(value);
  if (!parsed) return;
  await deleteDigitalOceanSpacesAssetByPublicId(parsed.publicId, parsed.resourceType);
}

function normalizeDeliveryFormat(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.replace(/[^a-z0-9]/g, '');
}

export function buildDigitalOceanSpacesRawAssetUrl(options: SignedRawUploadUrlOptions) {
  const publicId = normalizePublicId(options.publicId || '');
  if (!publicId) {
    throw new Error('Invalid DigitalOcean Spaces object key');
  }

  const format = normalizeDeliveryFormat(options.format || '');
  const key = path.posix.extname(publicId) || !format ? publicId : `${publicId}.${format}`;
  return buildPublicUrl(getSpacesConfig(), key);
}
