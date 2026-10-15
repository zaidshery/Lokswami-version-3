import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_CATEGORY_MODULES, selectHomepageCategories } from '@/lib/content/homepageDiscovery';

const connectDBMock = vi.fn();
const isMongoAvailableMock = vi.fn();
const listAllStoredArticlesMock = vi.fn();
const getStoredArticleByIdOrSlugMock = vi.fn();
const getStoredArticleByIdStrictMock = vi.fn();
const listStoredArticleResolutionRecordsMock = vi.fn();
const articleFindMock = vi.fn();
const articleFindByIdMock = vi.fn();
const articleFindOneMock = vi.fn();

vi.mock('server-only', () => ({}));

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

vi.mock('@/lib/server/video/videoService', () => ({
  videoService: {
    getHomeFeedVideos: async () => ({ rawVideos: [], rawShorts: [] }),
  },
}));

const baseStory = {
  summary: 'Summary text',
  image: '/image.jpg',
  author: 'Desk Reporter',
  views: 50,
  isBreaking: false,
  isTrending: false,
  workflow: { status: 'published' },
};

function createFixture() {
  return [
    // Madhya Pradesh (published and invalid)
    { ...baseStory, _id: 'mp-1', title: 'MP Story 1', slug: 'mp-story-1', category: 'Madhya Pradesh', publishedAt: '2026-05-10T12:00:00.000Z' },
    { ...baseStory, _id: 'mp-2', title: 'MP Story 2', slug: 'mp-story-2', category: 'madhya-pradesh', publishedAt: '2026-05-09T12:00:00.000Z' },
    { ...baseStory, _id: 'mp-draft', title: 'MP Draft', slug: 'mp-draft', category: 'Madhya Pradesh', publishedAt: '2026-05-11T12:00:00.000Z', workflow: { status: 'draft' } },
    { ...baseStory, _id: 'mp-scheduled', title: 'MP Scheduled', slug: 'mp-scheduled', category: 'Madhya Pradesh', publishedAt: '2099-01-01T00:00:00.000Z', workflow: { status: 'scheduled', scheduledFor: '2099-01-01T00:00:00.000Z' } },

    // National (multiple to test sorting and candidate count)
    ...Array.from({ length: 15 }, (_, i) => ({
      ...baseStory,
      _id: `nat-${i}`,
      title: `National Story ${i}`,
      slug: `national-story-${i}`,
      category: 'National',
      publishedAt: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
    })),

    // Politics
    { ...baseStory, _id: 'pol-1', title: 'Politics Story 1', slug: 'pol-story-1', category: 'Politics', publishedAt: '2026-05-08T10:00:00.000Z' },

    // Tech / Technology alias
    { ...baseStory, _id: 'tech-1', title: 'Tech Story 1', slug: 'tech-story-1', category: 'Tech', publishedAt: '2026-05-07T10:00:00.000Z' },
    { ...baseStory, _id: 'tech-2', title: 'Technology Story 2', slug: 'tech-story-2', category: 'technology', publishedAt: '2026-05-06T10:00:00.000Z' },

    // Crime
    { ...baseStory, _id: 'crime-1', title: 'Crime Story 1', slug: 'crime-story-1', category: 'Crime', publishedAt: '2026-05-05T10:00:00.000Z' },

    // Future-dated published record (should be excluded)
    { ...baseStory, _id: 'future-story', title: 'Future Story', slug: 'future-story', category: 'Sports', publishedAt: '2099-12-31T23:59:59.000Z' },
  ];
}

describe('homepage category file-store article reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
  });

  it('loads file store exactly once across all 13 homepage categories during getHomepageDiscovery in file mode', async () => {
    isMongoAvailableMock.mockResolvedValue(false);
    const fixture = createFixture();
    listAllStoredArticlesMock.mockResolvedValue(fixture);

    const { getHomepageDiscovery } = await import('@/lib/server/content/homepageDiscoveryService');
    const result = await getHomepageDiscovery();

    // MUST be called exactly once, NOT 13 times
    expect(listAllStoredArticlesMock).toHaveBeenCalledTimes(1);

    // Verify all 13 category keys exist
    expect(Object.keys(result.categoryArticles)).toHaveLength(13);
    for (const slug of HOMEPAGE_CATEGORY_MODULES) {
      expect(result.categoryArticles).toHaveProperty(slug);
    }

    // Verify MP stories: valid only, drafts and scheduled excluded, correct order
    const mpStories = result.categoryArticles['madhya-pradesh']!;
    expect(mpStories.map((s) => s.id)).toEqual(['mp-1', 'mp-2']);
    expect(mpStories.every((s) => s.category.toLowerCase().includes('madhya') || s.category.toLowerCase().includes('mp'))).toBe(true);

    // Verify National: sorted newest first, drafts excluded
    const natStories = result.categoryArticles.national!;
    expect(natStories.length).toBe(13); // capped at HOMEPAGE_CATEGORY_CANDIDATE_LIMIT = 13
    expect(natStories[0].id).toBe('nat-14'); // newest (May 15)

    // Verify Tech: aliases matched ('Tech' and 'technology')
    const techStories = result.categoryArticles.technology!;
    expect(techStories.map((s) => s.id)).toEqual(['tech-1', 'tech-2']);

    // Verify empty categories return empty array
    expect(result.categoryArticles.entertainment).toEqual([]);
    expect(result.categoryArticles.business).toEqual([]);
  });

  it('does NOT invoke file-store loading when Mongo is available', async () => {
    isMongoAvailableMock.mockResolvedValue(true);
    const makeQuery = (docs: unknown[]) => ({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maxTimeMS: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue(docs),
            }),
          }),
        }),
      }),
    });
    articleFindMock.mockReturnValue(makeQuery([]));

    const { getHomepageDiscovery } = await import('@/lib/server/content/homepageDiscoveryService');
    const result = await getHomepageDiscovery();

    // File store must not be loaded when Mongo is healthy
    expect(listAllStoredArticlesMock).not.toHaveBeenCalled();
    expect(articleFindMock).toHaveBeenCalledTimes(13);
    expect(Object.keys(result.categoryArticles)).toHaveLength(13);
  });

  it('preserves exact semantic equivalence with legacy per-category listPublicArticles queries', async () => {
    isMongoAvailableMock.mockResolvedValue(false);
    const fixture = createFixture();
    listAllStoredArticlesMock.mockResolvedValue(fixture);

    const { listPublicArticles, listPublicCategoryArticles } = await import('@/lib/server/publicArticles');

    // 1. Run optimized batch
    const batchResult = await listPublicCategoryArticles(HOMEPAGE_CATEGORY_MODULES, { limit: 13 });

    // 2. Run legacy independent queries for each category
    const legacyResults: Record<string, unknown> = {};
    for (const slug of HOMEPAGE_CATEGORY_MODULES) {
      legacyResults[slug] = await listPublicArticles({ category: slug, limit: 13 });
    }

    // 3. Compare all 13 categories
    for (const slug of HOMEPAGE_CATEGORY_MODULES) {
      const batchItems = batchResult[slug]?.items || [];
      const legacyItems = (legacyResults[slug] as { items: unknown[] })?.items || [];
      expect(batchItems).toEqual(legacyItems);
    }
  });

  it('supplies full candidate quota (up to 13) for progressive reveal and Load More without premature truncation', async () => {
    isMongoAvailableMock.mockResolvedValue(false);
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ...baseStory,
      _id: `nat-candidate-${i}`,
      title: `Candidate ${i}`,
      slug: `candidate-${i}`,
      category: 'National',
      publishedAt: `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    listAllStoredArticlesMock.mockResolvedValue(rows);

    const { listPublicCategoryArticles } = await import('@/lib/server/publicArticles');
    const { mapPublicArticlesToUiArticles } = await import('@/lib/content/publicArticles');

    const result = await listPublicCategoryArticles(HOMEPAGE_CATEGORY_MODULES, { limit: 13 });
    const nationalItems = result.national.items;

    // Full 13 candidates must be provided
    expect(nationalItems).toHaveLength(13);

    // Initial 4 and subsequent Load More candidates are retained by selectHomepageCategories
    const sections = selectHomepageCategories([], {
      national: mapPublicArticlesToUiArticles(nationalItems),
    });
    expect(sections[0].category.slug).toBe('national');
    expect(sections[0].articles).toHaveLength(13);
  });
});
