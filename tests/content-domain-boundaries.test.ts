import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicArticleService } from '@/lib/server/content/publicArticleService';
import { publicTaxonomyService } from '@/lib/server/content/publicTaxonomyService';

const {
  connectDBMock,
  isMongoAvailableMock,
  listAllStoredArticlesMock,
  getStoredArticleByIdOrSlugMock,
  getStoredArticleByIdStrictMock,
  listStoredArticleResolutionRecordsMock,
  articleFindMock,
  articleFindByIdMock,
  articleFindOneMock,
} = vi.hoisted(() => ({
  connectDBMock: vi.fn(),
  isMongoAvailableMock: vi.fn(),
  listAllStoredArticlesMock: vi.fn(),
  getStoredArticleByIdOrSlugMock: vi.fn(),
  getStoredArticleByIdStrictMock: vi.fn(),
  listStoredArticleResolutionRecordsMock: vi.fn(),
  articleFindMock: vi.fn(),
  articleFindByIdMock: vi.fn(),
  articleFindOneMock: vi.fn(),
}));

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

const publishedArticle = {
  _id: '507f1f77bcf86cd799439011',
  id: '507f1f77bcf86cd799439011',
  slug: 'test-story',
  previousSlugs: ['old-story'],
  title: 'Test Story',
  summary: 'Test summary of the story',
  content: '<p>Full content of the test story</p>',
  image: '/images/test.jpg',
  category: 'National',
  author: 'Reporter Desk',
  publishedAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T11:00:00.000Z',
  views: 120,
  isBreaking: false,
  isTrending: true,
  city: 'Indore',
  workflow: {
    status: 'published',
  },
  seo: {
    title: 'SEO Title',
    description: 'SEO Description',
  },
};

const draftArticle = {
  _id: '507f1f77bcf86cd799439012',
  id: '507f1f77bcf86cd799439012',
  slug: 'draft-story',
  title: 'Draft Story',
  summary: 'Draft summary',
  content: '<p>Draft content</p>',
  image: '/images/draft.jpg',
  category: 'Politics',
  author: 'Staff Writer',
  publishedAt: '2026-03-01T10:00:00.000Z',
  views: 0,
  workflow: {
    status: 'draft',
  },
};

const scheduledFutureArticle = {
  _id: '507f1f77bcf86cd799439013',
  id: '507f1f77bcf86cd799439013',
  slug: 'future-story',
  title: 'Future Story',
  summary: 'Future summary',
  content: '<p>Future content</p>',
  image: '/images/future.jpg',
  category: 'National',
  author: 'Staff Writer',
  publishedAt: '2026-12-01T10:00:00.000Z',
  views: 0,
  workflow: {
    status: 'scheduled',
    scheduledFor: new Date('2026-12-01T10:00:00.000Z'),
  },
};

describe('Phase 2.1 Content Domain Boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    isMongoAvailableMock.mockResolvedValue(false);
  });

  describe('ArticleRepository & PublicArticleService list articles', () => {
    it('filters out draft and scheduled-future articles from the file store', async () => {
      listAllStoredArticlesMock.mockResolvedValue([
        publishedArticle,
        draftArticle,
        scheduledFutureArticle,
      ]);

      const result = await publicArticleService.listPublicArticles({ limit: 10 });
      expect(result.source).toBe('file');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe(publishedArticle.id);
      expect(result.items[0]?.title).toBe(publishedArticle.title);
      expect(result.items[0]?.isTrending).toBe(true);
    });

    it('filters by category and city accurately', async () => {
      listAllStoredArticlesMock.mockResolvedValue([
        publishedArticle,
        {
          ...publishedArticle,
          _id: '507f1f77bcf86cd799439014',
          id: '507f1f77bcf86cd799439014',
          slug: 'bhopal-sports',
          category: 'Sports',
          city: 'Bhopal',
        },
      ]);

      const nationalResult = await publicArticleService.listPublicArticles({
        category: 'National',
      });
      expect(nationalResult.items).toHaveLength(1);
      expect(nationalResult.items[0]?.category).toBe('National');

      const bhopalResult = await publicArticleService.listPublicArticles({
        city: 'bhopal',
      });
      expect(bhopalResult.items).toHaveLength(1);
      expect(bhopalResult.items[0]?.city).toBe('Bhopal');
    });

    it('supports search query filtering over title, summary, category, author, and city', async () => {
      listAllStoredArticlesMock.mockResolvedValue([publishedArticle]);

      const matched = await publicArticleService.listPublicArticles({
        query: 'Reporter Desk',
      });
      expect(matched.items).toHaveLength(1);

      const unmatched = await publicArticleService.listPublicArticles({
        query: 'nonexistent phrase',
      });
      expect(unmatched.items).toHaveLength(0);
    });

    it('implements cursor pagination with publishedAt and ID tie-breaking', async () => {
      const art1 = {
        ...publishedArticle,
        _id: '507f1f77bcf86cd799439020',
        id: '507f1f77bcf86cd799439020',
        publishedAt: '2026-03-01T12:00:00.000Z',
      };
      const art2 = {
        ...publishedArticle,
        _id: '507f1f77bcf86cd799439019',
        id: '507f1f77bcf86cd799439019',
        publishedAt: '2026-03-01T12:00:00.000Z',
      };
      const art3 = {
        ...publishedArticle,
        _id: '507f1f77bcf86cd799439018',
        id: '507f1f77bcf86cd799439018',
        publishedAt: '2026-03-01T10:00:00.000Z',
      };

      listAllStoredArticlesMock.mockResolvedValue([art1, art2, art3]);

      const page1 = await publicArticleService.listPublicArticles({ limit: 1 });
      expect(page1.items).toHaveLength(1);
      expect(page1.items[0]?.id).toBe(art1.id);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toEqual({
        publishedAt: art1.publishedAt,
        id: art1.id,
      });

      const page2 = await publicArticleService.listPublicArticles({
        limit: 1,
        cursorPublishedAt: page1.nextCursor?.publishedAt,
        cursorId: page1.nextCursor?.id,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]?.id).toBe(art2.id);
      expect(page2.hasMore).toBe(true);

      const page3 = await publicArticleService.listPublicArticles({
        limit: 1,
        cursorPublishedAt: page2.nextCursor?.publishedAt,
        cursorId: page2.nextCursor?.id,
      });
      expect(page3.items).toHaveLength(1);
      expect(page3.items[0]?.id).toBe(art3.id);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();
    });
  });

  describe('Article detail and resolution', () => {
    it('resolves current slug in file fallback mode', async () => {
      listStoredArticleResolutionRecordsMock.mockResolvedValue([publishedArticle]);
      getStoredArticleByIdStrictMock.mockResolvedValue(publishedArticle);

      const detail = await publicArticleService.getPublicArticleBySlug('test-story');
      expect(detail).not.toBeNull();
      expect(detail?.article.slug).toBe('test-story');
      expect(detail?.article.content).toBe('<p>Full content of the test story</p>');
      expect(detail?.source).toBe('file');
    });

    it('resolves previous slug and provides canonical authority path', async () => {
      listStoredArticleResolutionRecordsMock.mockResolvedValue([publishedArticle]);
      getStoredArticleByIdStrictMock.mockResolvedValue(publishedArticle);

      const resolution = await publicArticleService.resolvePublicArticleToken('old-story');
      expect(resolution.kind).toBe('previous');
      if (resolution.kind === 'previous') {
        expect(resolution.isExactAuthority).toBe(false);
        expect(resolution.article.slug).toBe('test-story');
      }
    });

    it('returns null for nonexistent or unpublished article slugs', async () => {
      listStoredArticleResolutionRecordsMock.mockResolvedValue([draftArticle]);

      const detail = await publicArticleService.getPublicArticleBySlug('draft-story');
      expect(detail).toBeNull();
    });

    it('fetches legacy raw article document by ID or slug', async () => {
      getStoredArticleByIdOrSlugMock.mockResolvedValue(publishedArticle);

      const raw = await publicArticleService.getLegacyArticleByIdOrSlug('test-story');
      expect(raw).not.toBeNull();
      expect((raw as typeof publishedArticle)._id).toBe(publishedArticle._id);
    });
  });

  describe('Breaking & Feed queries', () => {
    it('returns breaking articles sorted by publish time', async () => {
      listAllStoredArticlesMock.mockResolvedValue([
        {
          ...publishedArticle,
          _id: 'breaking-1',
          id: 'breaking-1',
          title: 'Breaking News 1',
          isBreaking: true,
          publishedAt: '2026-03-01T15:00:00.000Z',
        },
        {
          ...publishedArticle,
          _id: 'breaking-2',
          id: 'breaking-2',
          title: 'Breaking News 2',
          isBreaking: true,
          publishedAt: '2026-03-01T16:00:00.000Z',
        },
      ]);

      const breaking = await publicArticleService.getBreakingArticles(5);
      expect(breaking).toHaveLength(2);
      expect(breaking[0]?.id).toBe('breaking-2');
      expect(breaking[1]?.id).toBe('breaking-1');
    });

    it('returns latest legacy feed with cursor metadata', async () => {
      listAllStoredArticlesMock.mockResolvedValue([publishedArticle]);

      const feed = await publicArticleService.getLatestFeed(10);
      expect(feed.items).toHaveLength(1);
      expect(feed.items[0]?.id).toBe(publishedArticle.id);
      expect(feed.limit).toBe(10);
    });
  });

  describe('Taxonomy Service', () => {
    it('lists public categories and cities with required properties', () => {
      const categories = publicTaxonomyService.listPublicCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
      expect(categories[0]).toHaveProperty('slug');
      expect(categories[0]).toHaveProperty('name');
      expect(categories[0]).toHaveProperty('href');

      const cities = publicTaxonomyService.listPublicCities();
      expect(Array.isArray(cities)).toBe(true);
      expect(cities.length).toBeGreaterThan(0);
      expect(cities[0]).toHaveProperty('slug');
      expect(cities[0]).toHaveProperty('name');
      expect(cities[0]).toHaveProperty('href');
    });
  });
});
