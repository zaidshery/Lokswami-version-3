import articleDetail from '@/tests/fixtures/content-snapshot/article-detail.json';
import articleList from '@/tests/fixtures/content-snapshot/articles-list.json';
import breaking from '@/tests/fixtures/content-snapshot/breaking.json';
import epapers from '@/tests/fixtures/content-snapshot/epapers.json';
import homeFeed from '@/tests/fixtures/content-snapshot/home-feed.json';
import shorts from '@/tests/fixtures/content-snapshot/shorts.json';
import videos from '@/tests/fixtures/content-snapshot/videos.json';
import {
  deterministicLocalObjectId,
  mergeArticleDetail,
  parseArticleDetail,
  parseArticleList,
  parseBreaking,
  parseEpapers,
  parseHomeFeedEmagazines,
  parseShorts,
  parseVideos,
  resolveShortArticleLinks,
} from '@/scripts/content-snapshot/parsers';
import { formatSnapshotInspection } from '@/scripts/content-snapshot/inspect';
import type { SnapshotManifest } from '@/scripts/content-snapshot/types';

const capturedAt = '2026-09-11T00:00:00.000Z';

describe('LokSwami public content snapshot parsers', () => {
  it('parses article list and detail envelopes without rewriting public copy', () => {
    const articles = parseArticleList(articleList, capturedAt);
    const detail = parseArticleDetail(articleDetail, capturedAt);
    expect(articles).toHaveLength(2);
    expect(detail?.content).toContain('Sanitized article body');
    const merged = mergeArticleDetail(articles[0], detail);
    expect(merged.summary).toBe('A sanitized detail summary.');
    expect(merged.author).toBe('News Desk');
    expect(merged.image?.sourceUrl).toContain('digitaloceanspaces.com');
  });

  it('creates stable Mongo-compatible local IDs from type and public identifier', () => {
    const first = deterministicLocalObjectId('article', 'public-article-101');
    expect(first).toMatch(/^[a-f0-9]{24}$/);
    expect(deterministicLocalObjectId('article', 'public-article-101')).toBe(first);
    expect(deterministicLocalObjectId('video', 'public-article-101')).not.toBe(first);
  });

  it('parses breaking, videos, e-papers, and the home-feed e-magazine shape', () => {
    expect(parseBreaking(breaking, capturedAt)[0].articleSourceId).toBe('public-article-101');
    expect(parseVideos(videos, capturedAt)[0]).toMatchObject({
      provider: 'youtube',
      publicUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
    const paper = parseEpapers(epapers, capturedAt)[0];
    expect(paper.pageCount).toBe(2);
    expect(paper.pages).toHaveLength(2);
    expect(paper.pdf?.kind).toBe('pdf');
    const magazine = parseHomeFeedEmagazines(homeFeed, capturedAt)[0];
    expect(magazine.type).toBe('emagazine');
    expect(magazine.pageCount).toBe(24);
  });

  it('drops video records whose playback host is not an observed approved provider', () => {
    expect(parseVideos({
      items: [{
        id: 'unapproved-video',
        title: 'Unapproved provider',
        videoUrl: 'https://example.com/video.mp4',
      }],
    }, capturedAt)).toEqual([]);
  });

  it('marks orphan shorts unsupported and resolves only imported article relationships', () => {
    const articles = parseArticleList(articleList, capturedAt);
    const parsed = parseShorts(shorts, capturedAt);
    const resolved = resolveShortArticleLinks(parsed, articles);
    expect(resolved[0]).toMatchObject({
      supported: true,
      articleSourceId: 'public-article-101',
      articleLocalId: articles[0].localId,
    });
    expect(resolved[1].supported).toBe(false);
    expect(resolved[1].articleLocalId).toBeUndefined();
    expect(resolved[1].unsupportedReason).toMatch(/does not expose a related article/i);
  });

  it('reports article-image availability separately without exposing secrets', () => {
    const articles = parseArticleList(articleList, capturedAt);
    articles[0].image = { ...articles[0].image!, status: 'downloaded' };
    articles[1].image = { ...articles[1].image!, status: 'unavailable' };
    const output = formatSnapshotInspection({
      schemaVersion: 1,
      sourceHost: 'lokswami.com',
      sourceOrigin: 'https://lokswami.com',
      pulledAt: capturedAt,
      readMethodsUsed: ['GET'],
      writeMethodsUsed: [],
      endpoints: [],
      limits: { articles: 2, breaking: 0, videos: 0, shorts: 0, epapers: 0, emagazines: 0, concurrency: 1 },
      articles,
      breaking: [],
      videos: [],
      shorts: [],
      epapers: [],
      emagazines: [],
      errors: [],
      assetSummary: { downloaded: 1, unavailable: 1 },
    } satisfies SnapshotManifest);

    expect(output).toContain('Article images: 1 downloaded, 1 unavailable');
    expect(output).toContain('Production write methods used: NONE');
  });
});
