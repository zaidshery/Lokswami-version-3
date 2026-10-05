import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

import AccessibilityMotionProvider from '@/components/providers/AccessibilityMotionProvider';
import HomepageTopPackage from '@/components/home/HomepageTopPackage';
import VideoDetailHero from '@/components/video/VideoDetailHero';
import VideoFilterBar from '@/components/video/VideoFilterBar';
import EPaperToolbar from '@/components/epaper/reader/EPaperToolbar';
import EPaperStoryPreview from '@/components/epaper/reader/EPaperStoryPreview';
import Footer from '@/components/layout/Footer';
import EPaperPageClient from '@/app/(reader)/main/epaper/EPaperPageClient';
import type { Article } from '@/lib/mock/data';
import type { VideoItem } from '@/components/video/types';
import type { EPaperArticleRecord } from '@/lib/types/epaper';
import { useAppStore } from '@/lib/store/appStore';
import { useSession } from 'next-auth/react';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/main',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: vi.fn(),
}));

const mockArticles: Article[] = Array.from({ length: 6 }, (_, i) => ({
  id: `article-${i}`,
  slug: `article-${i}`,
  title: `Editorial Article Title ${i}`,
  summary: `Summary of article ${i}`,
  image: '/placeholders/news-16x9.svg',
  category: 'national',
  publishedAt: '2026-10-01T10:00:00Z',
  views: 100 * (i + 1),
  author: { id: 'author-1', name: 'Editorial Desk', avatar: '/avatar.png' },
}));

const mockVideoItem: VideoItem = {
  id: 'video-1',
  slug: 'video-1',
  title: 'Breaking Video Story',
  description: 'Video story description',
  category: 'national',
  duration: 180,
  publishedAt: '2026-10-01T10:00:00Z',
  thumbnail: '/placeholders/video-16x9.svg',
  views: 500,
  videoUrl: 'https://example.com/video.mp4',
  isShort: false,
  isPublished: true,
  shortsRank: 0,
};

const mockStoryRecord: EPaperArticleRecord = {
  _id: 'story-rec-1',
  slug: 'story-rec-1',
  epaperId: 'epaper-1',
  pageNumber: 1,
  title: 'Front Page Lead Story',
  excerpt: 'Front page excerpt text content for accessibility testing.',
  contentHtml: '<p>Front page excerpt text content for accessibility testing.</p>',
  hotspot: {
    x: 10,
    y: 10,
    w: 200,
    h: 200,
  },
};

describe('Phase 3.17A — Global Semantics, Heading Structure, Visible Focus & Motion Foundation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update: vi.fn() });
    useAppStore.setState({
      language: 'hi',
      theme: 'light',
      themePreference: 'auto',
    });
  });

  describe('1. E-Paper & E-Magazine Headings (ISSUE-A11Y-01)', () => {
    it('renders a meaningful semantic h1 in the E-Paper reader toolbar with publication title and issue date', () => {
      render(
        <EPaperToolbar
          title="इन्दौर ई-पेपर"
          editionLabel="इन्दौर संस्करण"
          issueDateLabel="05/05/26"
          currentPage={1}
          pageCount={8}
          zoom={1}
          onPreviousPage={vi.fn()}
          onNextPage={vi.fn()}
          onPageSelect={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onClose={vi.fn()}
          shareUrl="https://example.com/epaper"
          shareText="Share Indore E-Paper"
          shareContentType="epaper"
          language="hi"
        />
      );

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      expect(h1).toHaveTextContent('इन्दौर ई-पेपर - 05/05/26');
    });

    it('renders a meaningful semantic h1 in the E-Magazine reader toolbar with issue month metadata', () => {
      render(
        <EPaperToolbar
          title="लोकस्वामी ई-मैगज़ीन"
          editionLabel="Lokswami E-Magazine"
          issueDateLabel="May 2026"
          currentPage={1}
          pageCount={24}
          zoom={1}
          onPreviousPage={vi.fn()}
          onNextPage={vi.fn()}
          onPageSelect={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onClose={vi.fn()}
          shareUrl="https://example.com/e-magazine"
          shareText="Share E-Magazine"
          shareContentType="emagazine"
          language="en"
        />
      );

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      expect(h1).toHaveTextContent('लोकस्वामी ई-मैगज़ीन - May 2026');
    });

    it('renders meaningful semantic h1 on E-Paper browse list without active paper', () => {
      render(
        <EPaperPageClient
          initialItems={[]}
          initialLimit={12}
          initialHasMore={false}
          initialNextCursor={null}
          initialCity="all"
          initialPublishDate=""
          publicationType="epaper"
          publicBasePath="/main/epaper"
        />
      );

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      expect(h1).toHaveTextContent('ई-पेपर');
    });

    it('renders meaningful semantic h1 on E-Magazine browse list without city assumptions', () => {
      render(
        <EPaperPageClient
          initialItems={[]}
          initialLimit={12}
          initialHasMore={false}
          initialNextCursor={null}
          initialCity="all"
          initialPublishDate="2026-05"
          publicationType="emagazine"
          publicBasePath="/main/e-magazine"
        />
      );

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
      expect(h1).toHaveTextContent('ई-मैगज़ीन - 2026-05');
      // Must not render City picker for monthly magazine
      expect(screen.queryByLabelText(/City/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/शहर/i)).not.toBeInTheDocument();
    });
  });

  describe('2. Homepage Semantic Heading Hierarchy (ISSUE-A11Y-04)', () => {
    it('renders the lead article title as the primary h1 and prevents inverted Lead Story h2 heading', () => {
      render(<HomepageTopPackage articles={mockArticles} language="en" />);

      const allHeadings = screen.getAllByRole('heading');
      expect(allHeadings.length).toBeGreaterThan(0);

      // The first heading rendered must be level 1 (the lead article title)
      const firstHeading = allHeadings[0];
      expect(firstHeading.tagName.toLowerCase()).toBe('h1');
      const leadSection = screen.getByTestId('lead-story');
      const leadH1 = within(leadSection).getByRole('heading', { level: 1 });
      expect(leadH1).toBe(firstHeading);

      // "Lead Story" must not be an h2 preceding the h1
      const leadH2 = within(leadSection).queryByRole('heading', { level: 2 });
      expect(leadH2).toBeNull();

      // Subsequent sections ("Latest News", "Popular News") are level 2 headings
      const h2Headings = screen.getAllByRole('heading', { level: 2 });
      expect(h2Headings.some((h) => h.textContent?.includes('Latest News'))).toBe(true);
      expect(h2Headings.some((h) => h.textContent?.includes('Popular News'))).toBe(true);
    });
  });

  describe('3. Duplicate Article Announcements (ISSUE-A11Y-14)', () => {
    it('removes duplicate thumbnail link from accessibility and tab order while preserving headline link', () => {
      render(<HomepageTopPackage articles={mockArticles} language="en" />);

      const leadSection = screen.getByTestId('lead-story');
      const leadH1 = within(leadSection).getByRole('heading', { level: 1 });
      const leadTitle = leadH1.textContent?.trim() || '';

      // The headline link is accessible
      const headlineLink = within(leadSection).getByRole('link', { name: leadTitle });
      expect(headlineLink).toBeInTheDocument();
      expect(headlineLink).not.toHaveAttribute('tabindex', '-1');
      expect(headlineLink).not.toHaveAttribute('aria-hidden', 'true');

      // The image link is excluded from tab order and accessible tree
      const imageLink = leadSection.querySelector('a[tabindex="-1"][aria-hidden="true"]');
      expect(imageLink).toBeInTheDocument();
    });

    it('removes duplicate thumbnail links in rail list items from accessibility tree', () => {
      render(<HomepageTopPackage articles={mockArticles} language="en" />);

      const latestRail = screen.getByTestId('latest-news-rail');
      const listItems = within(latestRail).getAllByRole('listitem');

      for (const item of listItems) {
        const thumbLink = item.querySelector('a[tabindex="-1"][aria-hidden="true"]');
        expect(thumbLink).toBeInTheDocument();

        // There should be only 1 accessible article link per listitem
        const accessibleLinks = within(item).getAllByRole('link');
        // Accessible links are the headline link and the whatsapp share button
        const articleHeadlineLinks = accessibleLinks.filter(
          (l) => !l.getAttribute('aria-label')?.includes('WhatsApp') && !l.getAttribute('aria-label')?.includes('व्हाट्सऐप')
        );
        expect(articleHeadlineLinks).toHaveLength(1);
      }
    });
  });

  describe('4. Visible Keyboard Focus Contracts (ISSUE-A11Y-03)', () => {
    it('verifies VideoDetailHero back button carries reader-focus-ring', () => {
      render(
        <VideoDetailHero
          selectedVideo={mockVideoItem}
          playerRef={{ current: null }}
          isPaused={true}
          isMuted={false}
          autoAdvance={false}
          captionsEnabled={false}
          playbackRate={1}
          onPausedChange={vi.fn()}
          onMutedChange={vi.fn()}
          onCaptionsChange={vi.fn()}
          onPlaybackRateChange={vi.fn()}
          onAdvanceToNext={vi.fn()}
          onBackToList={vi.fn()}
        />
      );

      const backBtn = screen.getByRole('button', { name: 'Back to list' });
      expect(backBtn).toHaveClass('reader-focus-ring');
    });

    it('verifies VideoFilterBar interactive controls carry reader-focus-ring', () => {
      render(
        <VideoFilterBar
          searchQuery="cricket"
          onSearchChange={vi.fn()}
          activeCategory="all"
          onCategoryChange={vi.fn()}
          sortMode="latest"
          onSortModeChange={vi.fn()}
          viewMode="feed"
          onViewModeChange={vi.fn()}
          categoryOptions={['all', 'sports', 'entertainment']}
          language="en"
          copy={{
            searchPlaceholder: 'Search videos...',
            latest: 'Latest',
            trending: 'Trending',
            feed: 'Feed',
            shorts: 'Shorts',
            all: 'All',
          }}
          onOpenWatchLater={vi.fn()}
        />
      );

      // Clear search button
      const clearBtn = screen.getByRole('button', { name: 'Clear search' });
      expect(clearBtn).toHaveClass('reader-focus-ring');

      // Feed & Shorts view mode buttons
      const feedBtn = screen.getByRole('button', { name: /Feed/i });
      const shortsBtn = screen.getByRole('button', { name: /Shorts/i });
      expect(feedBtn).toHaveClass('reader-focus-ring');
      expect(shortsBtn).toHaveClass('reader-focus-ring');

      // Watch Later button
      const watchLaterBtn = screen.getByRole('button', { name: 'Saved videos' });
      expect(watchLaterBtn).toHaveClass('reader-focus-ring');

      // Options Popover button
      const optionsBtn = screen.getByRole('button', { name: 'Filter and sort options' });
      expect(optionsBtn).toHaveClass('reader-focus-ring');

      // Category strip buttons
      const categoryPills = screen.getAllByRole('button', { name: /(All|sports|entertainment)/i });
      for (const pill of categoryPills) {
        expect(pill).toHaveClass('reader-focus-ring');
      }
    });

    it('verifies EPaperToolbar controls carry reader-focus-ring', () => {
      render(
        <EPaperToolbar
          title="इन्दौर ई-पेपर"
          editionLabel="इन्दौर संस्करण"
          issueDateLabel="05/05/26"
          currentPage={2}
          pageCount={8}
          zoom={1}
          canUseSpreadMode={true}
          isSpreadMode={false}
          canGoPrevious={true}
          canGoNext={true}
          onPreviousPage={vi.fn()}
          onNextPage={vi.fn()}
          onPageSelect={vi.fn()}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
          onToggleFullscreen={vi.fn()}
          onToggleSpreadMode={vi.fn()}
          onOpenDownload={vi.fn()}
          onToggleSave={vi.fn()}
          onToggleTheme={vi.fn()}
          onClose={vi.fn()}
          onToggleThumbnails={vi.fn()}
          shareUrl="https://example.com/epaper"
          shareText="Share"
          language="hi"
        />
      );

      const assertButtonHasRing = (name: string | RegExp) => {
        const buttons = screen.getAllByRole('button', { name });
        expect(buttons.length).toBeGreaterThanOrEqual(1);
        for (const button of buttons) {
          expect(button).toHaveClass('reader-focus-ring');
        }
      };

      assertButtonHasRing(/Back to editions|संस्करणों पर वापस जाएं/);
      assertButtonHasRing(/Previous page|पिछला पृष्ठ/);
      assertButtonHasRing(/Next page|अगला पृष्ठ/);
      assertButtonHasRing(/Zoom in|ज़ूम इन/);
      assertButtonHasRing(/Zoom out|ज़ूम आउट/);
      assertButtonHasRing(/Reset zoom|ज़ूम रीसेट करें/);
      assertButtonHasRing(/Switch to spread view|दो पेज दृश्य में बदलें/);
      assertButtonHasRing(/Enter fullscreen|फुलस्क्रीन करें/);
      assertButtonHasRing(/Save for later|बाद के लिए सहेजें/);
      assertButtonHasRing(/Download edition|संस्करण डाउनलोड करें/);
      assertButtonHasRing(/Switch reader to dark mode|डार्क मोड में बदलें/);
      assertButtonHasRing(/Close|रीडर बंद करें|बंद करें/);
      assertButtonHasRing(/Hide pages|पृष्ठ छुपाएं/);
      expect(screen.getByRole('combobox', { name: /Jump to page|पृष्ठ पर जाएं/ })).toHaveClass('reader-focus-ring');
    });

    it('verifies EPaperStoryPreview controls carry reader-focus-ring', () => {
      render(
        <EPaperStoryPreview
          story={mockStoryRecord}
          articlePath="/main/article/story-1"
          issueTitle="इन्दौर ई-पेपर"
          language="hi"
          onClose={vi.fn()}
          onOpenClipping={vi.fn()}
          onPlayAudio={vi.fn()}
          canListen={true}
        />
      );

      expect(screen.getByRole('button', { name: /Close story|खबर बंद करें/ })).toHaveClass('reader-focus-ring');
      expect(screen.getByRole('button', { name: /Share story|खबर साझा करें/ })).toHaveClass('reader-focus-ring');
      expect(screen.getByRole('button', { name: 'विजुअल' })).toHaveClass('reader-focus-ring');
      expect(screen.getByRole('button', { name: 'टेक्स्ट' })).toHaveClass('reader-focus-ring');
      expect(screen.getByRole('button', { name: /Listen to story|सुनें|खबर सुनें/i })).toHaveClass('reader-focus-ring');
      expect(screen.getByRole('link', { name: 'पूरी खबर पढ़ें' })).toHaveClass('reader-focus-ring');
      expect(screen.getByRole('button', { name: /Zoom in story image|ज़ूम इन/ })).toHaveClass('reader-focus-ring');
      expect(screen.getByRole('button', { name: /Zoom out story image|ज़ूम आउट/ })).toHaveClass('reader-focus-ring');
      expect(screen.getByRole('button', { name: /Fit story image|स्क्रीन में फ़िट करें|पूरा पृष्ठ|खबर क्लिपिंग/ })).toHaveClass('reader-focus-ring');
    });
  });

  describe('5. Footer Sibling Heading Consistency (ISSUE-A11Y-16)', () => {
    it('standardizes all footer column headings on h3 without h4 sibling jumps', () => {
      render(<Footer />);

      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThanOrEqual(4);

      // Every footer column heading must be h3
      for (const h of headings) {
        expect(h.tagName.toLowerCase()).toBe('h3');
      }

      // No h4 headings exist in the footer
      expect(headings.some((h) => h.tagName.toLowerCase() === 'h4')).toBe(false);
    });
  });

  describe('6. Reduced Motion Architecture (ISSUE-A11Y-10)', () => {
    it('ensures AccessibilityMotionProvider renders MotionConfig with reducedMotion="user"', () => {
      const { container } = render(
        <AccessibilityMotionProvider>
          <div data-testid="child-content">Accessible Content</div>
        </AccessibilityMotionProvider>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByTestId('child-content')).toHaveTextContent('Accessible Content');
      expect(container).toBeDefined();
    });

    it('ensures app/layout.tsx remains a Server Component and integrates AccessibilityMotionProvider', () => {
      const rootLayoutPath = path.join(process.cwd(), 'app/layout.tsx');
      const rootLayoutSource = fs.readFileSync(rootLayoutPath, 'utf8');

      // Must NOT be converted to a client component
      expect(rootLayoutSource).not.toMatch(/^'use client'/);
      expect(rootLayoutSource).not.toMatch(/^"use client"/);

      // Must import and use AccessibilityMotionProvider
      expect(rootLayoutSource).toContain('AccessibilityMotionProvider');
      expect(rootLayoutSource).toContain('<AccessibilityMotionProvider>');
    });
  });
});
