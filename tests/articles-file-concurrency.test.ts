import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedFs = vi.hoisted(() => ({
  state: { contents: '' },
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    mkdir: mockedFs.mkdir,
    readFile: mockedFs.readFile,
    writeFile: mockedFs.writeFile,
    rename: mockedFs.rename,
    unlink: mockedFs.unlink,
  },
}));

import {
  ArticleRevisionCanonicalValidationError,
  ArticleVersionConflictError,
  deleteStoredArticle,
  restoreStoredArticleRevision,
  updateStoredArticle,
} from '@/lib/storage/articlesFile';
import { resolveArticleCanonicalUrl } from '@/lib/seo/articleSeo';

const CURRENT_CANONICAL = 'https://example.com/historical-story';

function rawRevision(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'revision-1',
    title: 'Restored title',
    summary: 'Restored summary',
    content: '<p>Restored content</p>',
    image: '/restored.jpg',
    category: 'Politics',
    author: 'Revision Author',
    slug: 'restored-title',
    previousSlugs: ['legacy-title'],
    savedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function rawArticleWithRevision(revision: Record<string, unknown>) {
  return {
    _id: 'article-1',
    version: 7,
    title: 'Current title',
    summary: 'Current summary',
    content: '<p>Current content</p>',
    image: '/current.jpg',
    category: 'News',
    author: 'Current Author',
    slug: 'current-title',
    previousSlugs: [],
    seo: { canonicalUrl: CURRENT_CANONICAL },
    workflow: { status: 'draft' },
    revisions: [revision],
  };
}

describe('articles file mutation serialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.state.contents = JSON.stringify([
      {
        _id: 'article-1',
        version: 1,
        title: 'Original title',
        summary: '',
        content: '',
        image: '',
        category: '',
        author: '',
        slug: 'original-title',
        previousSlugs: [],
        workflow: { status: 'draft' },
      },
    ]);
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.readFile.mockImplementation(async () => mockedFs.state.contents);
    mockedFs.writeFile.mockImplementation(async (_path, contents) => {
      await Promise.resolve();
      mockedFs.state.contents = String(contents);
    });
    mockedFs.rename.mockResolvedValue(undefined);
    mockedFs.unlink.mockResolvedValue(undefined);
  });

  it('allows only one concurrent update to claim the same expected version', async () => {
    const results = await Promise.allSettled([
      updateStoredArticle(
        'article-1',
        { title: 'First editor title' },
        { expectedVersion: 1 }
      ),
      updateStoredArticle(
        'article-1',
        { title: 'Second editor title' },
        { expectedVersion: 1 }
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.any(ArticleVersionConflictError),
    });
    expect((rejected[0] as PromiseRejectedResult).reason.currentVersion).toBe(2);

    const stored = JSON.parse(mockedFs.state.contents) as Array<{
      title: string;
      version: number;
    }>;
    expect(stored).toHaveLength(1);
    expect(stored[0].version).toBe(2);
    expect(['First editor title', 'Second editor title']).toContain(stored[0].title);
  });

  it('rejects a queued delete after another mutation advances the expected version', async () => {
    const results = await Promise.allSettled([
      updateStoredArticle(
        'article-1',
        { title: 'Newer editor title' },
        { expectedVersion: 1 }
      ),
      deleteStoredArticle('article-1', { expectedVersion: 1 }),
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: expect.any(ArticleVersionConflictError),
    });
    expect((results[1] as PromiseRejectedResult).reason.currentVersion).toBe(2);

    const stored = JSON.parse(mockedFs.state.contents) as Array<{
      title: string;
      version: number;
    }>;
    expect(stored).toEqual([
      expect.objectContaining({ title: 'Newer editor title', version: 2 }),
    ]);
  });

  it('increments the version when restoring a revision', async () => {
    mockedFs.state.contents = JSON.stringify([
      {
        _id: 'article-1',
        version: 7,
        title: 'Current title',
        summary: 'Current summary',
        content: '<p>Current content</p>',
        image: '/current.jpg',
        category: 'News',
        author: 'Current Author',
        slug: 'current-title',
        previousSlugs: [],
        seo: { canonicalUrl: 'https://example.com/historical-story' },
        workflow: { status: 'draft' },
        revisions: [
          {
            _id: 'revision-1',
            title: 'Restored title',
            summary: 'Restored summary',
            content: '<p>Restored content</p>',
            image: '/restored.jpg',
            category: 'Politics',
            author: 'Revision Author',
            slug: 'restored-title',
            previousSlugs: ['legacy-title'],
            seo: { canonicalUrl: 'https://example.com/historical-story' },
            savedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    ]);

    const restored = await restoreStoredArticleRevision('article-1', 'revision-1');

    expect(restored).toMatchObject({
      title: 'Restored title',
      slug: 'restored-title',
      previousSlugs: expect.arrayContaining(['current-title', 'legacy-title']),
      seo: expect.objectContaining({
        canonicalUrl: 'https://example.com/historical-story',
      }),
      version: 8,
    });
    const stored = JSON.parse(mockedFs.state.contents) as Array<{
      title: string;
      slug: string;
      previousSlugs: string[];
      version: number;
    }>;
    expect(stored[0]).toMatchObject({
      title: 'Restored title',
      slug: 'restored-title',
      previousSlugs: expect.arrayContaining(['current-title', 'legacy-title']),
      version: 8,
    });
  });

  it('rejects a file revision that changes the canonical to an unsupported value', async () => {
    mockedFs.state.contents = JSON.stringify([
      {
        _id: 'article-1',
        version: 7,
        title: 'Current title',
        summary: 'Current summary',
        content: '<p>Current content</p>',
        image: '/current.jpg',
        category: 'News',
        author: 'Current Author',
        slug: 'current-title',
        previousSlugs: [],
        seo: { canonicalUrl: '' },
        workflow: { status: 'draft' },
        revisions: [
          {
            _id: 'revision-1',
            title: 'Restored title',
            summary: 'Restored summary',
            content: '<p>Restored content</p>',
            image: '/restored.jpg',
            category: 'Politics',
            author: 'Revision Author',
            slug: 'restored-title',
            previousSlugs: [],
            seo: { canonicalUrl: 'https://example.com/restored-title' },
            savedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    ]);

    await expect(
      restoreStoredArticleRevision('article-1', 'revision-1')
    ).rejects.toBeInstanceOf(ArticleRevisionCanonicalValidationError);
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    ['seo omitted', {}, CURRENT_CANONICAL],
    ['canonical omitted', { seo: {} }, CURRENT_CANONICAL],
    ['explicit clear', { seo: { canonicalUrl: '' } }, ''],
    [
      'explicit unchanged',
      { seo: { canonicalUrl: `  ${CURRENT_CANONICAL}  ` } },
      CURRENT_CANONICAL,
    ],
    [
      'explicit changed valid',
      { seo: { canonicalUrl: 'https://lokswami.com/main/article/restored-title' } },
      'https://lokswami.com/main/article/restored-title',
    ],
  ])(
    'restores raw file revision canonical state: %s',
    async (_label, revisionOverrides, expectedCanonical) => {
      mockedFs.state.contents = JSON.stringify([
        rawArticleWithRevision(rawRevision(revisionOverrides)),
      ]);

      const restored = await restoreStoredArticleRevision('article-1', 'revision-1');

      expect(restored).toMatchObject({
        title: 'Restored title',
        summary: 'Restored summary',
        content: '<p>Restored content</p>',
        image: '/restored.jpg',
        category: 'Politics',
        author: 'Revision Author',
        slug: 'restored-title',
        previousSlugs: expect.arrayContaining(['current-title', 'legacy-title']),
        seo: expect.objectContaining({ canonicalUrl: expectedCanonical }),
        version: 8,
      });
      const stored = JSON.parse(mockedFs.state.contents)[0];
      expect(stored.seo.canonicalUrl).toBe(expectedCanonical);
      expect(stored).not.toHaveProperty('canonicalUrlPresent');
      expect(stored.revisions[0]).not.toHaveProperty('canonicalUrlPresent');
      expect(
        resolveArticleCanonicalUrl(
          {
            id: 'article-1',
            slug: 'restored-title',
            canonicalUrl: stored.seo.canonicalUrl,
          },
          'https://lokswami.com'
        )
      ).toBe('https://lokswami.com/main/article/restored-title');
    }
  );

  it.each([
    ['external', 'https://example.com/restored-title', /public site origin/i],
    [
      'cross-article',
      'https://lokswami.com/main/article/another-article',
      /current public slug/i,
    ],
    [
      'query-bearing',
      'https://lokswami.com/main/article/restored-title?ref=legacy',
      /clean, queryless/i,
    ],
  ])(
    'rejects a raw file revision with a changed %s canonical without writing',
    async (_label, canonicalUrl, errorPattern) => {
      mockedFs.state.contents = JSON.stringify([
        rawArticleWithRevision(rawRevision({ seo: { canonicalUrl } })),
      ]);
      const originalContents = mockedFs.state.contents;

      await expect(
        restoreStoredArticleRevision('article-1', 'revision-1')
      ).rejects.toThrow(errorPattern);
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
      expect(mockedFs.state.contents).toBe(originalContents);
    }
  );
});
