import {
  createDigitalOceanSpacesDownloadRequest,
  isValidDigitalOceanSpacesObjectKey,
  parseTrustedDigitalOceanSpacesAssetFromUrl,
} from '@/lib/utils/digitalOceanSpaces';

export const DOWNLOAD_LIMITS = {
  image: 10 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  video: Math.round(1.9 * 1024 * 1024 * 1024),
} as const;

export class MediaDownloadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = 'MediaDownloadError';
  }
}

export function resolveTrustedObjectKey(input: { objectKey?: string; legacyUrl?: string }) {
  const explicit = String(input.objectKey || '').trim();
  if (explicit) {
    if (!isValidDigitalOceanSpacesObjectKey(explicit)) {
      throw new MediaDownloadError('Stored media key is invalid.', 409, 'MEDIA_REFERENCE_INVALID');
    }
    return explicit;
  }
  const legacyUrl = String(input.legacyUrl || '').trim();
  if (legacyUrl) {
    const parsed = parseTrustedDigitalOceanSpacesAssetFromUrl(legacyUrl);
    if (parsed?.publicId) return parsed.publicId;
  }
  throw new MediaDownloadError(
    'This legacy media reference must be migrated before it can be downloaded.',
    409,
    'MEDIA_MIGRATION_REQUIRED'
  );
}

function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number,
  abort: AbortController
) {
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const timer = setTimeout(() => {
      abort.abort();
      reject(new MediaDownloadError('Storage download timed out.', 504, 'MEDIA_DOWNLOAD_TIMEOUT'));
    }, timeoutMs);
    reader.read().then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

export async function createBoundedMediaDownload(input: {
  objectKey: string;
  maxBytes: number;
  expectedSize?: number;
  fetchImpl?: typeof fetch;
  idleTimeoutMs?: number;
  range?: string;
}) {
  let range: string | undefined;
  let rangeLength: number | undefined;
  let expectedContentRange: string | undefined;
  if (input.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(input.range);
    const size = Number(input.expectedSize || 0);
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) {
      throw new MediaDownloadError('Invalid media byte range.', 416, 'MEDIA_RANGE_INVALID');
    }
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      throw new MediaDownloadError('Unsatisfiable media byte range.', 416, 'MEDIA_RANGE_INVALID');
    }
    range = `bytes=${start}-${end}`;
    rangeLength = end - start + 1;
    expectedContentRange = `bytes ${start}-${end}/${size}`;
  }
  const signed = createDigitalOceanSpacesDownloadRequest(input.objectKey);
  const abort = new AbortController();
  const headerTimer = setTimeout(() => abort.abort(), input.idleTimeoutMs || 15_000);
  let upstream: Response;
  try {
    upstream = await (input.fetchImpl || fetch)(signed.url, {
      method: 'GET',
      headers: { ...signed.headers, ...(range ? { Range: range } : {}) },
      cache: 'no-store',
      redirect: 'error',
      signal: abort.signal,
    });
  } catch (error) {
    throw new MediaDownloadError(
      error instanceof Error && error.name === 'AbortError'
        ? 'Storage download timed out.'
        : 'Storage download failed.',
      502,
      'MEDIA_DOWNLOAD_FAILED'
    );
  } finally {
    clearTimeout(headerTimer);
  }

  if (upstream.status === 404) {
    throw new MediaDownloadError('Media was not found in storage.', 404, 'MEDIA_NOT_FOUND');
  }
  if (!upstream.ok || !upstream.body) {
    throw new MediaDownloadError(
      `Storage provider returned ${upstream.status}.`, 502, 'MEDIA_PROVIDER_ERROR'
    );
  }

  if (range && (upstream.status !== 206 || upstream.headers.get('content-range') !== expectedContentRange)) {
    abort.abort();
    throw new MediaDownloadError('Storage provider did not honor the byte range.', 502, 'MEDIA_RANGE_FAILED');
  }

  const headerLength = Number(upstream.headers.get('content-length') || 0);
  if (rangeLength && headerLength && headerLength !== rangeLength) {
    abort.abort();
    throw new MediaDownloadError('Storage byte range length is invalid.', 502, 'MEDIA_RANGE_FAILED');
  }
  const declaredForLimit = headerLength || Number(input.expectedSize || 0);
  if (Number.isFinite(declaredForLimit) && declaredForLimit > input.maxBytes) {
    abort.abort();
    throw new MediaDownloadError('Media exceeds the download size limit.', 413, 'MEDIA_TOO_LARGE');
  }

  const reader = upstream.body.getReader();
  let received = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await readWithIdleTimeout(reader, input.idleTimeoutMs || 15_000, abort);
        if (chunk.done) {
          if (rangeLength && received !== rangeLength) {
            controller.error(new MediaDownloadError('Storage byte range was truncated.', 502, 'MEDIA_RANGE_FAILED'));
            return;
          }
          controller.close();
          return;
        }
        received += chunk.value.byteLength;
        if (received > (rangeLength || input.maxBytes)) {
          abort.abort();
          await reader.cancel().catch(() => undefined);
          controller.error(new MediaDownloadError('Media exceeds the download size limit.', 413, 'MEDIA_TOO_LARGE'));
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      abort.abort();
      return reader.cancel();
    },
  });

  return { body, upstream, declaredSize: headerLength || undefined };
}
