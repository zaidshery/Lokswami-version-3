import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBoundedMediaDownload,
  MediaDownloadError,
  resolveTrustedObjectKey,
} from '@/lib/server/media/mediaDownloadService';

describe('bounded media downloads', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.DIGITALOCEAN_SPACES_ACCESS_KEY = 'test-access';
    process.env.DIGITALOCEAN_SPACES_SECRET_KEY = 'test-secret';
    process.env.DIGITALOCEAN_SPACES_BUCKET = 'test-bucket';
    process.env.DIGITALOCEAN_SPACES_REGION = 'test-region';
  });
  afterEach(() => { process.env = { ...original }; });

  it('converts only exact configured HTTPS origins into legacy keys', () => {
    expect(resolveTrustedObjectKey({ legacyUrl: 'https://test-bucket.test-region.digitaloceanspaces.com/a/b.jpg' }))
      .toBe('a/b.jpg');
    expect(() => resolveTrustedObjectKey({ legacyUrl: 'https://test-bucket.test-region.digitaloceanspaces.com.evil/x' }))
      .toThrow(MediaDownloadError);
    expect(() => resolveTrustedObjectKey({ legacyUrl: 'http://test-bucket.test-region.digitaloceanspaces.com/x' }))
      .toThrow(MediaDownloadError);
  });

  it.each([
    'https://example.com/file.jpg',
    'http://example.com/file.jpg',
    'http://localhost/file.jpg',
    'http://127.0.0.1/file.jpg',
    'http://0.0.0.0/file.jpg',
    'http://10.0.0.1/file.jpg',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/file.jpg',
    'http://[fc00::1]/file.jpg',
    'http://[fe80::1]/file.jpg',
    'http://[::ffff:127.0.0.1]/file.jpg',
    'https://test-bucket.test-region.digitaloceanspaces.com@evil.example/file.jpg',
    'file:///etc/passwd',
  ])('never converts untrusted URL input into a fetchable key: %s', (url) => {
    expect(() => resolveTrustedObjectKey({ legacyUrl: url })).toThrow(MediaDownloadError);
  });

  it('rejects oversized Content-Length before exposing a body', async () => {
    const fetchImpl = vi.fn(async () => new Response('small', {
      status: 200, headers: { 'Content-Length': '1000' },
    }));
    await expect(createBoundedMediaDownload({
      objectKey: 'safe/file.jpg', maxBytes: 10, fetchImpl: fetchImpl as typeof fetch,
    })).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE', status: 413 });
  });

  it('enforces the actual streamed-byte limit when Content-Length is absent or false', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => new Response(stream, { status: 200 }));
    const download = await createBoundedMediaDownload({
      objectKey: 'safe/file.jpg', maxBytes: 10, fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(new Response(download.body).arrayBuffer()).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
  });

  it('allows the exact byte boundary and rejects a deceptive smaller Content-Length', async () => {
    const exact = vi.fn(async () => new Response(new Uint8Array(10), {
      status: 200, headers: { 'Content-Length': '10' },
    }));
    const accepted = await createBoundedMediaDownload({
      objectKey: 'safe/file.jpg', maxBytes: 10, fetchImpl: exact as typeof fetch,
    });
    expect((await new Response(accepted.body).arrayBuffer()).byteLength).toBe(10);

    const deceptive = vi.fn(async () => new Response(new Uint8Array(11), {
      status: 200, headers: { 'Content-Length': '1' },
    }));
    const rejected = await createBoundedMediaDownload({
      objectKey: 'safe/file.jpg', maxBytes: 10, fetchImpl: deceptive as typeof fetch,
    });
    await expect(new Response(rejected.body).arrayBuffer()).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' });
  });

  it('aborts a stalled source after the idle timeout', async () => {
    const stalled = new ReadableStream<Uint8Array>({ pull() { return new Promise(() => undefined); } });
    const fetchImpl = vi.fn(async () => new Response(stalled, { status: 200 }));
    const download = await createBoundedMediaDownload({
      objectKey: 'safe/file.jpg', maxBytes: 10, idleTimeoutMs: 10,
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(new Response(download.body).arrayBuffer()).rejects.toMatchObject({ code: 'MEDIA_DOWNLOAD_TIMEOUT' });
  });

  it('uses redirect:error and cancels on consumer abort', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const fetchImpl = vi.fn(async () => new Response(stream, { status: 200 }));
    const download = await createBoundedMediaDownload({
      objectKey: 'safe/file.jpg', maxBytes: 10, fetchImpl: fetchImpl as typeof fetch,
    });
    await download.body.cancel();
    expect(cancelled).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'error' }));
  });
});
