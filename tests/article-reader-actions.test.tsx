import { act, createElement, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestArticleTtsAudio: vi.fn(),
  routerPush: vi.fn(),
  shareProps: vi.fn(),
  storeState: {
    language: 'en' as const,
    currentUser: null as null | { savedArticles: string[] },
  },
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
  useAppStore: (selector: (state: typeof mocks.storeState) => unknown) =>
    selector(mocks.storeState),
}));

vi.mock('@/lib/ai/ttsClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/ttsClient')>(
    '@/lib/ai/ttsClient'
  );
  return {
    ...actual,
    requestArticleTtsAudio: mocks.requestArticleTtsAudio,
  };
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
  default: (props: { ariaLabel: string; title: string; url: string }) => {
    mocks.shareProps(props);
    return createElement('button', { type: 'button', 'aria-label': props.ariaLabel }, 'Share');
  },
}));

describe('article reader actions', () => {
  const article = {
    id: '507f1f77bcf86cd799439011',
    slug: 'reader-story',
    title: 'Reader story headline',
    summary: 'A concise reader story summary.',
    content: '<p>Complete article content.</p>',
    image: '/story.jpg',
    category: 'Regional',
    author: { id: 'desk', name: 'News Desk', avatar: '/avatar.jpg' },
    publishedAt: '2026-07-13T08:00:00.000Z',
    views: 12,
  };
  const relatedArticles = Array.from({ length: 10 }, (_, index) => ({
    ...article,
    id: `related-${index + 1}`,
    slug: `related-${index + 1}`,
    title: `Related story ${index + 1}`,
  }));

  class MockAudio {
    src: string;
    preload = '';
    currentTime = 0;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    load = vi.fn();
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();

    constructor(src: string) {
      this.src = new URL(src, window.location.href).href;
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storeState.currentUser = null;
    mocks.requestArticleTtsAudio.mockResolvedValue({
      provider: 'manual',
      model: 'manual-upload',
      voice: '',
      mimeType: 'audio/mpeg',
      audioUrl: '/reader-story.mp3',
      chunkCount: 1,
    });
    vi.stubGlobal('Audio', MockAudio);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not request article audio until the reader chooses Listen', async () => {
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;
    const user = userEvent.setup();

    render(createElement(ArticleDetailClient, { article, relatedArticles }));

    expect(
      await screen.findByRole('heading', { name: 'Reader story headline' })
    ).toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.requestArticleTtsAudio).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Listen to article' }));

    await waitFor(() => {
      expect(mocks.requestArticleTtsAudio).toHaveBeenCalledTimes(1);
      expect(mocks.requestArticleTtsAudio).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011', expect.any(AbortSignal)
      );
    });
  });

  it('preserves sign-in bookmark handling and passes the article share contract through', async () => {
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;
    const user = userEvent.setup();

    render(createElement(ArticleDetailClient, { article, relatedArticles }));

    await user.click(screen.getByRole('button', { name: 'Save article' }));

    expect(mocks.routerPush).toHaveBeenCalledWith('/signin?redirect=/main/saved');
    expect(screen.getByRole('button', { name: 'Share article on WhatsApp' })).toBeInTheDocument();
    const actions = screen.getByRole('button', { name: 'Save article' }).parentElement!;
    expect(actions).toContainElement(screen.getByRole('button', { name: 'Share article on WhatsApp' }));
    expect(actions).toContainElement(screen.getByRole('link', { name: 'E-Paper' }));
    expect(actions.parentElement?.parentElement).toContainElement(screen.getByRole('button', { name: 'View profile picture of News Desk' }));
    expect(mocks.shareProps).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Reader story headline',
        url: '/main/article/reader-story',
        directWhatsApp: true,
        triggerIcon: 'whatsapp',
      })
    );
  });

  it('explains unavailable saving without claiming a successful bookmark', async () => {
    const ArticleDetailClient = (await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')).default;
    render(createElement(ArticleDetailClient, { article: { ...article, id: 'unsupported-id' }, relatedArticles: [] }));
    const save = screen.getByRole('button', { name: 'Save article' });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('aria-pressed', 'false');
    expect(save).toHaveAccessibleDescription('Saving is unavailable for this article.');
  });

  it('preserves authenticated saving and only marks success after the server confirms it', async () => {
    mocks.storeState.currentUser = { savedArticles: [] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { saved: true, savedArticleIds: [article.id] } }) });
    vi.stubGlobal('fetch', fetchMock);
    const ArticleDetailClient = (await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')).default;
    const savedEvent = vi.fn();
    window.addEventListener('lokswami:saved-article-updated', savedEvent);
    const view = render(createElement(ArticleDetailClient, { article, relatedArticles: [] }));
    expect(screen.getByRole('button', { name: 'Save article' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save article' }));
    await waitFor(() => expect(savedEvent).toHaveBeenCalledOnce());
    expect((savedEvent.mock.calls[0][0] as CustomEvent).detail).toEqual(expect.objectContaining({ articleId: article.id, saved: true }));
    mocks.storeState.currentUser = { savedArticles: [article.id] };
    view.rerender(createElement(ArticleDetailClient, { article, relatedArticles: [] }));
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toHaveAttribute('aria-pressed', 'true');
    window.removeEventListener('lokswami:saved-article-updated', savedEvent);
    expect(fetchMock).toHaveBeenCalledWith('/api/user/save', expect.objectContaining({ method: 'POST', body: JSON.stringify({ articleId: article.id }) }));
  });

  it('generates the AI summary only when requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { bullets: ['First verified point', 'Second verified point'] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;
    const user = userEvent.setup();

    render(createElement(ArticleDetailClient, { article, relatedArticles }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/ai/summary', expect.anything());
    expect(screen.getByRole('button', { name: 'Listen to article' }).nextElementSibling).toBe(screen.getByRole('button', { name: 'Summary' }));

    await user.click(screen.getByRole('button', { name: 'Summary' }));

    expect(await screen.findByText('First verified point')).toBeInTheDocument();
    expect(mocks.requestArticleTtsAudio).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/summary',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('clears a completed article summary when navigation replaces the article', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { bullets: ['Article A verified point'] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;
    const user = userEvent.setup();
    const articleB = {
      ...article,
      id: '507f191e810c19729de860ea',
      slug: 'reader-story-b',
      title: 'Reader story B headline',
    };
    const view = render(
      createElement(ArticleDetailClient, {
        article,
        relatedArticles,
      })
    );

    await user.click(screen.getByRole('button', { name: 'Summary' }));
    expect(await screen.findByText('Article A verified point')).toBeInTheDocument();

    view.rerender(
      createElement(ArticleDetailClient, {
        article: articleB,
        relatedArticles: [],
      })
    );

    expect(screen.getByRole('heading', { name: articleB.title })).toBeInTheDocument();
    expect(screen.queryByText('Article A verified point')).not.toBeInTheDocument();
  });

  it('does not apply a late summary response from the previous article', async () => {
    let resolveSummary!: (response: Response) => void;
    const summaryResponse = new Promise<Response>((resolve) => {
      resolveSummary = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(summaryResponse);
    vi.stubGlobal('fetch', fetchMock);
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;
    const user = userEvent.setup();
    const articleB = {
      ...article,
      id: '507f191e810c19729de860ea',
      slug: 'reader-story-b',
      title: 'Reader story B headline',
    };
    const view = render(
      createElement(ArticleDetailClient, {
        article,
        relatedArticles,
      })
    );

    await user.click(screen.getByRole('button', { name: 'Summary' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/summary',
      expect.objectContaining({ method: 'POST' })
    );

    view.rerender(
      createElement(ArticleDetailClient, {
        article: articleB,
        relatedArticles: [],
      })
    );
    resolveSummary({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { bullets: ['Late Article A point'] },
      }),
    } as unknown as Response);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole('heading', { name: articleB.title })).toBeInTheDocument();
    expect(screen.queryByText('Late Article A point')).not.toBeInTheDocument();
  });

  it('does not inherit reading progress and tracks the new article once after its own threshold', async () => {
    let scrollY = 0;
    const scrollYSpy = vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    const scrollHeightSpy = vi
      .spyOn(document.documentElement, 'scrollHeight', 'get')
      .mockReturnValue(1000);
    const clientHeightSpy = vi
      .spyOn(document.documentElement, 'clientHeight', 'get')
      .mockReturnValue(100);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(100);
    const articleBounds = () => ({ top: -scrollY, height: 1000 } as DOMRect);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;
    const articleB = {
      ...article,
      id: '507f191e810c19729de860ea',
      slug: 'reader-story-b',
      title: 'Reader story B headline',
    };
    const view = render(
      createElement(ArticleDetailClient, {
        key: article.id,
        article,
        relatedArticles,
      })
    );

    vi.spyOn(view.container.querySelector('article')!, 'getBoundingClientRect').mockImplementation(articleBounds);
    scrollY = 810;
    fireEvent.scroll(window);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/user/track',
      expect.objectContaining({ body: expect.stringContaining(article.id) })
    );

    view.rerender(
      createElement(ArticleDetailClient, {
        key: articleB.id,
        article: articleB,
        relatedArticles: [],
      })
    );
    vi.spyOn(view.container.querySelector('article')!, 'getBoundingClientRect').mockImplementation(articleBounds);
    await act(async () => {
      await Promise.resolve();
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    scrollY = 810;
    fireEvent.scroll(window);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/user/track',
      expect.objectContaining({ body: expect.stringContaining(articleB.id) })
    );
    fireEvent.scroll(window);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    scrollYSpy.mockRestore();
    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('preserves saved-article state and emits the bookmark update after a signed-in toggle', async () => {
    mocks.storeState.currentUser = { savedArticles: [article.id] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { saved: false, savedArticleIds: [] },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const updateListener = vi.fn();
    window.addEventListener('lokswami:saved-article-updated', updateListener as EventListener);
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;
    const user = userEvent.setup();

    try {
      render(createElement(ArticleDetailClient, { article, relatedArticles }));
      expect(screen.getByRole('button', { name: 'Remove bookmark' })).toHaveTextContent('Saved');

      await user.click(screen.getByRole('button', { name: 'Remove bookmark' }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/user/save',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ articleId: article.id }),
          })
        );
        expect(updateListener).toHaveBeenCalledTimes(1);
      });
      const event = updateListener.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({
        articleId: article.id,
        saved: false,
        savedArticleIds: [],
      });
    } finally {
      window.removeEventListener(
        'lokswami:saved-article-updated',
        updateListener as EventListener
      );
    }
  });

  it('shows four related stories initially and loads four more per action', async () => {
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;
    const user = userEvent.setup();

    render(createElement(ArticleDetailClient, { article, relatedArticles }));

    expect(screen.getAllByRole('link', { name: /Related story/ })).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Load More Stories' }));
    expect(screen.getAllByRole('link', { name: /Related story/ })).toHaveLength(8);
    await user.click(screen.getByRole('button', { name: 'Load More Stories' }));
    expect(screen.getAllByRole('link', { name: /Related story/ })).toHaveLength(10);
  });

  it('announces summary preparation and a safe failure with retry available', async () => {
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(value => { resolve = value; }));
    vi.stubGlobal('fetch', fetchMock);
    const ArticleDetailClient = (await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')).default;
    render(createElement(ArticleDetailClient, { article, relatedArticles }));
    fireEvent.click(screen.getByRole('button', { name: 'Summary' }));
    expect(screen.getByText('Preparing summary…')).toHaveAttribute('role', 'status');
    await act(async () => resolve(Response.json({ success: false, error: 'PRIVATE provider detail' }, { status: 503 })));
    expect(screen.getByText('Summary unavailable. Try again or continue reading.')).toHaveAttribute('role', 'status');
    expect(screen.queryByText(/PRIVATE/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Summary' })).toBeEnabled();
  });

  it('focuses the author dialog, traps Tab and restores focus on Escape', async () => {
    const ArticleDetailClient = (await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')).default;
    const user = userEvent.setup();
    render(createElement(ArticleDetailClient, { article, relatedArticles }));
    const trigger = screen.getByRole('button', { name: 'View profile picture of News Desk' });
    await user.click(trigger);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    await user.tab(); expect(close).toHaveFocus();
    await user.tab({ shift: true }); expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('does not render font size controls or print button in article reader actions', async () => {
    const ArticleDetailClient = (
      await import('@/app/(reader)/main/article/[id]/ArticleDetailClient')
    ).default;

    render(createElement(ArticleDetailClient, { article, relatedArticles }));

    // Verify Print button is removed on all viewports
    const printBtn = screen.queryByRole('button', { name: /Print article|प्रिंट करें|Print/i });
    expect(printBtn).toBeNull();

    // Verify font-size toggle ("ओ" / "अ" / "font") controls are removed
    const fontBtns = screen.queryByRole('button', { name: /Large font|Small font|font/i });
    expect(fontBtns).toBeNull();

    // Verify core reader actions remain present and accessible
    expect(screen.getByRole('button', { name: 'Save article' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share article on WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'E-Paper' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'E-Paper' })).not.toHaveClass('attention-pulsate-bck');
  });
});

