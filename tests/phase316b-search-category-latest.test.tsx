import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let currentLanguage: 'hi' | 'en' = 'hi';
let currentQuery = '';

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: () => ({ language: currentLanguage }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'q' ? currentQuery : null),
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

const mockArticlesList = [
  {
    id: 'art-1',
    slug: 'lok-sabha-special',
    title: 'लोकसभा चुनाव की विशेष तैयारी शुरू',
    summary: 'चुनाव आयोग ने व्यापक समीक्षा की',
    content: 'विस्तृत रिपोर्ट...',
    image: '/test1.jpg',
    category: 'Politics',
    author: { id: 'author-1', name: 'विशेष संवाददाता', avatar: '/avatar.jpg' },
    publishedAt: '2026-05-10T12:00:00.000Z',
    views: 1250,
    isBreaking: false,
    isTrending: true,
  },
  {
    id: 'art-2',
    slug: 'indore-metro-progress',
    title: 'Indore Metro Work Reaches Final Phase',
    summary: 'Trial runs to begin next month across Super Corridor',
    content: 'Metro authorities announced completion...',
    image: '/test2.jpg',
    category: 'Madhya Pradesh',
    author: { id: 'author-2', name: 'City Reporter', avatar: '/avatar.jpg' },
    publishedAt: '2026-05-09T10:00:00.000Z',
    views: 3400,
    isBreaking: true,
    isTrending: false,
  },
];

vi.mock('@/lib/content/liveArticles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/content/liveArticles')>(
    '@/lib/content/liveArticles'
  );
  return {
    ...actual,
    fetchMergedLiveArticles: vi.fn().mockResolvedValue(mockArticlesList),
  };
});

vi.mock('@/components/ui/HeroCard', () => ({
  default: ({ article }: { article: { title: string } }) =>
    createElement('div', { 'data-testid': 'hero-card' }, article.title),
}));

vi.mock('@/components/ui/NewsCard', () => ({
  default: ({ article }: { article: { title: string; category?: string } }) =>
    createElement('article', { 'data-testid': 'news-card', className: 'break-words' }, [
      createElement('h2', { key: 'title', className: 'break-words font-bold' }, article.title),
      createElement('span', { key: 'cat' }, article.category),
    ]),
}));

describe('Phase 3.16B — Search, Latest & Category Feeds Polish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentLanguage = 'hi';
    currentQuery = '';
  });

  it('1 & 2. SearchClient renders semantic light/dark tokens without hardcoded dark classes', async () => {
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    const { container } = render(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    // Page title
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.className).toContain('text-zinc-900');
    expect(heading.className).toContain('dark:text-zinc-100');
    expect(heading.className).not.toContain('text-lokswami-white');

    // Search input container
    const form = container.querySelector('form');
    expect(form).toBeInTheDocument();
    const inputWrapper = form?.querySelector('div');
    expect(inputWrapper?.className).toContain('border-zinc-200');
    expect(inputWrapper?.className).toContain('bg-white');
    expect(inputWrapper?.className).toContain('dark:border-zinc-800');
    expect(inputWrapper?.className).toContain('dark:bg-zinc-900');
    expect(inputWrapper?.className).not.toContain('bg-lokswami-surface');
    expect(inputWrapper?.className).not.toContain('border-lokswami-border');

    // Search input field
    const input = screen.getByPlaceholderText('समाचार खोजें...');
    expect(input.className).toContain('text-zinc-900');
    expect(input.className).toContain('dark:text-zinc-100');
    expect(input.className).not.toContain('text-lokswami-white');

    // Entire container check: no hardcoded dark lokswami- classes anywhere in DOM
    const html = container.innerHTML;
    expect(html).not.toContain('text-lokswami-white');
    expect(html).not.toContain('bg-lokswami-surface');
    expect(html).not.toContain('border-lokswami-border');
    expect(html).not.toContain('text-lokswami-text-secondary');
    expect(html).not.toContain('text-lokswami-text-muted');
  });

  it('3. SearchClient renders authentic Devanagari Hindi static UI copy', async () => {
    currentLanguage = 'hi';
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    render(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /खोज/ })).toBeInTheDocument();
    });

    // Input placeholder
    expect(screen.getByPlaceholderText('समाचार खोजें...')).toBeInTheDocument();

    // Submit button
    expect(screen.getByRole('button', { name: 'खोजें' })).toBeInTheDocument();

    // Trending & recent sections
    expect(screen.getByRole('heading', { level: 2, name: /ट्रेंडिंग खोजें/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /हाल की खोजें/ })).toBeInTheDocument();

    // Devanagari trending pills
    expect(screen.getAllByRole('button', { name: /आईपीएल 2026/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /लोकसभा/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /मौसम अपडेट/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /सोने का भाव/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('4. SearchClient renders clean English copy in English mode', async () => {
    currentLanguage = 'en';
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    render(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Search/ })).toBeInTheDocument();
    });

    // Input placeholder
    expect(screen.getByPlaceholderText('Search news...')).toBeInTheDocument();

    // Submit button
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();

    // Trending & recent sections
    expect(screen.getByRole('heading', { level: 2, name: /Trending Searches/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Recent Searches/ })).toBeInTheDocument();

    // English trending pills
    expect(screen.getAllByRole('button', { name: /IPL 2026/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /Weather Update/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('5. No Romanized legacy Hinglish strings remain in Hindi mode', async () => {
    currentLanguage = 'hi';
    currentQuery = 'test';
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    const { container } = render(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /खोज/ })).toBeInTheDocument();
    });

    const html = container.innerHTML;
    expect(html).not.toMatch(/\bKhoj\b/);
    expect(html).not.toMatch(/Khabar khoje/);
    expect(html).not.toMatch(/Khoje/);
    expect(html).not.toMatch(/Sabhi Categories/);
    expect(html).not.toMatch(/Prasangikta/);
    expect(html).not.toMatch(/Taaza/);
    expect(html).not.toMatch(/Lokpriya/);
    expect(html).not.toMatch(/Koi result nahi mila/);
    expect(html).not.toMatch(/parinaam/);
  });

  it('6. Clear button appears when query is typed and clears the input on click', async () => {
    currentLanguage = 'hi';
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    render(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /खोज/ })).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('समाचार खोजें...');
    expect(screen.queryByLabelText('खोज साफ़ करें')).not.toBeInTheDocument();

    await userEvent.type(input, 'इंदौर');
    const clearBtn = screen.getByLabelText('खोज साफ़ करें');
    expect(clearBtn).toBeInTheDocument();

    await userEvent.click(clearBtn);
    expect(input).toHaveValue('');
    expect(screen.queryByLabelText('खोज साफ़ करें')).not.toBeInTheDocument();
  });

  it('7 & 8. Category and sort selectors work and use proper Devanagari labels in Hindi', async () => {
    currentLanguage = 'hi';
    currentQuery = 'इंदौर';
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    render(createElement(SearchClient));

    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBe(2);

    const categorySelect = selects[0];
    const sortSelect = selects[1];

    // Check category dropdown labels
    expect(categorySelect).toHaveTextContent('सभी श्रेणियां');
    expect(categorySelect.className).toContain('text-zinc-900');
    expect(categorySelect.className).toContain('dark:text-zinc-100');

    // Check sort dropdown labels
    expect(sortSelect).toHaveTextContent('प्रासंगिकता');
    expect(sortSelect).toHaveTextContent('ताज़ा');
    expect(sortSelect).toHaveTextContent('लोकप्रिय');
    expect(sortSelect.className).toContain('text-zinc-900');
    expect(sortSelect.className).toContain('dark:text-zinc-100');

    // Select different sort
    await userEvent.selectOptions(sortSelect, 'latest');
    expect(sortSelect).toHaveValue('latest');
  });

  it('9. Search empty state renders properly with semantic tokens in Hindi and English', async () => {
    currentLanguage = 'hi';
    currentQuery = 'nonexistentquery12345';
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    const { rerender } = render(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByText('कोई परिणाम नहीं मिला')).toBeInTheDocument();
      expect(screen.getByText('कृपया अलग कीवर्ड के साथ पुनः प्रयास करें।')).toBeInTheDocument();
    });

    const emptyBox = screen.getByText('कोई परिणाम नहीं मिला').closest('.rounded-xl');
    expect(emptyBox?.className).toContain('border-zinc-200');
    expect(emptyBox?.className).toContain('bg-zinc-50');
    expect(emptyBox?.className).toContain('dark:border-zinc-800');
    expect(emptyBox?.className).toContain('dark:bg-zinc-900/60');

    // Switch to English
    currentLanguage = 'en';
    rerender(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText('Please try searching with different keywords.')).toBeInTheDocument();
    });
  });

  it('10. Search result rendering displays matching results and result count', async () => {
    currentLanguage = 'hi';
    currentQuery = 'लोकसभा';
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    render(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByText(/"लोकसभा" के लिए 1 परिणाम/)).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId('news-card');
    expect(cards.length).toBe(1);
    expect(cards[0]).toHaveTextContent('लोकसभा चुनाव की विशेष तैयारी शुरू');
  });

  it('11. LatestFeedClient renders semantic light/dark tokens without hardcoded dark classes', async () => {
    currentLanguage = 'hi';
    const LatestFeedClient = (await import('@/app/(reader)/main/latest/LatestFeedClient')).default;
    const { container } = render(
      createElement(LatestFeedClient, {
        initialItems: [
          {
            id: 'art-1',
            slug: 'lead-story',
            title: 'ताज़ा हेडलाइन',
            summary: 'ताज़ा सारांश',
            image: '/lead.jpg',
            category: 'Politics',
            author: 'डेस्क',
            publishedAt: '2026-05-10T10:00:00.000Z',
          },
        ],
        initialLimit: 10,
        initialHasMore: true,
        initialNextCursor: null,
      })
    );

    // Title
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.className).toContain('text-zinc-900');
    expect(title.className).toContain('dark:text-zinc-100');

    // Sort select
    const select = screen.getByRole('combobox');
    expect(select.className).toContain('border-zinc-200');
    expect(select.className).toContain('bg-white');
    expect(select.className).toContain('text-zinc-900');
    expect(select.className).toContain('dark:border-zinc-800');
    expect(select.className).toContain('dark:bg-zinc-900');
    expect(select.className).toContain('dark:text-zinc-100');

    // View mode switcher
    const gridBtn = screen.getByLabelText('Grid view');
    const listBtn = screen.getByLabelText('List view');
    expect(gridBtn).toBeInTheDocument();
    expect(listBtn).toBeInTheDocument();

    // Load more button
    const loadMoreBtn = screen.getByRole('button', { name: /और खबरें लोड करें/ });
    expect(loadMoreBtn.className).toContain('border-zinc-200');
    expect(loadMoreBtn.className).toContain('bg-white');
    expect(loadMoreBtn.className).toContain('text-zinc-700');
    expect(loadMoreBtn.className).toContain('dark:border-zinc-800');
    expect(loadMoreBtn.className).toContain('dark:bg-zinc-900');
    expect(loadMoreBtn.className).toContain('dark:text-zinc-300');

    // Ensure zero hardcoded dark lokswami- classes
    const html = container.innerHTML;
    expect(html).not.toContain('text-lokswami-white');
    expect(html).not.toContain('bg-lokswami-surface');
    expect(html).not.toContain('border-lokswami-border');
  });

  it('12. CategoryPageClient renders semantic light/dark tokens without hardcoded dark classes', async () => {
    currentLanguage = 'hi';
    const CategoryPageClient = (
      await import('@/app/(reader)/main/category/[slug]/CategoryPageClient')
    ).default;

    const { container } = render(
      createElement(CategoryPageClient, {
        slug: 'madhya-pradesh',
        initialItems: [
          {
            id: 'art-mp-1',
            slug: 'mp-lead',
            title: 'मध्य प्रदेश विशेष कवरेज',
            summary: 'एमपी की ताजा खबरें',
            image: '/mp.jpg',
            category: 'Madhya Pradesh',
            author: 'विशेष संवाददाता',
            publishedAt: '2026-05-10T10:00:00.000Z',
          },
        ],
      })
    );

    // Title
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.className).toContain('text-zinc-900');
    expect(title.className).toContain('dark:text-zinc-100');

    // Sort select
    const select = screen.getByRole('combobox');
    expect(select.className).toContain('border-zinc-200');
    expect(select.className).toContain('bg-white');
    expect(select.className).toContain('text-zinc-900');
    expect(select.className).toContain('dark:border-zinc-800');
    expect(select.className).toContain('dark:bg-zinc-900');
    expect(select.className).toContain('dark:text-zinc-100');

    // Zero hardcoded dark lokswami- classes
    const html = container.innerHTML;
    expect(html).not.toContain('text-lokswami-white');
    expect(html).not.toContain('bg-lokswami-surface');
    expect(html).not.toContain('border-lokswami-border');
  });

  it('13, 14 & 15. Touch targets and responsive bounds comply with mobile contracts without altering content authority', async () => {
    currentLanguage = 'hi';
    const SearchClient = (await import('@/app/(reader)/main/search/SearchClient')).default;
    const { container } = render(createElement(SearchClient));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /खोज/ })).toBeInTheDocument();
    });

    // Verify touch targets have min-h-11 or min-h-12 (>= 44px)
    const touchButtons = container.querySelectorAll('.reader-touch-button');
    expect(touchButtons.length).toBeGreaterThan(0);
    touchButtons.forEach((btn) => {
      const cls = btn.className;
      const hasTouchMin =
        cls.includes('min-h-11') ||
        cls.includes('min-h-12') ||
        cls.includes('h-11') ||
        cls.includes('h-12') ||
        cls.includes('h-16');
      expect(hasTouchMin).toBe(true);
    });

    // Verify search input has at least min-h-12
    const input = screen.getByPlaceholderText('समाचार खोजें...');
    expect(input.className).toContain('min-h-12');

    // Verify flex rows wrap on small screens
    const trendingRow = container.querySelector('.flex.flex-wrap.gap-2');
    expect(trendingRow).toBeInTheDocument();
  });
});
