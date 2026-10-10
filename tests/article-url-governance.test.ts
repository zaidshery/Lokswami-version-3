import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isMongoAvailable: vi.fn(),
  listResolutionRecords: vi.fn(),
  getStoredByIdStrict: vi.fn(),
  listAllStoredArticles: vi.fn(),
  articleFind: vi.fn(),
  articleFindById: vi.fn(),
}));

vi.mock('@/lib/db/mongoAvailability', () => ({
  isMongoAvailable: mocks.isMongoAvailable,
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  listStoredArticleResolutionRecords: mocks.listResolutionRecords,
  getStoredArticleByIdStrict: mocks.getStoredByIdStrict,
  listAllStoredArticles: mocks.listAllStoredArticles,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    find: mocks.articleFind,
    findById: mocks.articleFindById,
  },
}));

const published = {
  _id: '507f1f77bcf86cd799439011',
  slug: 'current-story',
  previousSlugs: ['previous-story'],
  title: 'Current Story',
  summary: 'Published story summary',
  image: '/story.jpg',
  category: 'City',
  author: 'Desk',
  publishedAt: '2026-08-12T09:00:00.000Z',
  updatedAt: '2026-08-12T10:00:00.000Z',
  seo: { canonicalUrl: '' },
  workflow: { status: 'published' },
};

describe('Phase 3A article URL governance helpers', () => {
  it('keeps creation slug normalization separate from strict request parsing', async () => {
    const {
      normalizeArticleSlug,
      parseArticleRequestToken,
      resolveUniqueArticleSlug,
    } = await import('@/lib/seo/articleSeo');

    expect(normalizeArticleSlug('Current Story!')).toBe('current-story');
    expect(parseArticleRequestToken('Current Story!')).toEqual({ ok: false });
    expect(parseArticleRequestToken('CURRENT-STORY')).toEqual({
      ok: true,
      decoded: 'CURRENT-STORY',
      normalizedSlug: 'current-story',
      objectId: null,
    });
    expect(normalizeArticleSlug('  हिंदी ख़बर  ')).toBe('हिंदी-ख़बर');
    await expect(
      resolveUniqueArticleSlug('हिंदी ख़बर', async (candidate) => candidate === 'हिंदी-ख़बर')
    ).resolves.toBe('हिंदी-ख़बर-2');
  });

  it('builds direct redirects with ordinary queries and strips framework queries', async () => {
    const { buildArticleRedirectPath } = await import('@/lib/seo/articleSeo');
    expect(
      buildArticleRedirectPath(
        { id: published._id, slug: published.slug },
        {
          ref: 'newsletter',
          tag: ['one', 'two'],
          _rsc: 'internal',
          '__nextFallback': '1',
          'next-router-state-tree': 'internal',
        }
      )
    ).toBe('/main/article/current-story?ref=newsletter&tag=one&tag=two');
  });

  it('accepts only a clean same-origin self canonical and excludes unsafe stored overrides', async () => {
    const {
      resolveArticleCanonicalUrl,
      validateArticleCanonicalOverride,
    } = await import('@/lib/seo/articleSeo');
    const article = { id: published._id, slug: published.slug };
    const canonical = 'https://lokswami.com/main/article/current-story';

    expect(validateArticleCanonicalOverride(canonical, article, 'https://lokswami.com')).toBeNull();
    expect(
      validateArticleCanonicalOverride(
        'https://example.com/main/article/current-story',
        article,
        'https://lokswami.com'
      )
    ).toMatch(/public site origin/i);
    expect(
      validateArticleCanonicalOverride(
        'https://lokswami.com/main/article/another-story',
        article,
        'https://lokswami.com'
      )
    ).toMatch(/current public slug/i);
    expect(
      resolveArticleCanonicalUrl(
        { ...article, canonicalUrl: 'https://example.com/unsafe' },
        'https://lokswami.com'
      )
    ).toBe(canonical);
    expect(
      resolveArticleCanonicalUrl(
        {
          ...article,
          slug: 'renamed-story',
          canonicalUrl: 'https://lokswami.com/main/article/current-story',
        },
        'https://lokswami.com'
      )
    ).toBe('https://lokswami.com/main/article/renamed-story');
  });

  it('distinguishes omitted, cleared, unchanged, and changed canonical edits', async () => {
    const {
      readArticleCanonicalEdit,
      validateEditedArticleCanonicalOverride,
    } = await import('@/lib/seo/articleSeo');
    const article = { id: published._id, slug: published.slug };
    const historical = 'https://example.com/historical-story';

    expect(readArticleCanonicalEdit({ metaTitle: 'No canonical edit' })).toEqual({
      kind: 'omitted',
    });
    expect(
      validateEditedArticleCanonicalOverride(
        readArticleCanonicalEdit({ canonicalUrl: '' }),
        historical,
        article,
        'https://lokswami.com'
      )
    ).toBeNull();
    expect(
      validateEditedArticleCanonicalOverride(
        readArticleCanonicalEdit({ canonicalUrl: `  ${historical}  ` }),
        historical,
        article,
        'https://lokswami.com'
      )
    ).toBeNull();
    expect(
      validateEditedArticleCanonicalOverride(
        readArticleCanonicalEdit({ canonicalUrl: 'https://example.com/changed' }),
        historical,
        article,
        'https://lokswami.com'
      )
    ).toMatch(/public site origin/i);
    expect(
      validateEditedArticleCanonicalOverride(
        readArticleCanonicalEdit({ canonicalUrl: { value: historical } }),
        historical,
        article,
        'https://lokswami.com'
      )
    ).toMatch(/valid absolute URL/i);
  });
});

describe('central public article resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMongoAvailable.mockResolvedValue(false);
    mocks.listResolutionRecords.mockResolvedValue([published]);
    mocks.getStoredByIdStrict.mockResolvedValue(published);
    mocks.listAllStoredArticles.mockResolvedValue([]);
  });

  it.each([
    ['current-story', 'current', true],
    ['CURRENT-STORY', 'current', false],
    ['previous-story', 'previous', false],
    ['507f1f77bcf86cd799439011', 'legacyId', false],
  ] as const)('classifies %s as %s', async (token, kind, isExactAuthority) => {
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    await expect(resolvePublicArticleToken(token)).resolves.toEqual(
      expect.objectContaining({
        kind,
        source: 'file',
        authoritativePath: '/main/article/current-story',
        isExactAuthority,
      })
    );
  });

  it('treats a Mongo Object ID that is also the current slug as exact current authority', async () => {
    const sameIdArticle = {
      ...published,
      slug: published._id,
      previousSlugs: [],
    };
    mocks.isMongoAvailable.mockResolvedValue(true);
    mocks.articleFind.mockReturnValue({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([sameIdArticle]) })),
      })),
    });
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');

    await expect(resolvePublicArticleToken(published._id)).resolves.toEqual(
      expect.objectContaining({
        kind: 'current',
        source: 'mongo',
        authoritativePath: `/main/article/${published._id}`,
        isExactAuthority: true,
      })
    );
    await expect(resolvePublicArticleToken(published._id.toUpperCase())).resolves.toEqual(
      expect.objectContaining({
        kind: 'current',
        source: 'mongo',
        authoritativePath: `/main/article/${published._id}`,
        isExactAuthority: false,
      })
    );

    const { getArticleForMetadata } = await import('@/lib/content/serverArticles');
    const { buildArticlePageMetadata } = await import('@/lib/seo/articleMetadata');
    const article = await getArticleForMetadata(published._id);
    expect(article).not.toBeNull();
    expect(
      buildArticlePageMetadata({
        article,
        siteUrl: 'https://lokswami.com',
      })
    ).toEqual(
      expect.objectContaining({
        alternates: {
          canonical: `https://lokswami.com/main/article/${published._id}`,
        },
      })
    );
  });

  it('treats a file-store UUID that is also the current slug as exact current authority', async () => {
    const fileId = '7fd15de2-1111-4222-8333-9a1111111111';
    mocks.listResolutionRecords.mockResolvedValue([
      { ...published, _id: fileId, slug: fileId, previousSlugs: [] },
    ]);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');

    await expect(resolvePublicArticleToken(fileId)).resolves.toEqual(
      expect.objectContaining({
        kind: 'current',
        source: 'file',
        authoritativePath: `/main/article/${fileId}`,
        isExactAuthority: true,
      })
    );
  });

  it('keeps a distinct published Mongo Object ID classified as legacy authority', async () => {
    mocks.isMongoAvailable.mockResolvedValue(true);
    mocks.articleFind.mockReturnValue({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([published]) })),
      })),
    });
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');

    await expect(resolvePublicArticleToken(published._id)).resolves.toEqual(
      expect.objectContaining({
        kind: 'legacyId',
        source: 'mongo',
        authoritativePath: '/main/article/current-story',
        isExactAuthority: false,
      })
    );
  });

  it.each([
    ['', 'Desk', 'General', 'Desk'],
    ['City', '', 'City', 'Editor'],
    ['', '', 'General', 'Editor'],
  ])(
    'keeps published file authority when category=%j and author=%j',
    async (category, author, expectedCategory, expectedAuthor) => {
      const legacyPublished = { ...published, category, author };
      mocks.listResolutionRecords.mockResolvedValue([legacyPublished]);
      mocks.getStoredByIdStrict.mockResolvedValue(legacyPublished);
      const {
        getPublicArticleByResolution,
        resolvePublicArticleToken,
      } = await import('@/lib/server/publicArticles');

      const resolution = await resolvePublicArticleToken('current-story');
      expect(resolution).toEqual(expect.objectContaining({
        kind: 'current',
        article: expect.objectContaining({
          category: expectedCategory,
          author: expectedAuthor,
        }),
      }));
      if (resolution.kind === 'current' || resolution.kind === 'previous' || resolution.kind === 'legacyId') {
        await expect(getPublicArticleByResolution(resolution)).resolves.toEqual(
          expect.objectContaining({
            article: expect.objectContaining({
              category: expectedCategory,
              author: expectedAuthor,
            }),
          })
        );
      }
    }
  );

  it.each([
    ['previous-story', 'previous'],
    ['507f1f77bcf86cd799439011', 'legacyId'],
  ] as const)('preserves %s authority redirects with blank display fields', async (token, kind) => {
    mocks.listResolutionRecords.mockResolvedValue([{ ...published, category: '', author: '' }]);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    await expect(resolvePublicArticleToken(token)).resolves.toEqual(
      expect.objectContaining({
        kind,
        authoritativePath: '/main/article/current-story',
        article: expect.objectContaining({ category: 'General', author: 'Editor' }),
      })
    );
  });

  it('keeps Mongo and metadata authority aligned for blank display fields', async () => {
    const legacyPublished = { ...published, category: '', author: '' };
    mocks.isMongoAvailable.mockResolvedValue(true);
    mocks.articleFind.mockReturnValue({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([legacyPublished]) })),
      })),
    });
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    const { getArticleForMetadata } = await import('@/lib/content/serverArticles');

    await expect(resolvePublicArticleToken('current-story')).resolves.toEqual(
      expect.objectContaining({
        kind: 'current',
        source: 'mongo',
        article: expect.objectContaining({ category: 'General', author: 'Editor' }),
      })
    );
    await expect(getArticleForMetadata('current-story')).resolves.toEqual(
      expect.objectContaining({
        id: published._id,
        title: 'Current Story',
        category: 'General',
        author: 'Editor',
      })
    );
  });

  it('still hides a non-public article when both display fields are blank', async () => {
    mocks.listResolutionRecords.mockResolvedValue([{
      ...published,
      category: '',
      author: '',
      workflow: { status: 'draft' },
    }]);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    await expect(resolvePublicArticleToken('current-story')).resolves.toEqual({ kind: 'missing' });
  });

  it('does not resolve an absent repository mock numeric token as authoritative content', async () => {
    const { articles } = await import('@/lib/mock/data');
    const mock = articles.find((article) => /^\d+$/.test(article.id))!;
    expect(mock).toBeDefined();
    mocks.listResolutionRecords.mockResolvedValue([published]);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    await expect(resolvePublicArticleToken(mock.id)).resolves.toEqual({ kind: 'missing' });
    expect(mocks.getStoredByIdStrict).not.toHaveBeenCalled();
    expect(mocks.articleFind).not.toHaveBeenCalled();
  });

  it('decodes a Hindi token once and resolves it deterministically', async () => {
    const hindi = { ...published, slug: 'हिंदी-ख़बर', previousSlugs: [] };
    mocks.listResolutionRecords.mockResolvedValue([hindi]);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    await expect(resolvePublicArticleToken(encodeURIComponent(hindi.slug))).resolves.toEqual(
      expect.objectContaining({ kind: 'current', isExactAuthority: true })
    );
  });

  it('keeps file-store UUID legacy IDs aligned with Mongo Object ID behavior', async () => {
    const fileArticle = {
      ...published,
      _id: '7fd15de2-1111-4222-8333-9a1111111111',
    };
    mocks.listResolutionRecords.mockResolvedValue([fileArticle]);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    await expect(resolvePublicArticleToken(fileArticle._id)).resolves.toEqual(
      expect.objectContaining({
        kind: 'legacyId',
        authoritativePath: '/main/article/current-story',
      })
    );
  });

  it.each(['%E0%A4%A', 'Current Story!', 'current story']) (
    'returns missing for malformed or guessed token %s without selecting a store',
    async (token) => {
      const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
      await expect(resolvePublicArticleToken(token)).resolves.toEqual({ kind: 'missing' });
      expect(mocks.isMongoAvailable).not.toHaveBeenCalled();
      expect(mocks.listResolutionRecords).not.toHaveBeenCalled();
      expect(mocks.articleFind).not.toHaveBeenCalled();
    }
  );

  it.each(['draft', 'scheduled', 'approved', 'rejected', 'archived']) (
    'hides the %s workflow state without redirecting',
    async (status) => {
      mocks.listResolutionRecords.mockResolvedValue([
        { ...published, workflow: { status, scheduledFor: '2099-01-01T00:00:00.000Z' } },
      ]);
      const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
      await expect(resolvePublicArticleToken('current-story')).resolves.toEqual({ kind: 'missing' });
    }
  );

  it('keeps a non-public same-ID/current-slug record unavailable', async () => {
    mocks.listResolutionRecords.mockResolvedValue([
      {
        ...published,
        slug: published._id,
        previousSlugs: [],
        workflow: { status: 'draft' },
      },
    ]);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');

    await expect(resolvePublicArticleToken(published._id)).resolves.toEqual({ kind: 'missing' });
  });

  it('fails closed when current and historical ownership are ambiguous', async () => {
    mocks.listResolutionRecords.mockResolvedValue([
      published,
      { ...published, _id: '507f1f77bcf86cd799439012', slug: 'other-story', previousSlugs: ['current-story'] },
    ]);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    await expect(resolvePublicArticleToken('current-story')).resolves.toEqual({ kind: 'ambiguous' });
  });

  it('reports an active selected-store failure without falling through', async () => {
    mocks.listResolutionRecords.mockRejectedValue(new Error('file unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    await expect(resolvePublicArticleToken('current-story')).resolves.toEqual({ kind: 'unavailable' });
    expect(mocks.articleFind).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('uses a bounded body-free Mongo classification query with equivalent output', async () => {
    const selected: string[] = [];
    const limits: number[] = [];
    mocks.isMongoAvailable.mockResolvedValue(true);
    mocks.articleFind.mockReturnValue({
      select: vi.fn((fields: string) => {
        selected.push(fields);
        return {
          limit: vi.fn((limit: number) => {
            limits.push(limit);
            return { lean: vi.fn().mockResolvedValue([published]) };
          }),
        };
      }),
    });

    const { resolvePublicArticleToken } = await import('@/lib/server/publicArticles');
    const result = await resolvePublicArticleToken('previous-story');
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'previous',
        source: 'mongo',
        authoritativePath: '/main/article/current-story',
      })
    );
    expect(selected[0].split(/\s+/)).not.toContain('content');
    expect(selected[0].split(/\s+/)).not.toContain('contentJson');
    expect(limits).toEqual([3]);
    expect(mocks.listResolutionRecords).not.toHaveBeenCalled();
  });
});
