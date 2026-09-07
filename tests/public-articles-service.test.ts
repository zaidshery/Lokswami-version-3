import { beforeEach, describe, expect, it, vi } from 'vitest';

const connectDBMock = vi.fn();
const isMongoAvailableMock = vi.fn();
const listAllStoredArticlesMock = vi.fn();
const getStoredArticleByIdOrSlugMock = vi.fn();
const getStoredArticleByIdStrictMock = vi.fn();
const listStoredArticleResolutionRecordsMock = vi.fn();
const articleFindMock = vi.fn();
const articleFindByIdMock = vi.fn();
const articleFindOneMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/db/mongoAvailability', () => ({
  isMongoAvailable: isMongoAvailableMock,
}));

vi.mock('@/lib/models/Article', () => ({
  default: {
    find: articleFindMock,
    findById: articleFindByIdMock,
    findOne: articleFindOneMock,
  },
}));

vi.mock('@/lib/storage/articlesFile', () => ({
  getStoredArticleByIdOrSlug: getStoredArticleByIdOrSlugMock,
  getStoredArticleByIdStrict: getStoredArticleByIdStrictMock,
  listAllStoredArticles: listAllStoredArticlesMock,
  listStoredArticleResolutionRecords: listStoredArticleResolutionRecordsMock,
}));

const publishedBase = {
  summary: 'Story summary',
  image: '/story.jpg',
  author: 'Desk',
  views: 10,
  isBreaking: false,
  isTrending: false,
  workflow: { status: 'published' },
};

describe('public articles service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    isMongoAvailableMock.mockResolvedValue(false);
  });

  it('pages beyond the first Mongo candidate window with stable timestamp ties', async () => {
    const rows = Array.from({ length: 85 }, (_, index) => ({
      ...publishedBase,
      _id: (1000 - index).toString(16).padStart(24, '0'),
      title: `Story ${index}`, slug: `story-${index}`, category: 'National',
      publishedAt: new Date(Date.UTC(2026, 0, 10) - Math.floor(index / 2) * 1000).toISOString(),
    }));
    isMongoAvailableMock.mockResolvedValue(true);
    articleFindMock.mockImplementation((filter) => {
      const clauses = filter.$and as Array<{ $or?: Array<{ _id?: { $lt: unknown }; publishedAt?: unknown }> }>;
      const tie = clauses.flatMap((clause) => clause.$or || []).find((clause) => clause._id?.$lt);
      const cutoff = tie ? new Date(tie.publishedAt as Date).toISOString() : null;
      let limit = rows.length;
      const query = {
        select: () => query,
        sort: () => query,
        maxTimeMS: () => query,
        limit: (value: number) => { limit = value; return query; },
        lean: async () => rows.filter((row) => !cutoff || row.publishedAt < cutoff ||
          (row.publishedAt === cutoff && row._id < String(tie?._id?.$lt))).slice(0, limit),
      };
      return query;
    });
    const { listPublicArticles } = await import('@/lib/server/publicArticles');
    const ids: string[] = [];
    let cursor: { publishedAt: string; id: string } | null = null;
    for (let page = 0; page < 6; page += 1) {
      const result = await listPublicArticles({ limit: 19, cursorPublishedAt: cursor?.publishedAt, cursorId: cursor?.id });
      ids.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
      if (!result.hasMore) break;
    }
    expect(ids).toEqual(rows.map((row) => row._id));
    expect(new Set(ids).size).toBe(85);
    expect(listAllStoredArticlesMock).not.toHaveBeenCalled();
  });

  it('lists published articles with category, city, and cursor filters from the file store', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      {
        ...publishedBase,
        _id: 'article-3',
        slug: 'third-story',
        title: 'Third Story',
        category: 'Politics',
        publishedAt: '2026-05-09T08:00:00.000Z',
        updatedAt: '2026-05-09T08:30:00.000Z',
        reporterMeta: { locationTag: 'Indore' },
      },
      {
        ...publishedBase,
        _id: 'article-2',
        slug: 'second-story',
        title: 'Second Story',
        category: 'Politics',
        publishedAt: '2026-05-09T09:00:00.000Z',
        updatedAt: '2026-05-09T09:30:00.000Z',
        reporterMeta: { locationTag: 'Indore' },
      },
      {
        ...publishedBase,
        _id: 'article-1',
        slug: 'lead-story',
        title: 'Lead Story',
        category: 'Politics',
        publishedAt: '2026-05-09T10:00:00.000Z',
        updatedAt: '2026-05-09T10:30:00.000Z',
        reporterMeta: { locationTag: 'Indore' },
      },
      {
        ...publishedBase,
        _id: 'sports-1',
        slug: 'sports-story',
        title: 'Sports Story',
        category: 'Sports',
        publishedAt: '2026-05-09T11:00:00.000Z',
        updatedAt: '2026-05-09T11:30:00.000Z',
        reporterMeta: { locationTag: 'Indore' },
      },
      {
        ...publishedBase,
        _id: 'bhopal-1',
        slug: 'bhopal-story',
        title: 'Bhopal Story',
        category: 'Politics',
        publishedAt: '2026-05-09T12:00:00.000Z',
        updatedAt: '2026-05-09T12:30:00.000Z',
        reporterMeta: { locationTag: 'Bhopal' },
      },
      {
        ...publishedBase,
        _id: 'draft-1',
        slug: 'draft-story',
        title: 'Draft Story',
        category: 'Politics',
        publishedAt: '2026-05-09T13:00:00.000Z',
        updatedAt: '2026-05-09T13:30:00.000Z',
        reporterMeta: { locationTag: 'Indore' },
        workflow: { status: 'draft' },
      },
    ]);

    const { listPublicArticles } = await import('@/lib/server/publicArticles');
    const result = await listPublicArticles({
      limit: 1,
      category: 'politics',
      city: 'indore',
      cursorPublishedAt: '2026-05-09T10:00:00.000Z',
      cursorId: 'article-1',
    });

    expect(result.source).toBe('file');
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'article-2',
        slug: 'second-story',
        city: 'Indore',
        href: '/main/article/second-story',
      })
    );
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toEqual({
      publishedAt: '2026-05-09T09:00:00.000Z',
      id: 'article-2',
    });
  });

  it('searches published articles across public text fields from the file store', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      {
        ...publishedBase,
        _id: 'article-1',
        slug: 'indore-budget',
        title: 'Indore Budget',
        summary: 'Municipal budget update',
        category: 'Politics',
        publishedAt: '2026-05-09T10:00:00.000Z',
        updatedAt: '2026-05-09T10:30:00.000Z',
        reporterMeta: { locationTag: 'Indore' },
      },
      {
        ...publishedBase,
        _id: 'article-2',
        slug: 'sports-wrap',
        title: 'Sports Wrap',
        summary: 'Daily match report',
        category: 'Sports',
        publishedAt: '2026-05-09T09:00:00.000Z',
        updatedAt: '2026-05-09T09:30:00.000Z',
        reporterMeta: { locationTag: 'Bhopal' },
      },
    ]);

    const { listPublicArticles } = await import('@/lib/server/publicArticles');
    const result = await listPublicArticles({
      limit: 10,
      query: 'budget',
    });

    expect(result.filters).toEqual({ query: 'budget' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'article-1',
        title: 'Indore Budget',
      })
    );
  });

  it('removes expired editorial flags from public article output', async () => {
    listAllStoredArticlesMock.mockResolvedValue([
      {
        ...publishedBase,
        _id: 'expired-flags',
        slug: 'expired-flags',
        title: 'Expired Flags',
        category: 'Politics',
        publishedAt: '2026-05-09T10:00:00.000Z',
        updatedAt: '2026-05-09T10:30:00.000Z',
        isBreaking: true,
        isTrending: true,
        editorial: {
          breakingStartsAt: '2020-01-01T10:00',
          breakingExpiresAt: '2020-01-01T11:00',
          trendingExpiresAt: '2020-01-01T11:00',
        },
      },
    ]);

    const { listPublicArticles } = await import('@/lib/server/publicArticles');
    const result = await listPublicArticles({ limit: 10 });

    expect(result.items[0]).toEqual(expect.objectContaining({
      isBreaking: false,
      isTrending: false,
    }));
  });

  it('returns public article detail by slug without leaking workflow metadata', async () => {
    const fixture = {
      ...publishedBase,
      _id: 'article-1',
      slug: 'lead-story',
      previousSlugs: ['old-lead-story'],
      title: 'Lead Story',
      content: 'Full story body',
      category: 'Politics',
      publishedAt: '2026-05-09T10:00:00.000Z',
      updatedAt: '2026-05-09T10:30:00.000Z',
      reporterMeta: { locationTag: 'Indore' },
      seo: {
        metaTitle: 'Lead Story SEO',
        metaDescription: 'SEO description',
      },
    };
    listStoredArticleResolutionRecordsMock.mockResolvedValue([fixture]);
    getStoredArticleByIdStrictMock.mockResolvedValue(fixture);

    const { getPublicArticleBySlug } = await import('@/lib/server/publicArticles');
    const result = await getPublicArticleBySlug('lead-story');

    expect(result?.source).toBe('file');
    expect(result?.article).toEqual(
      expect.objectContaining({
        id: 'article-1',
        previousSlugs: ['old-lead-story'],
        content: 'Full story body',
        city: 'Indore',
      })
    );
    expect(result?.article).not.toHaveProperty('workflow');
  });

  it('keeps related articles same-category first, excludes the current destination, deduplicates, and caps at twenty', async () => {
    const current = {
      ...publishedBase,
      _id: 'current',
      slug: 'current-story',
      title: 'Current Story',
      category: 'Politics',
      publishedAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    };
    const sameCategory = Array.from({ length: 14 }, (_, index) => ({
      ...publishedBase,
      _id: `politics-${index + 1}`,
      slug: `politics-${index + 1}`,
      title: `Politics ${index + 1}`,
      category: index % 2 === 0 ? 'Politics' : 'politics',
      publishedAt: `2026-08-${String(11 - Math.min(index, 9)).padStart(2, '0')}T10:00:00.000Z`,
      updatedAt: '2026-08-12T10:00:00.000Z',
    }));
    const fallback = Array.from({ length: 12 }, (_, index) => ({
      ...publishedBase,
      _id: `sports-${index + 1}`,
      slug: `sports-${index + 1}`,
      title: `Sports ${index + 1}`,
      category: 'Sports',
      publishedAt: `2026-07-${String(28 - index).padStart(2, '0')}T10:00:00.000Z`,
      updatedAt: '2026-08-12T10:00:00.000Z',
    }));
    listAllStoredArticlesMock.mockResolvedValue([
      current,
      { ...sameCategory[0], _id: 'duplicate-destination' },
      ...fallback,
      ...sameCategory,
    ]);

    const { getPublicArticleBySlug, listRelatedPublicArticles } = await import(
      '@/lib/server/publicArticles'
    );
    listStoredArticleResolutionRecordsMock.mockResolvedValue([current]);
    getStoredArticleByIdStrictMock.mockResolvedValue(current);
    const currentResult = await getPublicArticleBySlug('current-story');
    const result = await listRelatedPublicArticles(currentResult!.article, {
      limit: 200,
      source: 'file',
    });

    expect(result.limit).toBe(20);
    expect(result.items).toHaveLength(20);
    expect(result.items.every((item) => item.id !== 'current')).toBe(true);
    expect(new Set(result.items.map((item) => item.href)).size).toBe(20);
    expect(result.items.slice(0, 14).every((item) => item.category.toLowerCase() === 'politics')).toBe(true);
    expect(result.items.slice(14).every((item) => item.category === 'Sports')).toBe(true);
  });

  it('filters every non-public workflow state from related results and strips private fields', async () => {
    const eligible = {
      ...publishedBase,
      _id: 'published-related',
      slug: 'published-related',
      title: 'Published Related',
      category: 'Politics',
      publishedAt: '2026-08-12T09:00:00.000Z',
      updatedAt: '2026-08-12T09:00:00.000Z',
      editorial: { internalNote: 'private' },
      reporterMeta: { locationTag: 'Indore', privateNote: 'private' },
      revisions: [{ body: 'private' }],
      assignment: { desk: 'private' },
      moderation: { note: 'private' },
    };
    const nonPublic = ['draft', 'scheduled', 'rejected', 'approved', 'archived'].map(
      (status) => ({
        ...eligible,
        _id: `${status}-related`,
        slug: `${status}-related`,
        title: `${status} related`,
        workflow: { status },
      })
    );
    listAllStoredArticlesMock.mockResolvedValue([eligible, ...nonPublic]);

    const { listRelatedPublicArticles } = await import('@/lib/server/publicArticles');
    const result = await listRelatedPublicArticles(
      { id: 'current', href: '/main/article/current', category: 'Politics' },
      { source: 'file' }
    );

    expect(result.items.map((item) => item.id)).toEqual(['published-related']);
    expect(result.items[0]).not.toHaveProperty('workflow');
    expect(result.items[0]).not.toHaveProperty('editorial');
    expect(result.items[0]).not.toHaveProperty('reporterMeta');
    expect(result.items[0]).not.toHaveProperty('revisions');
    expect(result.items[0]).not.toHaveProperty('assignment');
    expect(result.items[0]).not.toHaveProperty('moderation');
    expect(result.items[0]).not.toHaveProperty('content');
  });

  it('uses bounded body-free Mongo projections and still filters non-public candidates', async () => {
    const selectedFields: string[] = [];
    const candidateLimits: number[] = [];
    const makeQuery = (docs: Array<Record<string, unknown>>) => ({
      select: vi.fn((fields: string) => {
        selectedFields.push(fields);
        return {
          sort: vi.fn(() => ({
            limit: vi.fn((limit: number) => {
              candidateLimits.push(limit);
              return { lean: vi.fn().mockResolvedValue(docs) };
            }),
          })),
        };
      }),
    });
    const sameCategory = {
      ...publishedBase,
      _id: 'same-category',
      slug: 'same-category',
      title: 'Same Category',
      category: 'Politics',
      publishedAt: '2026-08-12T09:00:00.000Z',
      updatedAt: '2026-08-12T09:00:00.000Z',
      content: '<p>A very large body that related-card mapping must ignore.</p>',
    };
    const nonPublic = {
      ...sameCategory,
      _id: 'draft-candidate',
      slug: 'draft-candidate',
      title: 'Draft Candidate',
      workflow: { status: 'draft' },
    };
    const fallback = {
      ...publishedBase,
      _id: 'fallback',
      slug: 'fallback',
      title: 'Fallback',
      category: 'Sports',
      publishedAt: '2026-08-12T08:00:00.000Z',
      updatedAt: '2026-08-12T08:00:00.000Z',
      content: '<p>Another large body that must not be selected.</p>',
    };
    articleFindMock
      .mockReturnValueOnce(makeQuery([sameCategory, nonPublic]))
      .mockReturnValueOnce(makeQuery([fallback]));

    const { listRelatedPublicArticles } = await import('@/lib/server/publicArticles');
    const result = await listRelatedPublicArticles(
      { id: 'current', href: '/main/article/current', category: 'Politics' },
      { source: 'mongo' }
    );

    expect(articleFindMock).toHaveBeenCalledTimes(2);
    expect(selectedFields).toHaveLength(2);
    for (const fields of selectedFields) {
      expect(fields.split(/\s+/)).not.toContain('content');
      expect(fields.split(/\s+/)).not.toContain('contentJson');
      expect(fields).toContain('workflow.status');
    }
    expect(candidateLimits).toEqual([60, 60]);
    expect(result.items.map((item) => item.id)).toEqual(['same-category', 'fallback']);
    expect(result.items.every((item) => !('content' in item))).toBe(true);
  });

  it('returns equivalent bounded related output from Mongo and the file store', async () => {
    const fixtures = [
      {
        ...publishedBase,
        _id: 'same-category',
        slug: 'same-category',
        title: 'Same Category',
        category: 'Politics',
        publishedAt: '2026-08-12T09:00:00.000Z',
        updatedAt: '2026-08-12T09:00:00.000Z',
      },
      {
        ...publishedBase,
        _id: 'fallback',
        slug: 'fallback',
        title: 'Fallback',
        category: 'Sports',
        publishedAt: '2026-08-12T10:00:00.000Z',
        updatedAt: '2026-08-12T10:00:00.000Z',
      },
    ];
    listAllStoredArticlesMock.mockResolvedValue(fixtures);
    const makeQuery = (docs: typeof fixtures) => ({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(docs),
          }),
        }),
      }),
    });
    articleFindMock
      .mockReturnValueOnce(makeQuery([fixtures[0]]))
      .mockReturnValueOnce(makeQuery([fixtures[1]]));

    const { listRelatedPublicArticles } = await import('@/lib/server/publicArticles');
    const current = { id: 'current', href: '/main/article/current', category: 'Politics' };
    const fileResult = await listRelatedPublicArticles(current, { source: 'file' });
    const mongoResult = await listRelatedPublicArticles(current, { source: 'mongo' });

    expect(mongoResult.items).toEqual(fileResult.items);
    expect(mongoResult.items.map((item) => item.id)).toEqual(['same-category', 'fallback']);
  });

  it.each(['current-story', '507f1f77bcf86cd799439011', 'previous-story'])(
    'preserves published detail resolution for token %s',
    async (token) => {
      const fixture = {
        ...publishedBase,
        _id: '507f1f77bcf86cd799439011',
        slug: 'current-story',
        previousSlugs: ['previous-story'],
        title: 'Current Story',
        content: 'Full story body',
        category: 'Politics',
        publishedAt: '2026-08-12T10:00:00.000Z',
        updatedAt: '2026-08-12T10:30:00.000Z',
      };
      listStoredArticleResolutionRecordsMock.mockResolvedValue([fixture]);
      getStoredArticleByIdStrictMock.mockResolvedValue(fixture);

      const { getPublicArticleBySlug } = await import('@/lib/server/publicArticles');
      const result = await getPublicArticleBySlug(token);

      expect(listStoredArticleResolutionRecordsMock).toHaveBeenCalledTimes(1);
      expect(result?.article).toEqual(
        expect.objectContaining({
          id: '507f1f77bcf86cd799439011',
          slug: 'current-story',
          previousSlugs: ['previous-story'],
        })
      );
    }
  );
});
