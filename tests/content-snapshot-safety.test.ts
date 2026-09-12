import {
  assertReadMethod,
  assertRealContentOptIn,
  mapWithConcurrency,
  ReadOnlyLokswamiHttpClient,
  resolveAssetUrl,
  resolveSourceUrl,
  resolveWithinRoot,
  safeAssetFilename,
  validateAssetSignature,
} from '@/scripts/content-snapshot/safety';
import { vi } from 'vitest';

describe('real-content snapshot safety boundary', () => {
  it('requires an exact explicit production-read opt-in', () => {
    expect(() => assertRealContentOptIn({})).toThrow(/LOKSWAMI_REAL_CONTENT=true/);
    expect(() => assertRealContentOptIn({ LOKSWAMI_REAL_CONTENT: 'TRUE' })).toThrow();
    expect(() => assertRealContentOptIn({ LOKSWAMI_REAL_CONTENT: 'true' })).not.toThrow();
  });

  it('permits only GET and HEAD', () => {
    expect(() => assertReadMethod('GET')).not.toThrow();
    expect(() => assertReadMethod('HEAD')).not.toThrow();
    expect(() => assertReadMethod('POST')).toThrow(/prohibited/);
    expect(() => assertReadMethod('DELETE')).toThrow(/prohibited/);
  });

  it('locks API and media URLs to explicit HTTPS hosts', () => {
    expect(resolveSourceUrl('/api/v1/public/articles').hostname).toBe('lokswami.com');
    expect(() => resolveSourceUrl('https://www.lokswami.com/api')).toThrow(/not allowlisted/);
    expect(() => resolveSourceUrl('http://lokswami.com/api')).toThrow(/HTTPS/);
    expect(resolveAssetUrl('https://i.ytimg.com/vi/test/hqdefault.jpg').hostname).toBe('i.ytimg.com');
    expect(resolveAssetUrl('https://lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com/x.jpg').hostname)
      .toBe('lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com');
    expect(() => resolveAssetUrl('https://example.com/x.jpg')).toThrow(/not allowlisted/);
  });

  it('rejects redirects outside the relevant allowlist before following them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://example.com/stolen.json' } })
    );
    const client = new ReadOnlyLokswamiHttpClient({ fetchImpl: fetchMock, retries: 0 });
    await expect(client.getJson('https://lokswami.com/api/v1/public/articles')).rejects.toThrow(
      /not allowlisted/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
  });

  it('checks response MIME, declared size, and file signatures', async () => {
    const htmlMock = vi.fn().mockResolvedValue(
      new Response('<html>not json</html>', { headers: { 'content-type': 'text/html' } })
    );
    await expect(
      new ReadOnlyLokswamiHttpClient({ fetchImpl: htmlMock, retries: 0 }).getJson(
        'https://lokswami.com/api/v1/public/articles'
      )
    ).rejects.toThrow(/unsupported content type/);

    const oversizedMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
        headers: { 'content-type': 'image/jpeg', 'content-length': String(13 * 1024 * 1024) },
      })
    );
    await expect(
      new ReadOnlyLokswamiHttpClient({ fetchImpl: oversizedMock, retries: 0 }).getAsset(
        'https://i.ytimg.com/vi/test/hqdefault.jpg',
        'image'
      )
    ).rejects.toThrow(/size limit/);

    expect(() => validateAssetSignature('pdf', 'application/pdf', new TextEncoder().encode('<html>')))
      .toThrow(/invalid signature/);
    expect(() => validateAssetSignature('image', 'image/jpeg', new TextEncoder().encode('<html>')))
      .toThrow(/does not match/);
  });

  it('generates deterministic traversal-safe asset paths', () => {
    const filename = safeAssetFilename(
      'https://i.ytimg.com/vi/test/../../hqdefault.jpg?token=ignored',
      'image/jpeg'
    );
    expect(filename).toMatch(/^hqdefault-[a-f0-9]{16}\.jpg$/);
    expect(filename).not.toContain('..');
    expect(() => resolveWithinRoot('C:\\safe-root', '..', 'escape.txt')).toThrow(/traversal/);
  });

  it('never runs more than three concurrent snapshot workers', async () => {
    let active = 0;
    let maximum = 0;
    const values = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 99, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(values).toEqual([2, 4, 6, 8, 10, 12]);
    expect(maximum).toBeLessThanOrEqual(3);
  });
});
