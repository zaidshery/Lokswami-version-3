import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const getArticleForMetadataMock = vi.fn();

vi.mock('@/lib/content/serverArticles', () => ({
  getArticleForMetadata: getArticleForMetadataMock,
}));

const publishedArticle = {
  id: 'article-1',
  slug: 'brics-agriculture-meeting-indore',
  previousSlugs: [],
  title: 'BRICS agriculture meeting begins in Indore',
  summary: 'Delegates shared a local agriculture cooperation update.',
  image: 'https://cdn.lokswami.com/articles/brics.jpg',
  category: 'National',
  author: 'Lokswami Desk',
  publishedAt: '2026-05-06T09:00:00.000Z',
  updatedAt: '2026-05-06T10:00:00.000Z',
  seo: {
    metaTitle: 'BRICS agriculture meeting begins in Indore',
    metaDescription: 'Delegates shared a local agriculture cooperation update.',
    ogImage: '',
    canonicalUrl: '',
    focusKeyword: '',
    secondaryKeywords: '',
    featuredImageAlt: 'BRICS agriculture delegates in Indore',
    featuredImageCaption: '',
    imageCredit: '',
    authorProfileUrl: '',
    includeInNewsSitemap: true,
    majorUpdateNote: '',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  getArticleForMetadataMock.mockResolvedValue(publishedArticle);
});

afterEach(() => {
  if (typeof originalSiteUrl === 'undefined') {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    return;
  }

  process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

describe('short share redirect routes', () => {
  it('builds previewable short article metadata with a PNG social image', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lokswami.com';

    const { generateMetadata, resolveShortArticleTargetPath } = await import('@/app/a/[id]/page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'brics-agriculture-meeting-indore' }),
    });

    expect(getArticleForMetadataMock).toHaveBeenCalledWith(
      'brics-agriculture-meeting-indore'
    );
    expect(resolveShortArticleTargetPath('old-token', publishedArticle)).toBe(
      '/main/article/brics-agriculture-meeting-indore'
    );
    expect(metadata).toEqual(
      expect.objectContaining({
        title: 'BRICS agriculture meeting begins in Indore | Lokswami',
        alternates: {
          canonical: 'https://lokswami.com/main/article/brics-agriculture-meeting-indore',
        },
        robots: expect.objectContaining({
          index: false,
          follow: true,
          'max-image-preview': 'large',
        }),
        openGraph: expect.objectContaining({
          url: 'https://lokswami.com/main/article/brics-agriculture-meeting-indore',
          images: [
            expect.objectContaining({
              url: 'https://lokswami.com/api/og/article/brics-agriculture-meeting-indore',
              width: 1200,
              height: 630,
              type: 'image/png',
            }),
          ],
        }),
        twitter: expect.objectContaining({
          card: 'summary_large_image',
          images: ['https://lokswami.com/api/og/article/brics-agriculture-meeting-indore'],
        }),
      })
    );
  });

  it('falls back to the configured public site URL for unknown article share metadata', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lokswami.com';
    getArticleForMetadataMock.mockResolvedValue(null);

    const { generateMetadata, resolveShortArticleTargetPath } = await import('@/app/a/[id]/page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'indore-civic-update' }),
    });

    expect(resolveShortArticleTargetPath('indore-civic-update', null)).toBe(
      '/main/article/indore-civic-update'
    );
    expect(metadata).toEqual(
      expect.objectContaining({
        title: 'Article | Lokswami',
        robots: { index: false, follow: true },
        openGraph: expect.objectContaining({
          images: [
            expect.objectContaining({
              url: 'https://lokswami.com/lokswami-share-preview.png',
              type: 'image/png',
            }),
          ],
        }),
      })
    );
  });

  it('resolves short e-paper share URLs to the reader with full query names', async () => {
    const { resolveShortEpaperTargetPath } = await import('@/app/e/[paper]/page');
    expect(
      resolveShortEpaperTargetPath({ paperId: 'paper-1', page: '12', story: 'front' })
    ).toBe('/main/epaper?paper=paper-1&page=12&story=front');

    expect(resolveShortEpaperTargetPath({ paperId: 'paper-1', page: 7 })).toBe(
      '/main/epaper?paper=paper-1&page=7'
    );

    expect(resolveShortEpaperTargetPath({ paperId: 'paper-1', story: 'lead-story' })).toBe(
      '/main/epaper?paper=paper-1&story=lead-story'
    );

    expect(resolveShortEpaperTargetPath({})).toBe('/main/epaper');
  });

  it('builds rich social metadata for short e-paper share pages', async () => {
    const { generateMetadata } = await import('@/app/e/[paper]/page');
    const metadata = await generateMetadata({
      params: Promise.resolve({ paper: 'paper-1' }),
      searchParams: Promise.resolve({ p: '2', s: 'top-news' }),
    });

    expect(metadata).toBeDefined();
    expect(metadata.openGraph).toBeDefined();
  });
});
