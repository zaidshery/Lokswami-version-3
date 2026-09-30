import { act, createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPublicArticleByResolution: vi.fn(),
  resolvePublicArticleToken: vi.fn(),
  listRelatedPublicArticles: vi.fn(),
  requestArticleTtsAudio: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock('@/lib/server/publicArticles', () => ({
  getPublicArticleByResolution: mocks.getPublicArticleByResolution,
  resolvePublicArticleToken: mocks.resolvePublicArticleToken,
  PublicArticleResolutionError: class PublicArticleResolutionError extends Error {},
  listRelatedPublicArticles: mocks.listRelatedPublicArticles,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    createElement('img', { alt, src }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: (
    selector: (state: { language: 'en'; currentUser: null }) => unknown
  ) => selector({ language: 'en', currentUser: null }),
}));

vi.mock('@/lib/ai/ttsClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/ttsClient')>(
    '@/lib/ai/ttsClient'
  );
  return { ...actual, requestArticleTtsAudio: mocks.requestArticleTtsAudio };
});

vi.mock('@/components/ui/NewsCard', () => ({
  default: ({ article }: { article: { title: string; slug?: string; id: string } }) =>
    createElement(
      'a',
      { href: `/main/article/${article.slug || article.id}` },
      article.title
    ),
}));

vi.mock('@/components/ui/ShareMenu', () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) =>
    createElement('button', { type: 'button', 'aria-label': ariaLabel }, 'Share'),
}));

const publicArticle = {
  _id: 'article-1',
  id: 'article-1',
  slug: 'published-story',
  previousSlugs: ['previous-story'],
  title: 'Published story headline',
  summary: 'A safe published story summary used when content is empty.',
  content: `<p>${'Substantive published article body text. '.repeat(5)}</p>`,
  image: '/story.jpg',
  category: 'Regional',
  author: 'News Desk',
  publishedAt: '2026-08-12T08:00:00.000Z',
  updatedAt: '2026-08-12T08:30:00.000Z',
  views: 12,
  isBreaking: false,
  isTrending: false,
  city: 'Indore',
  href: '/main/article/published-story',
  seo: {
    metaTitle: 'Internal metadata title',
    metaDescription: 'Internal metadata description',
    ogImage: '/internal-og.jpg',
    canonicalUrl: 'https://lokswami.com/main/article/published-story',
    focusKeyword: 'internal focus keyword',
    secondaryKeywords: 'internal, secondary, keywords',
    featuredImageAlt: 'Public featured image alt',
    featuredImageCaption: 'Public featured image caption',
    imageCredit: 'Public featured image credit',
    includeInNewsSitemap: true,
    majorUpdateNote: 'Internal major update note',
  },
  workflow: { status: 'published' },
  assignment: { assignedTo: 'copy-desk' },
  moderation: { reviewedBy: 'editor' },
  revisions: [{ id: 'revision-1' }],
};

function makeRelated(index: number) {
  return {
    ...publicArticle,
    _id: `related-${index}`,
    id: `related-${index}`,
    slug: `related-story-${index}`,
    title: `Related story ${index}`,
    href: `/main/article/related-story-${index}`,
    publishedAt: `2026-08-${String(11 - index).padStart(2, '0')}T08:00:00.000Z`,
  };
}

async function renderArticlePage(token = 'published-story') {
  const ArticlePage = (await import('@/app/(reader)/main/article/[id]/page')).default;
  const element = await ArticlePage({ params: Promise.resolve({ id: token }) });
  return { element, html: renderToString(element) };
}

describe('article page server rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePublicArticleToken.mockResolvedValue({
      kind: 'current',
      source: 'file',
      article: publicArticle,
      authoritativePath: '/main/article/published-story',
      isExactAuthority: true,
    });
    mocks.getPublicArticleByResolution.mockResolvedValue({
      article: publicArticle,
      source: 'file',
    });
    mocks.listRelatedPublicArticles.mockResolvedValue({
      items: Array.from({ length: 6 }, (_, index) => makeRelated(index + 1)),
      source: 'file',
      limit: 20,
    });
  });

  it('renders the published h1, genuine body, and first four crawlable related anchors without a loading placeholder', async () => {
    const { html } = await renderArticlePage();
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('h1')?.textContent).toBe('Published story headline');
    expect(container.querySelector('[data-article-reading-progress]')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('article > header h1')).not.toBeNull();
    expect(container.querySelector('article > figure img')).toHaveAttribute('alt', 'Public featured image alt');
    expect(container.querySelector('article > figure figcaption')).toHaveTextContent('Public featured image caption');
    expect(container.querySelector('article > figure figcaption')).toHaveTextContent('Public featured image credit');
    expect(container.querySelectorAll('article > header time')).toHaveLength(2);
    expect(container.querySelector('[data-article-body]')?.textContent).toContain(
      'Substantive published article body text.'
    );
    expect(container.textContent).not.toMatch(/loading article|लेख लोड हो रहा है/i);

    const relatedLinks = container.querySelectorAll(
      '[data-related-articles] a[href^="/main/article/"]'
    );
    expect(relatedLinks).toHaveLength(4);
    expect(Array.from(relatedLinks, (link) => link.getAttribute('href'))).toEqual([
      '/main/article/related-story-1',
      '/main/article/related-story-2',
      '/main/article/related-story-3',
      '/main/article/related-story-4',
    ]);
  });

  it('renders same-ID/current-slug SSR content and reader actions without redirecting', async () => {
    const sameId = '507f1f77bcf86cd799439011';
    const sameIdArticle = {
      ...publicArticle,
      _id: sameId,
      id: sameId,
      slug: sameId,
      previousSlugs: [],
      href: `/main/article/${sameId}`,
      seo: {
        ...publicArticle.seo,
        canonicalUrl: `https://lokswami.com/main/article/${sameId}`,
      },
    };
    mocks.resolvePublicArticleToken.mockResolvedValue({
      kind: 'current',
      source: 'mongo',
      article: sameIdArticle,
      authoritativePath: sameIdArticle.href,
      isExactAuthority: true,
    });
    mocks.getPublicArticleByResolution.mockResolvedValue({
      article: sameIdArticle,
      source: 'mongo',
    });

    const { html } = await renderArticlePage(sameId);
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(container.querySelector('h1')?.textContent).toBe('Published story headline');
    expect(container.querySelector('[data-article-body]')?.textContent).toContain(
      'Substantive published article body text.'
    );
    expect(container.querySelector('button[aria-label="Save article"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Share article"]')).not.toBeNull();
  });

  it('renders a published article safely when no related article is eligible', async () => {
    mocks.listRelatedPublicArticles.mockResolvedValue({ items: [], source: 'file', limit: 20 });

    const { html } = await renderArticlePage();

    expect(html).toContain('Published story headline');
    expect(html).toContain('data-article-body');
    expect(html).not.toContain('data-related-articles');
  });

  it('passes only reader-safe fields across the server-to-client boundary at runtime', async () => {
    const { element } = await renderArticlePage();
    const props = element.props as {
      article: Record<string, unknown> & { seo?: Record<string, unknown> };
    };
    const serializedArticle = JSON.parse(JSON.stringify(props.article)) as Record<
      string,
      unknown
    > & { seo?: Record<string, unknown> };

    expect(element.key).toBe('article-1');
    expect(serializedArticle.seo).toEqual({
      featuredImageAlt: 'Public featured image alt',
      featuredImageCaption: 'Public featured image caption',
      featuredImageCredit: 'Public featured image credit',
    });
    expect(serializedArticle.seo).not.toHaveProperty('focusKeyword');
    expect(serializedArticle.seo).not.toHaveProperty('secondaryKeywords');
    expect(serializedArticle.seo).not.toHaveProperty('includeInNewsSitemap');
    expect(serializedArticle.seo).not.toHaveProperty('majorUpdateNote');
    expect(serializedArticle).not.toHaveProperty('workflow');
    expect(serializedArticle).not.toHaveProperty('assignment');
    expect(serializedArticle).not.toHaveProperty('moderation');
    expect(serializedArticle).not.toHaveProperty('revisions');
  });

  it.each(['draft', 'scheduled', 'rejected', 'approved', 'archived'])(
    'exposes neither body nor related links for a %s article',
    async () => {
      mocks.resolvePublicArticleToken.mockResolvedValue({ kind: 'missing' });
      const { loadArticleDetailPageData } = await import(
        '@/app/(reader)/main/article/[id]/page'
      );
      await expect(loadArticleDetailPageData('hidden-story')).resolves.toEqual({
        article: null,
        relatedArticles: [],
      });
      expect(mocks.listRelatedPublicArticles).not.toHaveBeenCalled();
    }
  );

  it('fails closed without rendering mock content when the public service errors', async () => {
    mocks.resolvePublicArticleToken.mockResolvedValue({ kind: 'unavailable' });
    const { loadArticleDetailPageData } = await import(
      '@/app/(reader)/main/article/[id]/page'
    );
    await expect(loadArticleDetailPageData('published-story')).rejects.toThrow();
    expect(mocks.getPublicArticleByResolution).not.toHaveBeenCalled();
  });

  it('hydrates the same server markup without warnings and does not request audio', async () => {
    const { element, html } = await renderArticlePage();
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reactTestGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const previousActEnvironment = reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
    const hadActEnvironment = Object.prototype.hasOwnProperty.call(
      reactTestGlobal,
      'IS_REACT_ACT_ENVIRONMENT'
    );
    reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    let root: Root | undefined;

    try {
      await act(async () => {
        root = hydrateRoot(container, element);
        await Promise.resolve();
      });

      expect(consoleError).not.toHaveBeenCalled();
      expect(mocks.requestArticleTtsAudio).not.toHaveBeenCalled();
    } finally {
      try {
        if (root) {
          await act(async () => root?.unmount());
        }
      } finally {
        container.remove();
        consoleError.mockRestore();
        if (hadActEnvironment) {
          reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
        } else {
          delete reactTestGlobal.IS_REACT_ACT_ENVIRONMENT;
        }
      }
    }
  });
});
