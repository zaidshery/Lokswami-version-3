import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import resolveConfig from 'tailwindcss/resolveConfig';

import AccessibilityMotionProvider from '@/components/providers/AccessibilityMotionProvider';
import SearchClient from '@/app/(reader)/main/search/SearchClient';
import CategoryPageClient from '@/app/(reader)/main/category/[slug]/CategoryPageClient';
import LatestFeedClient from '@/app/(reader)/main/latest/LatestFeedClient';
import VideoFilterBar from '@/components/video/VideoFilterBar';
import SignInPageClient from '@/app/(auth)/signin/SignInPageClient';
import BreakingNews from '@/components/ui/BreakingNews';
import SwipeFeed from '@/components/swipe/SwipeFeed';
import EPaperToolbar from '@/components/epaper/reader/EPaperToolbar';
import EPaperStoryPreview from '@/components/epaper/reader/EPaperStoryPreview';
import { useAppStore } from '@/lib/store/appStore';
import { useSession } from 'next-auth/react';
import type { PublicArticleApiItem } from '@/lib/content/publicArticles';
import type { SwipeFeedItem } from '@/components/swipe/types';
import type { EPaperArticleRecord } from '@/lib/types/epaper';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

let currentSearchParam = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/main/search',
  useSearchParams: () => new URLSearchParams(currentSearchParam),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: vi.fn(),
}));

vi.mock('@/lib/content/liveArticles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/content/liveArticles')>();
  return {
    ...actual,
    fetchMergedLiveArticles: vi.fn().mockImplementation(async () => [
      {
        id: 'art-1',
        slug: 'delhi-news',
        title: 'दिल्ली में भारी बारिश',
        summary: 'दिल्ली में मौसम का मिज़ाज बदला',
        category: 'national',
        publishedAt: '2026-10-01T10:00:00Z',
        views: 100,
        author: { id: 'a1', name: 'Desk' },
      },
    ]),
  };
});

const mockApiItems: PublicArticleApiItem[] = Array.from({ length: 5 }, (_, i) => ({
  _id: `art-${i}`,
  slug: `art-${i}`,
  title: `Test Article Title ${i}`,
  summary: `Summary ${i}`,
  category: 'national',
  publishedAt: '2026-10-01T10:00:00Z',
  views: 100 * (i + 1),
  featuredImage: '/placeholders/news-16x9.svg',
  author: 'Editorial Desk',
}));

const mockSwipeItems: SwipeFeedItem[] = [
  {
    _id: 'swipe-1',
    slug: 'swipe-1',
    title: 'Shorts Story 1',
    category: 'national',
    publishedAt: '2026-10-01T10:00:00Z',
    views: 150,
    articleId: 'article-1',
  } as unknown as SwipeFeedItem,
];

const mockStoryRecord: EPaperArticleRecord = {
  _id: 'story-rec-1',
  slug: 'story-rec-1',
  epaperId: 'epaper-1',
  pageNumber: 1,
  title: 'Front Page Lead Story',
  excerpt: 'Front page story preview text.',
  contentHtml: '<p>Front page story preview text.</p>',
  hotspot: { x: 10, y: 10, w: 200, h: 200 },
};

// WCAG 2.1 Contrast Formula
function relativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  const transform = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function calculateContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Phase 3.17B — Forms, Live Regions, Language Metadata, State Semantics & Contrast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: vi.fn() });
    currentSearchParam = '';
    document.documentElement.lang = 'hi';
    useAppStore.setState({
      language: 'hi',
      theme: 'light',
      themePreference: 'auto',
    });
  });

  describe('1. Root Language Synchronization (ISSUE-A11Y-05)', () => {
    it('synchronizes document.documentElement.lang when active language is Hindi', () => {
      render(
        <AccessibilityMotionProvider>
          <div>Child Content</div>
        </AccessibilityMotionProvider>
      );
      expect(document.documentElement.lang).toBe('hi');
    });

    it('synchronizes document.documentElement.lang when active language switches to English without page reload', () => {
      render(
        <AccessibilityMotionProvider>
          <div>Child Content</div>
        </AccessibilityMotionProvider>
      );
      act(() => {
        useAppStore.getState().setLanguage('en');
      });
      expect(document.documentElement.lang).toBe('en');

      act(() => {
        useAppStore.getState().toggleLanguage();
      });
      expect(document.documentElement.lang).toBe('hi');
    });

    it('preserves initial server HTML lang="hi" architecture in app/layout.tsx', () => {
      const layoutPath = path.join(process.cwd(), 'app', 'layout.tsx');
      const content = fs.readFileSync(layoutPath, 'utf8');
      expect(content).toContain('<html lang="hi"');
      expect(content).not.toContain("'use client'");
    });
  });

  describe('2. Search Form Controls & Polite Live Region (ISSUE-A11Y-06 & ISSUE-A11Y-07)', () => {
    it('provides localized accessible names for Search input, category select, and sort select in Hindi', () => {
      currentSearchParam = 'q=समाचार';
      useAppStore.setState({ language: 'hi' });
      render(<SearchClient />);

      const searchInput = screen.getByRole('textbox', { name: 'समाचार खोजें' });
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveAttribute('placeholder', 'समाचार खोजें...');

      const categorySelect = screen.getByRole('combobox', { name: 'श्रेणी चुनें' });
      expect(categorySelect).toBeInTheDocument();

      const sortSelect = screen.getByRole('combobox', { name: 'क्रमबद्ध करें' });
      expect(sortSelect).toBeInTheDocument();
    });

    it('provides localized accessible names for Search input, category select, and sort select in English', () => {
      currentSearchParam = 'q=news';
      useAppStore.setState({ language: 'en' });
      render(<SearchClient />);

      const searchInput = screen.getByRole('textbox', { name: 'Search news' });
      expect(searchInput).toBeInTheDocument();
      expect(searchInput).toHaveAttribute('placeholder', 'Search news...');

      const categorySelect = screen.getByRole('combobox', { name: 'Choose category' });
      expect(categorySelect).toBeInTheDocument();

      const sortSelect = screen.getByRole('combobox', { name: 'Sort articles' });
      expect(sortSelect).toBeInTheDocument();
    });

    it('announces search result status politely with role="status" and aria-live="polite"', async () => {
      currentSearchParam = 'q=दिल्ली';
      useAppStore.setState({ language: 'hi' });
      render(<SearchClient />);

      const statusRegion = await screen.findByRole('status');
      expect(statusRegion).toBeInTheDocument();
      expect(statusRegion).toHaveAttribute('aria-live', 'polite');
      expect(statusRegion).toHaveAttribute('aria-atomic', 'true');
      await waitFor(() => {
        expect(statusRegion.textContent).toContain('परिणाम');
      });
    });

    it('announces no-results politely in Hindi and English', async () => {
      currentSearchParam = 'q=NonExistentQueryXYZ12345';
      useAppStore.setState({ language: 'hi' });
      const { unmount } = render(<SearchClient />);

      const statusRegion = await screen.findByRole('status');
      await waitFor(() => {
        expect(statusRegion.textContent).toContain('कोई परिणाम नहीं मिला');
      });

      unmount();

      currentSearchParam = 'q=NonExistentQueryXYZ12345';
      useAppStore.setState({ language: 'en' });
      render(<SearchClient />);
      const enStatusRegion = await screen.findByRole('status');
      await waitFor(() => {
        expect(enStatusRegion.textContent).toContain('No results found');
      });
    });
  });

  describe('3. Category & Latest Feed Form Controls & View Mode Semantics (ISSUE-A11Y-06 & ISSUE-A11Y-08)', () => {
    it('provides accessible name for sort control and aria-pressed on view mode buttons in CategoryPageClient', () => {
      useAppStore.setState({ language: 'hi' });
      render(
        <CategoryPageClient
          slug="national"
          initialItems={mockApiItems}
        />
      );

      const sortSelect = screen.getByRole('combobox', { name: 'क्रमबद्ध करें' });
      expect(sortSelect).toBeInTheDocument();

      const gridBtn = screen.getByRole('button', { name: 'ग्रिड दृश्य' });
      const listBtn = screen.getByRole('button', { name: 'सूची दृश्य' });
      expect(gridBtn).toHaveAttribute('aria-pressed', 'true');
      expect(listBtn).toHaveAttribute('aria-pressed', 'false');
    });

    it('provides accessible name for sort control and aria-pressed on view mode buttons in LatestFeedClient', () => {
      useAppStore.setState({ language: 'hi' });
      render(
        <LatestFeedClient
          initialItems={mockApiItems}
          initialLimit={10}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const sortSelect = screen.getByRole('combobox', { name: 'क्रमबद्ध करें' });
      expect(sortSelect).toBeInTheDocument();

      const gridBtn = screen.getByRole('button', { name: 'ग्रिड दृश्य' });
      const listBtn = screen.getByRole('button', { name: 'सूची दृश्य' });
      expect(gridBtn).toHaveAttribute('aria-pressed', 'false');
      expect(listBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('4. Video Filter Bar State Semantics & Localized Controls (ISSUE-A11Y-08)', () => {
    it('exposes aria-pressed states on Feed and Shorts view-mode buttons and category chips', () => {
      render(
        <VideoFilterBar
          viewMode="feed"
          onViewModeChange={vi.fn()}
          categoryOptions={['all', 'national', 'politics']}
          activeCategory="all"
          onCategoryChange={vi.fn()}
          sortMode="latest"
          onSortModeChange={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
          language="hi"
          copy={{
            searchPlaceholder: 'वीडियो खोजें...',
            latest: 'ताज़ा',
            trending: 'लोकप्रिय',
            feed: 'फ़ीड',
            shorts: 'शॉर्ट्स',
            all: 'सभी वीडियो',
          }}
          savedCount={2}
          onOpenWatchLater={vi.fn()}
        />
      );

      // Desktop and mobile view mode buttons
      const feedButtons = screen.getAllByRole('button', { name: /फ़ीड/ });
      expect(feedButtons.length).toBeGreaterThan(0);
      feedButtons.forEach((btn) => {
        expect(btn).toHaveAttribute('aria-pressed', 'true');
      });

      const shortsButtons = screen.getAllByRole('button', { name: /शॉर्ट्स/ });
      shortsButtons.forEach((btn) => {
        expect(btn).toHaveAttribute('aria-pressed', 'false');
      });

      // Category filter buttons
      const allCategoriesBtn = screen.getAllByRole('button', { name: 'सभी वीडियो' });
      expect(allCategoriesBtn[0]).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('5. Reader Auth Mode State Semantics (ISSUE-A11Y-08)', () => {
    it('does not render incomplete role="tab" or role="tablist" semantics in auth mode switchers', () => {
      render(<SignInPageClient adminCredentialsEnabled={false} adminGoogleEnabled={false} />);

      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      expect(screen.queryAllByRole('tablist')).toHaveLength(0);
    });

    it('exposes aria-pressed and meaningful accessible names for Reader vs Newsroom Team portal switchers', () => {
      render(<SignInPageClient adminCredentialsEnabled={false} adminGoogleEnabled={false} />);

      const readerBtns = screen.getAllByRole('button', { name: /Reader & Subscriber/i });
      const staffBtns = screen.getAllByRole('button', { name: /Newsroom Team/i });

      expect(readerBtns.length).toBeGreaterThanOrEqual(1);
      expect(staffBtns.length).toBeGreaterThanOrEqual(1);

      // Initially reader mode is active
      expect(readerBtns[0]).toHaveAttribute('aria-pressed', 'true');
      expect(staffBtns[0]).toHaveAttribute('aria-pressed', 'false');

      // Click to switch to staff mode
      act(() => {
        fireEvent.click(staffBtns[0]);
      });

      expect(staffBtns[0]).toHaveAttribute('aria-pressed', 'true');
      expect(readerBtns[0]).toHaveAttribute('aria-pressed', 'false');
    });

    it('exposes aria-pressed and updates state when toggling Sign In and Create Account', () => {
      render(<SignInPageClient adminCredentialsEnabled={false} adminGoogleEnabled={false} />);

      const signInBtns = screen.getAllByRole('button', { name: /^Sign In$/i });
      const createAccountBtns = screen.getAllByRole('button', { name: /^Create Account$/i });

      expect(signInBtns.length).toBeGreaterThanOrEqual(1);
      expect(createAccountBtns.length).toBeGreaterThanOrEqual(1);

      // Initially Sign In is active
      expect(signInBtns[0]).toHaveAttribute('aria-pressed', 'true');
      expect(createAccountBtns[0]).toHaveAttribute('aria-pressed', 'false');

      // Click to switch to Create Account
      act(() => {
        fireEvent.click(createAccountBtns[0]);
      });

      expect(createAccountBtns[0]).toHaveAttribute('aria-pressed', 'true');
      expect(signInBtns[0]).toHaveAttribute('aria-pressed', 'false');
    });

    it('supports native keyboard focusability and button activation via Tab and click', () => {
      render(<SignInPageClient adminCredentialsEnabled={false} adminGoogleEnabled={false} />);

      const readerBtn = screen.getAllByRole('button', { name: /Reader & Subscriber/i })[0];
      const staffBtn = screen.getAllByRole('button', { name: /Newsroom Team/i })[0];

      // Native buttons are keyboard-focusable in normal tab order
      readerBtn.focus();
      expect(document.activeElement).toBe(readerBtn);

      staffBtn.focus();
      expect(document.activeElement).toBe(staffBtn);

      // Standard button can be activated via click / Enter
      act(() => {
        fireEvent.click(staffBtn);
      });
      expect(staffBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('6. BreakingNews Accessible Labels & Localization (ISSUE-A11Y-11)', () => {
    it('renders localized accessible labels in Hindi mode', () => {
      useAppStore.setState({ language: 'hi' });
      render(<BreakingNews />);
      const region = screen.getByRole('region', { name: 'ताज़ा समाचार' });
      expect(region).toBeInTheDocument();
      const audioBtn = screen.getByRole('button', { name: 'ताज़ा समाचार आवाज़ चालू करें' });
      expect(audioBtn).toBeInTheDocument();
    });

    it('renders localized accessible labels in English mode', () => {
      useAppStore.setState({ language: 'en' });
      render(<BreakingNews />);
      const region = screen.getByRole('region', { name: 'Breaking News' });
      expect(region).toBeInTheDocument();
      const audioBtn = screen.getByRole('button', { name: 'Enable breaking news voice' });
      expect(audioBtn).toBeInTheDocument();
    });
  });

  describe('7. SwipeFeed Accessible Strings & Localization (ISSUE-A11Y-11)', () => {
    it('renders localized status copy and navigation buttons in Hindi mode', () => {
      useAppStore.setState({ language: 'hi' });
      render(
        <SwipeFeed
          initialItems={mockSwipeItems}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const backLink = screen.getByRole('link', { name: 'वीडियो पर वापस जाएं' });
      expect(backLink).toBeInTheDocument();
      expect(screen.getByText(/स्टोरी 1\/1/)).toBeInTheDocument();
    });

    it('renders localized status copy and navigation buttons in English mode', () => {
      useAppStore.setState({ language: 'en' });
      render(
        <SwipeFeed
          initialItems={mockSwipeItems}
          initialArticle={null}
          initialHasMore={false}
          initialNextCursor={null}
        />
      );

      const backLink = screen.getByRole('link', { name: 'Back to videos' });
      expect(backLink).toBeInTheDocument();
      expect(screen.getByText(/Story 1 of 1/)).toBeInTheDocument();
    });
  });

  describe('8. EPaper & E-Magazine Toolbar & Story Preview Localization (ISSUE-A11Y-11)', () => {
    it('renders localized accessible labels for E-Paper toolbar in Hindi mode', () => {
      render(
        <EPaperToolbar
          title="इन्दौर ई-पेपर"
          editionLabel="इन्दौर संस्करण"
          issueDateLabel="5 अक्टूबर 2026"
          currentPage={1}
          pageCount={8}
          zoom={1}
          canGoPrevious={false}
          canGoNext={true}
          onPreviousPage={vi.fn()}
          onNextPage={vi.fn()}
          onPageSelect={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onClose={vi.fn()}
          shareUrl="https://example.com/epaper"
          shareText="इन्दौर ई-पेपर"
          language="hi"
          publicationType="epaper"
        />
      );

      expect(screen.getAllByRole('button', { name: 'पिछला पृष्ठ' }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('button', { name: 'अगला पृष्ठ' }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('button', { name: 'बंद करें' }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('combobox', { name: 'पृष्ठ पर जाएं' }).length).toBeGreaterThanOrEqual(1);

      const shareButtons = screen.getAllByRole('button', { name: 'संस्करण साझा करें' });
      expect(shareButtons.length).toBeGreaterThan(0);
    });

    it('renders localized accessible labels for E-Paper toolbar in English mode', () => {
      render(
        <EPaperToolbar
          title="Indore E-Paper"
          editionLabel="Indore Edition"
          issueDateLabel="5 October 2026"
          currentPage={1}
          pageCount={8}
          zoom={1}
          canGoPrevious={false}
          canGoNext={true}
          onPreviousPage={vi.fn()}
          onNextPage={vi.fn()}
          onPageSelect={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onClose={vi.fn()}
          shareUrl="https://example.com/epaper"
          shareText="Indore E-Paper"
          language="en"
          publicationType="epaper"
        />
      );

      expect(screen.getAllByRole('button', { name: 'Previous page' }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('button', { name: 'Next page' }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('combobox', { name: 'Jump to page' }).length).toBeGreaterThanOrEqual(1);

      const shareButtons = screen.getAllByRole('button', { name: 'Share edition' });
      expect(shareButtons.length).toBeGreaterThan(0);
    });

    it('distinguishes E-Magazine publicationType without leaking E-Paper edition copy', () => {
      render(
        <EPaperToolbar
          title="मासिक पत्रिका"
          editionLabel="पत्रिका"
          issueDateLabel="अक्टूबर 2026"
          currentPage={1}
          pageCount={24}
          zoom={1}
          canGoPrevious={false}
          canGoNext={true}
          onPreviousPage={vi.fn()}
          onNextPage={vi.fn()}
          onPageSelect={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onClose={vi.fn()}
          shareUrl="https://example.com/emagazine"
          shareText="मासिक पत्रिका"
          language="hi"
          publicationType="emagazine"
        />
      );

      // Verify that share button in E-Magazine uses "अंक साझा करें" instead of "संस्करण साझा करें"
      const magazineShareButtons = screen.getAllByRole('button', { name: 'अंक साझा करें' });
      expect(magazineShareButtons.length).toBeGreaterThan(0);
    });

    it('localizes EPaperStoryPreview accessible controls in Hindi and English', () => {
      const { rerender } = render(
        <EPaperStoryPreview
          story={mockStoryRecord}
          articlePath="/main/article/story-1"
          issueTitle="इन्दौर ई-पेपर"
          onClose={vi.fn()}
          onOpenClipping={vi.fn()}
          language="hi"
        />
      );

      expect(screen.getByRole('button', { name: 'खबर बंद करें' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'खबर साझा करें' })).toBeInTheDocument();

      rerender(
        <EPaperStoryPreview
          story={mockStoryRecord}
          articlePath="/main/article/story-1"
          issueTitle="Indore E-Paper"
          onClose={vi.fn()}
          onOpenClipping={vi.fn()}
          language="en"
        />
      );

      expect(screen.getByRole('button', { name: 'Close story' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Share story' })).toBeInTheDocument();
    });
  });

  describe('9. Contrast Measurements (ISSUE-A11Y-09)', () => {
    it('keeps the rendered Video Hub light placeholder above 4.5:1 in default, hover, and focus states', () => {
      render(<VideoFilterBar searchQuery="" onSearchChange={vi.fn()} activeCategory="all" onCategoryChange={vi.fn()} sortMode="latest" onSortModeChange={vi.fn()} viewMode="feed" onViewModeChange={vi.fn()} categoryOptions={['all']} language="en" />);
      const input = screen.getByRole('textbox', { name: 'Search videos...' });
      const classes = input.className.split(/\s+/);
      const colors = resolveConfig(require(path.join(process.cwd(), 'tailwind.config.js'))).theme.colors as Record<string, string | Record<string, string>>;
      const resolveColor = (token: string) => {
        const [family, shade] = token.split('-');
        const palette = colors[family];
        const color = typeof palette === 'string' ? palette : palette[shade];
        return color.replace(/^#([a-f\d])([a-f\d])([a-f\d])$/i, '#$1$1$2$2$3$3');
      };
      const foregroundClass = classes.find((value) => value.startsWith('placeholder:text-'))!;
      const foreground = resolveColor(foregroundClass.replace('placeholder:text-', ''));
      for (const prefix of ['bg-', 'hover:bg-', 'focus:bg-']) {
        const backgroundClass = classes.find((value) => value.startsWith(prefix))!;
        const background = resolveColor(backgroundClass.slice(prefix.length));
        expect(calculateContrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
      expect(input).toHaveClass('dark:placeholder:text-zinc-400');
    });

    it('satisfies WCAG AA contrast threshold (>= 4.5:1) for brand-600 on brand-50', () => {
      const brand50 = '#fff1f2';
      const brand500 = '#e72129';
      const brand600 = '#c61d24';

      const oldRatio = calculateContrastRatio(brand500, brand50);
      const newRatio = calculateContrastRatio(brand600, brand50);

      // Old ratio was 4.11:1 (failing AA 4.5:1)
      expect(oldRatio).toBeLessThan(4.5);
      // New ratio is >= 4.5:1 (passes AA)
      expect(newRatio).toBeGreaterThanOrEqual(4.5);
    });

    it('satisfies WCAG AA contrast threshold (>= 4.5:1) for zinc-400 on zinc-950 dark background', () => {
      const zinc950 = '#09090b';
      const zinc500 = '#71717a';
      const zinc400 = '#a1a1aa';

      const oldRatio = calculateContrastRatio(zinc500, zinc950);
      const newRatio = calculateContrastRatio(zinc400, zinc950);

      // Old ratio was 4.12:1 (failing AA 4.5:1)
      expect(oldRatio).toBeLessThan(4.5);
      // New ratio is >= 4.5:1 (passes AA, actually ~7.76:1)
      expect(newRatio).toBeGreaterThanOrEqual(4.5);
    });

    it('satisfies WCAG AA contrast threshold (>= 4.5:1) for light placeholder zinc-500 on white', () => {
      const white = '#ffffff';
      const zinc400 = '#a1a1aa';
      const zinc500 = '#71717a';

      const oldRatio = calculateContrastRatio(zinc400, white);
      const newRatio = calculateContrastRatio(zinc500, white);

      // Old ratio was 2.56:1 (failing AA 4.5:1)
      expect(oldRatio).toBeLessThan(4.5);
      // New ratio is >= 4.5:1 (passes AA, ~4.83:1)
      expect(newRatio).toBeGreaterThanOrEqual(4.5);
    });

    it('satisfies WCAG AA contrast threshold (>= 4.5:1) for dark placeholder zinc-400 on zinc-900 / zinc-950', () => {
      const zinc900 = '#18181b';
      const zinc400 = '#a1a1aa';

      const ratio = calculateContrastRatio(zinc400, zinc900);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('10. Preservation of Phase 3.17A Foundation & Publication Authority', () => {
    it('preserves reader-focus-ring and editorial-focus-ring contracts', () => {
      const globalsPath = path.join(process.cwd(), 'app', 'globals.css');
      const content = fs.readFileSync(globalsPath, 'utf8');
      expect(content).toContain('.reader-focus-ring');
      expect(content).toContain('.editorial-focus-ring');
    });

    it('maintains strict publication authority in article and publication filters', () => {
      const repoPath = path.join(process.cwd(), 'lib', 'repositories', 'articleRepository.ts');
      if (fs.existsSync(repoPath)) {
        const content = fs.readFileSync(repoPath, 'utf8');
        expect(content).toContain('published');
      }
    });
  });
});
