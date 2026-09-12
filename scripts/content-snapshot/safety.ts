import crypto from 'crypto';
import path from 'path';

export const LOKSWAMI_SOURCE_ORIGIN = 'https://lokswami.com' as const;
export const LOKSWAMI_SOURCE_HOST = 'lokswami.com' as const;
export const LOKSWAMI_MEDIA_HOSTS = new Set([
  LOKSWAMI_SOURCE_HOST,
  'lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com',
  'i.ytimg.com',
]);

export const MAX_SNAPSHOT_CONCURRENCY = 3;
export const DEFAULT_HTTP_TIMEOUT_MS = 12_000;
export const MAX_HTTP_TIMEOUT_MS = 30_000;
export const MAX_HTTP_RETRIES = 2;
export const MAX_REDIRECTS = 3;
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_PDF_BYTES = 40 * 1024 * 1024;

export type ReadMethod = 'GET' | 'HEAD';
export type SnapshotEnvironment = Record<string, string | undefined>;
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export type DownloadedAsset = {
  bytes: Uint8Array;
  contentType: string;
  sha256: string;
  finalUrl: string;
};

export function assertRealContentOptIn(
  env: SnapshotEnvironment = process.env
): void {
  if (env.LOKSWAMI_REAL_CONTENT !== 'true') {
    throw new Error(
      'Production snapshot reads are disabled. Set LOKSWAMI_REAL_CONTENT=true to proceed.'
    );
  }
}

export function assertReadMethod(method: string): asserts method is ReadMethod {
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(`Production snapshot HTTP method ${method} is prohibited; only GET and HEAD are allowed.`);
  }
}

function parseApprovedHttpsUrl(value: string | URL, allowedHosts: Set<string>): URL {
  const parsed = value instanceof URL ? new URL(value.toString()) : new URL(value);
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:') {
    throw new Error(`Snapshot URL must use HTTPS: ${parsed.origin}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Snapshot URLs must not contain credentials.');
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error(`Snapshot URL uses a prohibited port: ${parsed.port}`);
  }
  if (!allowedHosts.has(host)) {
    throw new Error(`Snapshot URL host is not allowlisted: ${host}`);
  }
  return parsed;
}

export function resolveSourceUrl(value: string): URL {
  const parsed = new URL(value, `${LOKSWAMI_SOURCE_ORIGIN}/`);
  return parseApprovedHttpsUrl(parsed, new Set([LOKSWAMI_SOURCE_HOST]));
}

export function resolveAssetUrl(value: string): URL {
  const parsed = new URL(value, `${LOKSWAMI_SOURCE_ORIGIN}/`);
  return parseApprovedHttpsUrl(parsed, LOKSWAMI_MEDIA_HOSTS);
}

export function assertSafeRedirect(
  currentUrl: string | URL,
  location: string,
  usage: 'source' | 'asset'
): URL {
  if (!location.trim()) throw new Error('Snapshot redirect is missing a Location header.');
  const next = new URL(location, currentUrl);
  return usage === 'source'
    ? parseApprovedHttpsUrl(next, new Set([LOKSWAMI_SOURCE_HOST]))
    : parseApprovedHttpsUrl(next, LOKSWAMI_MEDIA_HOSTS);
}

export function normalizeBoundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  requestedConcurrency: number,
  worker: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const concurrency = normalizeBoundedInteger(
    requestedConcurrency,
    MAX_SNAPSHOT_CONCURRENCY,
    1,
    MAX_SNAPSHOT_CONCURRENCY
  );
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker())
  );
  return results;
}

function contentType(response: Response): string {
  return String(response.headers.get('content-type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

async function readBytesWithLimit(response: Response, maximum: number): Promise<Uint8Array> {
  const declared = Number.parseInt(String(response.headers.get('content-length') || ''), 10);
  if (Number.isFinite(declared) && declared > maximum) {
    throw new Error(`Snapshot response exceeds the ${maximum}-byte size limit.`);
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximum) {
      throw new Error(`Snapshot response exceeds the ${maximum}-byte size limit.`);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error(`Snapshot response exceeds the ${maximum}-byte size limit.`);
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function validateAssetSignature(
  kind: 'image' | 'pdf',
  mimeType: string,
  bytes: Uint8Array
): void {
  if (kind === 'pdf') {
    if (mimeType !== 'application/pdf') {
      throw new Error(`Expected application/pdf but received ${mimeType || 'no content type'}.`);
    }
    if (ascii(bytes, 0, 5) !== '%PDF-') {
      throw new Error('Downloaded PDF has an invalid signature.');
    }
    return;
  }

  if (!mimeType.startsWith('image/')) {
    throw new Error(`Expected an image content type but received ${mimeType || 'none'}.`);
  }
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 &&
    bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a;
  const isGif = ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a';
  const isWebp = ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
  const brand = ascii(bytes, 8, 4);
  const isIsoImage = ascii(bytes, 4, 4) === 'ftyp' &&
    ['avif', 'avis', 'heic', 'heix', 'mif1'].includes(brand);

  const validForMime =
    (mimeType === 'image/jpeg' && isJpeg) ||
    (mimeType === 'image/png' && isPng) ||
    (mimeType === 'image/gif' && isGif) ||
    (mimeType === 'image/webp' && isWebp) ||
    ((mimeType === 'image/avif' || mimeType === 'image/heic') && isIsoImage);
  if (!validForMime) {
    throw new Error(`Downloaded image signature does not match ${mimeType}.`);
  }
}

export function safeAssetFilename(sourceUrl: string, mimeType: string): string {
  const parsed = resolveAssetUrl(sourceUrl);
  const rawBase = decodeURIComponent(parsed.pathname.split('/').pop() || 'asset')
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'asset';
  const stem = rawBase.replace(/\.[^.]+$/, '').slice(0, 64) || 'asset';
  const extensionByType: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/heic': '.heic',
    'application/pdf': '.pdf',
  };
  const extension = extensionByType[mimeType.toLowerCase()];
  if (!extension) throw new Error(`Cannot create a filename for unsupported content type ${mimeType}.`);
  const digest = crypto.createHash('sha256').update(parsed.toString()).digest('hex').slice(0, 16);
  return `${stem}-${digest}${extension}`;
}

export function resolveWithinRoot(root: string, ...segments: string[]): string {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, ...segments);
  const relative = path.relative(absoluteRoot, target);
  if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) return target;
  throw new Error('Snapshot path traversal attempt rejected.');
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class ReadOnlyLokswamiHttpClient {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly maxRedirects: number;

  constructor(options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    retries?: number;
    maxRedirects?: number;
  } = {}) {
    this.fetchImpl = options.fetchImpl || fetch;
    this.timeoutMs = normalizeBoundedInteger(
      options.timeoutMs,
      DEFAULT_HTTP_TIMEOUT_MS,
      100,
      MAX_HTTP_TIMEOUT_MS
    );
    this.retries = normalizeBoundedInteger(options.retries, MAX_HTTP_RETRIES, 0, MAX_HTTP_RETRIES);
    this.maxRedirects = normalizeBoundedInteger(options.maxRedirects, MAX_REDIRECTS, 0, MAX_REDIRECTS);
  }

  private async request(
    input: string | URL,
    options: { method: ReadMethod; usage: 'source' | 'asset' }
  ): Promise<Response> {
    assertReadMethod(options.method);
    const initialUrl = options.usage === 'source'
      ? resolveSourceUrl(String(input))
      : resolveAssetUrl(String(input));
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        let currentUrl = initialUrl;
        for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeoutMs);
          let response: Response;
          try {
            response = await this.fetchImpl(currentUrl, {
              method: options.method,
              redirect: 'manual',
              signal: controller.signal,
              headers: {
                Accept: options.usage === 'source' ? 'application/json' : 'image/*, application/pdf',
                'User-Agent': 'LokSwami-Local-QA-Snapshot/1.0 (+https://lokswami.com)',
              },
            });
          } finally {
            clearTimeout(timer);
          }

          if (!isRedirectStatus(response.status)) {
            if (isRetryableStatus(response.status) && attempt < this.retries) {
              throw new Error(`Retryable snapshot response ${response.status}.`);
            }
            return response;
          }

          if (redirectCount === this.maxRedirects) {
            throw new Error(`Snapshot redirect limit of ${this.maxRedirects} exceeded.`);
          }
          currentUrl = assertSafeRedirect(
            currentUrl,
            String(response.headers.get('location') || ''),
            options.usage
          );
        }
      } catch (error) {
        lastError = error;
        if (attempt >= this.retries) break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Snapshot request failed.');
  }

  async getJson<T = unknown>(url: string | URL): Promise<T> {
    const response = await this.request(url, { method: 'GET', usage: 'source' });
    if (!response.ok) throw new Error(`Snapshot API returned HTTP ${response.status}.`);
    const mimeType = contentType(response);
    if (mimeType !== 'application/json' && !mimeType.endsWith('+json')) {
      throw new Error(`Snapshot API returned unsupported content type ${mimeType || 'none'}.`);
    }
    const bytes = await readBytesWithLimit(response, MAX_JSON_BYTES);
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch {
      throw new Error('Snapshot API returned invalid JSON.');
    }
  }

  async head(url: string | URL, usage: 'source' | 'asset' = 'source'): Promise<Response> {
    return this.request(url, { method: 'HEAD', usage });
  }

  async getAsset(url: string | URL, kind: 'image' | 'pdf'): Promise<DownloadedAsset> {
    const response = await this.request(url, { method: 'GET', usage: 'asset' });
    if (!response.ok) throw new Error(`Snapshot asset returned HTTP ${response.status}.`);
    const mimeType = contentType(response);
    const bytes = await readBytesWithLimit(
      response,
      kind === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES
    );
    validateAssetSignature(kind, mimeType, bytes);
    return {
      bytes,
      contentType: mimeType,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      finalUrl: response.url || String(url),
    };
  }
}
