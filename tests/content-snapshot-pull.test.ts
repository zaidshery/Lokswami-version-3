import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import articleDetail from '@/tests/fixtures/content-snapshot/article-detail.json';
import articleList from '@/tests/fixtures/content-snapshot/articles-list.json';
import breaking from '@/tests/fixtures/content-snapshot/breaking.json';
import epapers from '@/tests/fixtures/content-snapshot/epapers.json';
import homeFeed from '@/tests/fixtures/content-snapshot/home-feed.json';
import shorts from '@/tests/fixtures/content-snapshot/shorts.json';
import videos from '@/tests/fixtures/content-snapshot/videos.json';
import { pullContentSnapshot } from '@/scripts/content-snapshot/pull';
import { ReadOnlyLokswamiHttpClient, type FetchLike } from '@/scripts/content-snapshot/safety';
import { ContentSnapshotStore } from '@/scripts/content-snapshot/store';
import { vi } from 'vitest';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
}

function imageResponse(url: string) {
  if (url.endsWith('.png')) {
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
      headers: { 'content-type': 'image/png' },
    });
  }
  if (url.endsWith('.webp')) {
    return new Response(new TextEncoder().encode('RIFF0000WEBP'), {
      headers: { 'content-type': 'image/webp' },
    });
  }
  return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
    headers: { 'content-type': 'image/jpeg' },
  });
}

describe('content snapshot pull orchestration', () => {
  it('writes only a local manifest/assets and records an orphan short as unsupported', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lokswami-content-snapshot-'));
    try {
      const requestedUrls: string[] = [];
      const fetchHandler: FetchLike = async (input, init) => {
        const url = String(input);
        requestedUrls.push(url);
        expect(init?.method).toBe('GET');
        if (url.includes('/api/v1/public/articles?')) return jsonResponse(articleList);
        if (url.includes('/api/v1/public/articles/indore-water-project')) return jsonResponse(articleDetail);
        if (url.includes('/api/v1/public/articles/state-policy-briefing')) {
          return jsonResponse({ success: true, data: { article: articleList.data.items[1] } });
        }
        if (url.includes('/api/v1/public/breaking')) return jsonResponse(breaking);
        if (url.includes('/api/v1/public/videos')) return jsonResponse(videos);
        if (url.includes('/api/v1/public/shorts')) return jsonResponse(shorts);
        if (url.includes('/api/v1/public/epapers')) return jsonResponse(epapers);
        if (url.includes('/api/v1/public/home-feed')) return jsonResponse(homeFeed);
        if (url.endsWith('.pdf')) {
          return new Response(new TextEncoder().encode('%PDF-1.4\n%%EOF'), {
            headers: { 'content-type': 'application/pdf' },
          });
        }
        return imageResponse(url);
      };
      const fetchImpl = vi.fn(fetchHandler);
      const store = new ContentSnapshotStore(root);
      const client = new ReadOnlyLokswamiHttpClient({ fetchImpl, retries: 0 });
      const manifest = await pullContentSnapshot({
        env: { LOKSWAMI_REAL_CONTENT: 'true' },
        capturedAt: '2026-09-11T00:00:00.000Z',
        limits: { articles: 2, breaking: 1, videos: 1, shorts: 2, epapers: 1, emagazines: 1 },
        client,
        store,
      });

      expect(manifest.articles).toHaveLength(2);
      expect(manifest.shorts).toHaveLength(2);
      expect(manifest.shorts.find((item) => item.sourceId === 'short-301')?.supported).toBe(true);
      const orphanShort = manifest.shorts.find((item) => item.sourceId === 'short-302');
      expect(orphanShort?.supported).toBe(false);
      expect(orphanShort?.articleLocalId).toBeUndefined();
      expect(manifest.writeMethodsUsed).toEqual([]);
      expect(manifest.assetSummary.unavailable).toBe(0);
      expect(manifest.assetSummary.downloaded).toBeGreaterThan(0);
      expect(manifest.videos[0].publicUrl).toContain('youtube.com/watch');
      expect(requestedUrls).not.toContain(manifest.videos[0].publicUrl);
      expect(await store.readManifest()).toEqual(manifest);
      expect(manifest.articles[0].image?.localPath).toMatch(/^media\/images\//);
      expect(manifest.epapers[0].pdf?.localPath).toMatch(/^media\/pdf\//);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('refuses before any network access without explicit opt-in', async () => {
    const fetchImpl = vi.fn();
    const client = new ReadOnlyLokswamiHttpClient({ fetchImpl, retries: 0 });
    await expect(pullContentSnapshot({ env: {}, client })).rejects.toThrow(/LOKSWAMI_REAL_CONTENT=true/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
