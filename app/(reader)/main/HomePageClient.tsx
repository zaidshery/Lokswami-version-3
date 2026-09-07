'use client';

import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  Flame,
} from 'lucide-react';
import HeroCarousel from '@/components/ui/HeroCarousel';
import NewsCard from '@/components/ui/NewsCard';
import ReaderImage from '@/components/ui/ReaderImage';
import DesktopHeroEpaperCard from '@/components/ui/DesktopHeroEpaperCard';
import HomeShortsSection from '@/components/video/HomeShortsSection';
import type { Article } from '@/lib/mock/data';
import { categoryMatches } from '@/lib/content/liveArticles';
import {
  fetchHomeFeedForHomePage,
  type HomePageEpaperPreview,
  type HomePageFeedState,
} from '@/lib/content/homeFeed';
import {
  fetchPublicArticlesPage,
  mapPublicArticlesToUiArticles,
} from '@/lib/content/publicArticles';
import {
  getNewsCategoryHref,
  NEWS_CATEGORY_DEFINITIONS,
  type NewsCategory,
  resolveNewsCategory,
} from '@/lib/constants/newsCategories';
import { useAppStore } from '@/lib/store/appStore';
import {
  buildArticleImageVariantUrl,
} from '@/lib/utils/articleMedia';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { formatUiDate } from '@/lib/utils/dateFormat';
import { normalizePublicationIssueMonth } from '@/lib/utils/epaperPublication';

function hexToRgba(hex?: string | null, alpha = 1) {
  const cleaned = String(hex || '').replace('#', '').trim();
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((token) => token + token).join('')
    : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(249, 115, 22, ${alpha})`;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDesktopHeroDate(value: string | undefined, language: 'en' | 'hi') {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return formatUiDate(value, value);
  }

  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function formatMagazineIssueLabel(value: string | undefined, language: 'en' | 'hi') {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return formatUiDate(value, value);
  }

  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function getPublishedTimestamp(article: Article | null | undefined) {
  if (!article || !article.publishedAt) return 0;
  const parsed = new Date(article.publishedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildHomepageRail(
  articles: Article[] | undefined | null,
  isPriority: (article: Article) => boolean,
  limit: number,
  fallbackCompare?: (a: Article, b: Article) => number
) {
  const safeList = Array.isArray(articles)
    ? articles.filter((a): a is Article => Boolean(a && typeof a === 'object' && a.id))
    : [];
  const priority: Article[] = [];
  const fallback: Article[] = [];

  for (const article of safeList) {
    try {
      if (typeof isPriority === 'function' && isPriority(article)) {
        priority.push(article);
      } else {
        fallback.push(article);
      }
    } catch {
      fallback.push(article);
    }
  }

  if (typeof fallbackCompare === 'function') {
    try {
      fallback.sort((a, b) => {
        try {
          const res = fallbackCompare(a, b);
          return Number.isFinite(res) ? res : 0;
        } catch {
          return 0;
        }
      });
    } catch {
      // ignore
    }
  }

  const combined = [...priority, ...fallback];
  return combined.slice(0, Math.max(0, limit));
}

const CATEGORY_INITIAL_STORIES_COUNT = 4;
const CATEGORY_STORIES_PAGE_STEP = 4;
const CATEGORY_FETCH_LIMIT = 12;
const CATEGORY_VIEWPORT_ROOT_MARGIN = '700px 0px';
const HOME_EPAPER_CITY_SLUG = 'indore';
const HI_EPAPER_CITY_LABELS: Record<string, string> = {
  indore: '\u0907\u0902\u0926\u094c\u0930',
  ujjain: '\u0909\u091c\u094d\u091c\u0948\u0928',
  mumbai: '\u092e\u0941\u0902\u092c\u0908',
  delhi: '\u0926\u093f\u0932\u094d\u0932\u0940',
};

type HomeEpaperResponse = {
  items?: Array<HomePageEpaperPreview & { thumbnail?: string }>;
};

type HomePageProps = {
  initialHomeFeed?: HomePageFeedState | null;
};

function isIndoreEpaperPreview(paper: HomePageEpaperPreview | null | undefined) {
  if (!paper) return false;
  const citySlug = String(paper.citySlug || '').trim().toLowerCase();
  const cityName = String(paper.cityName || '').trim().toLowerCase();
  return citySlug === HOME_EPAPER_CITY_SLUG || (!citySlug && cityName === 'indore');
}

type CategorySectionViewModel = {
  slug: string;
  category: NewsCategory | undefined;
  items: Article[];
  accent: string;
};

type ArticleTileProps = {
  article: Article;
  language: 'en' | 'hi';
  priority?: boolean;
};

type PublicationPromoCard = {
  href: string;
  dateLabel?: string;
  thumbnailSrc: string;
  thumbnailAlt: string;
  eyebrowLabel: string;
  title: string;
  editionLabel: string;
  supportLabel?: string;
  ctaLabel: string;
  ariaLabel: string;
};

function getSectionCopy(language: 'en' | 'hi', hi: string, en: string) {
  return language === 'hi' ? hi : en;
}

function NewsroomSectionHeader({
  title,
  href,
  cta,
  accentClass = 'bg-gradient-to-b from-red-600 via-rose-500 to-amber-500 shadow-[0_0_8px_rgba(225,29,72,0.35)]',
  ctaClass = 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300',
}: {
  title: string;
  href?: string;
  cta?: string;
  accentClass?: string;
  ctaClass?: string;
}) {
  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
      <h2 className="hi-heading newsroom-heading flex min-w-0 items-center gap-2 text-[0.98rem] font-semibold leading-snug sm:text-[1.08rem]">
        <span className={`h-5 w-1.5 rounded-full ${accentClass}`} />
        <span className="truncate">{title}</span>
      </h2>
      {href && cta ? (
        <Link
          href={href}
          className={`reader-touch-link reader-focus-ring inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-bold transition hover:bg-red-500/10 ${ctaClass}`}
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function LiveUpdateStory({
  article,
  language,
}: {
  article?: Article | null;
  language: 'en' | 'hi';
}) {
  if (!article || !article.id) return null;

  const href = buildArticlePublicPath({ id: article.id, slug: article.slug });
  const timeLabel = formatDesktopHeroDate(article.publishedAt, language);

  return (
    <Link
      href={href}
      className="reader-focus-ring group relative grid min-h-[84px] grid-cols-[82px_minmax(0,1fr)] items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-white p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/60 hover:shadow-[0_8px_20px_-6px_rgba(220,38,38,0.22)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:hover:border-red-500/60 sm:min-h-[86px] sm:grid-cols-[86px_minmax(0,1fr)] xl:grid-cols-[88px_minmax(0,1fr)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] rounded-t-xl bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="newsroom-image-bg relative h-[72px] w-[82px] overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-950 sm:h-[76px] sm:w-[86px] xl:h-[78px] xl:w-[88px]">
        <ReaderImage
          src={buildArticleImageVariantUrl(article.image, 'thumb')}
          alt={article.title}
          fill
          className="object-cover object-center"
          sizes="88px"
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
          <span className="max-w-[8.75rem] truncate text-[9px] font-black uppercase leading-none text-red-500 dark:text-red-400">
            {article.category}
          </span>
          <span className="newsroom-dot h-1 w-1 rounded-full" />
          <span className="newsroom-muted truncate text-[9px] font-semibold">
            {timeLabel}
          </span>
        </div>
        <p className="newsroom-card-title-match-sm newsroom-heading line-clamp-2 transition group-hover:text-red-600 dark:group-hover:text-red-400">
          {article.title}
        </p>
      </div>
    </Link>
  );
}

function HeadlineImageCard({
  article,
  language,
  priority = false,
}: ArticleTileProps) {
  if (!article || !article.id) return null;

  const href = buildArticlePublicPath({ id: article.id, slug: article.slug });
  const timeLabel = formatDesktopHeroDate(article.publishedAt, language);

  return (
    <Link
      href={href}
      className="reader-focus-ring group relative block h-full overflow-hidden rounded-xl border border-zinc-200/80 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-red-400/60 hover:shadow-[0_10px_28px_-6px_rgba(220,38,38,0.22)] dark:border-zinc-800 dark:bg-zinc-900/90 dark:hover:border-red-500/60"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="newsroom-image-bg relative aspect-[16/9] overflow-hidden">
        <ReaderImage
          src={buildArticleImageVariantUrl(article.image, 'card')}
          alt={article.title}
          fill
          priority={priority}
          className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 767px) 100vw, (max-width: 1279px) 33vw, 360px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/12 to-transparent" />
        <span className="absolute right-2 top-2 max-w-[8.5rem] truncate rounded bg-red-700 px-2 py-1 text-[10px] font-black leading-none text-white">
          {article.category}
        </span>
      </div>
      <div className="flex min-h-[112px] flex-col p-3">
        <h3 className="newsroom-card-title-match newsroom-heading line-clamp-2 min-h-[2.65rem] transition group-hover:text-red-600 dark:group-hover:text-red-400">
          {article.title}
        </h3>
        <div className="newsroom-muted mt-auto flex min-w-0 items-center justify-between gap-2 pt-2 text-[11px] font-semibold">
          <span className="inline-flex min-w-0 items-center gap-1">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{timeLabel}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function RankedStoryList({
  articles,
  language,
}: {
  articles: Article[];
  language: 'en' | 'hi';
}) {
  const safeArticles = Array.isArray(articles)
    ? articles.filter((a): a is Article => Boolean(a && a.id))
    : [];

  return (
    <div className="newsroom-panel newsroom-right-rail rounded-xl border border-orange-500/25 p-3 shadow-sm">
      <NewsroomSectionHeader
        title={getSectionCopy(language, 'लोकप्रिय खबरें', 'Popular News')}
        href="/main/latest"
        cta={getSectionCopy(language, 'सभी देखें', 'View All')}
      />
      <div className="space-y-2" data-testid="popular-news-rail">
        {safeArticles.slice(0, 6).map((article) => (
          <Link
            key={article.id}
            href={buildArticlePublicPath({ id: article.id, slug: article.slug })}
            className="reader-focus-ring group grid min-h-[78px] grid-cols-[98px_minmax(0,1fr)] items-center gap-2.5 rounded-lg border border-transparent p-1.5 transition hover:border-orange-500/30 hover:bg-orange-500/5 dark:hover:bg-white/[0.045]"
          >
            <div className="newsroom-image-bg relative h-[62px] overflow-hidden rounded-md">
              <ReaderImage
                src={buildArticleImageVariantUrl(article.image, 'thumb')}
                alt={article.title}
                fill
                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                sizes="98px"
              />
            </div>
            <div className="min-w-0">
              <p className="newsroom-card-title-match-sm newsroom-heading line-clamp-2 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                {article.title}
              </p>
              <span className="newsroom-muted mt-1 inline-flex items-center gap-1 text-[10px] font-semibold">
                <Clock3 className="h-3 w-3" />
                {formatDesktopHeroDate(article.publishedAt, language)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FeaturedStoryBand({
  articles,
  language,
}: {
  articles?: Article[] | null;
  language: 'en' | 'hi';
}) {
  const safeArticles = Array.isArray(articles)
    ? articles.filter((a): a is Article => Boolean(a && a.id))
    : [];
  const feature = safeArticles[0];

  if (!feature) return null;

  return (
    <Link
      href={buildArticlePublicPath({ id: feature.id, slug: feature.slug })}
      className="reader-focus-ring newsroom-feature-band group relative grid min-h-[112px] overflow-hidden rounded-xl border border-zinc-200/80 p-4 transition hover:border-red-500/50 hover:shadow-[0_10px_28px_-6px_rgba(220,38,38,0.22)] dark:border-zinc-800 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-5"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 shadow-[0_1px_8px_rgba(225,29,72,0.35)]" />
      <div className="relative z-10 min-w-0">
        <span className="mb-2 inline-flex items-center gap-1.5 rounded bg-red-600 px-2 py-1 text-[10px] font-black uppercase text-white">
          <Flame className="h-3 w-3" />
          {getSectionCopy(language, 'विशेष रिपोर्ट', 'Lead Story')}
        </span>
        <h2 className="newsroom-feature-title-match newsroom-heading line-clamp-2">
          {feature.title}
        </h2>
        <p className="newsroom-card-summary-match newsroom-muted mt-2 line-clamp-1">
          {feature.summary}
        </p>
      </div>
      <div className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[260px] opacity-70 sm:block">
        <ReaderImage
          src={buildArticleImageVariantUrl(feature.image, 'featured')}
          alt={feature.title}
          fill
          className="object-cover object-center grayscale transition duration-500 group-hover:scale-105 group-hover:grayscale-0 dark:mix-blend-screen"
          sizes="260px"
        />
        <div className="newsroom-feature-image-fade absolute inset-0" />
      </div>
      <span className="relative z-10 mt-4 inline-flex w-fit items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-xs font-black text-white shadow-[0_16px_30px_rgba(185,28,28,0.28)] sm:mt-0 sm:self-end">
        {getSectionCopy(language, 'पढ़ें', 'Read')}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

const NewsPoll = dynamic(() => import('@/components/ui/NewsPoll'), {
  ssr: false,
  loading: NewsPollFallback,
});

function NewsPollFallback() {
  return (
    <div className="cnp-surface overflow-hidden p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-6 w-4/5 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-12 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}

function TopSideStoriesFallback({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="newsroom-skeleton-card h-full animate-pulse rounded-lg border"
        >
          <div className="flex h-full items-center gap-3 p-3">
            <div className="newsroom-skeleton-block h-[74px] w-[82px] flex-none rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="newsroom-skeleton-block h-4 w-11/12 rounded" />
              <div className="newsroom-skeleton-block h-4 w-7/12 rounded" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function CategoryStoriesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {[0, 1].map((item) => (
        <div
          key={item}
          className="newsroom-skeleton-card min-h-24 animate-pulse rounded-lg border"
        >
          <div className="space-y-2 p-4">
            <div className="newsroom-skeleton-block h-3 w-20 rounded" />
            <div className="newsroom-skeleton-block h-4 w-11/12 rounded" />
            <div className="newsroom-skeleton-block h-4 w-8/12 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MagazinePromoTile({ promo }: { promo: PublicationPromoCard }) {
  return (
    <Link
      href={promo.href}
      aria-label={promo.ariaLabel}
      className="reader-focus-ring newsroom-magazine-card group relative grid min-h-[184px] overflow-hidden rounded-xl border border-zinc-200/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-red-500/60 hover:shadow-[0_12px_32px_-8px_rgba(220,38,38,0.25)] dark:border-zinc-800 lg:min-h-[180px]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 shadow-[0_1px_8px_rgba(225,29,72,0.35)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_38%,rgba(225,29,72,0.06))]" />

      <div className="relative grid h-full grid-cols-[118px_minmax(0,1fr)] items-center gap-3 p-3 sm:grid-cols-[136px_minmax(0,1fr)] lg:grid-cols-[112px_minmax(0,1fr)] xl:grid-cols-[124px_minmax(0,1fr)]">
        <div className="flex items-center justify-center">
          <div className="relative w-full max-w-[118px] sm:max-w-[128px] lg:max-w-[106px] xl:max-w-[118px]">
            <div className="pointer-events-none absolute inset-x-4 top-3 aspect-[3/4] rotate-[5deg] rounded-lg border border-white/10 bg-white/8" />
            <div className="pointer-events-none absolute inset-x-2 top-1 aspect-[3/4] -rotate-[4deg] rounded-lg border border-white/10 bg-black/20" />
            <div className="relative rounded-lg border border-white/12 bg-white/8 p-1.5 shadow-[0_16px_28px_rgba(0,0,0,0.22)]">
              <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-[#f6f1e8]">
                <ReaderImage
                  src={promo.thumbnailSrc}
                  alt={promo.thumbnailAlt}
                  fill
                  fallbackSrc="/placeholders/epaper-3x4.svg"
                  className="object-contain p-1 transition-transform duration-500 group-hover:scale-[1.025]"
                  sizes="128px"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 py-1">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded bg-red-600 px-2.5 py-1 text-[8.5px] font-black uppercase text-white shadow-sm">
            <BookOpen className="h-3 w-3 shrink-0 text-white" />
            <span className="truncate">{promo.eyebrowLabel}</span>
          </span>

          <h3 className="newsroom-card-title-match newsroom-heading mt-2 line-clamp-2">
            <span>{promo.title}</span>
            <span className="newsroom-muted mx-1.5 font-medium">-</span>
            <span className="newsroom-body font-semibold">
              {promo.editionLabel}
            </span>
          </h3>

          {promo.supportLabel ? (
            <p className="newsroom-card-summary-match newsroom-muted mt-1.5 line-clamp-2">
              {promo.supportLabel}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {promo.dateLabel ? (
              <span className="newsroom-pill-muted inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[9px] font-bold shadow-sm">
                <CalendarDays className="h-3 w-3 text-red-300" />
                <span className="whitespace-nowrap">{promo.dateLabel}</span>
              </span>
            ) : null}

            <span className="inline-flex h-8 items-center gap-1 rounded-md bg-red-600 px-3 text-[9px] font-black text-white shadow-[0_12px_24px_rgba(127,29,29,0.22)] transition group-hover:bg-red-500">
              <span>{promo.ctaLabel}</span>
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function useNearViewport() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);

  useEffect(() => {
    if (isNearViewport) return;

    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: CATEGORY_VIEWPORT_ROOT_MARGIN, threshold: 0.01 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [isNearViewport]);

  return { ref, isNearViewport };
}

type LazyCategorySectionProps = {
  section: CategorySectionViewModel;
  language: 'en' | 'hi';
  visibleCount: number;
  onVisible: (slug: string) => void;
  onShowMore: (slug: string, totalItems: number) => void;
};

function LazyCategorySection({
  section,
  language,
  visibleCount,
  onVisible,
  onShowMore,
}: LazyCategorySectionProps) {
  const { ref, isNearViewport } = useNearViewport();
  const categoryLabel = section.category
    ? language === 'hi'
      ? section.category.name
      : section.category.nameEn
    : section.slug;
  const safeItems = Array.isArray(section?.items) ? section.items : [];
  const visibleArticles = isNearViewport
    ? safeItems.slice(0, visibleCount)
    : [];
  const hasMoreStories = isNearViewport && visibleCount < safeItems.length;
  const categoryHref = getNewsCategoryHref(section.slug);
  const headerStyle: CSSProperties = {
    borderColor: hexToRgba(section.accent, 0.28),
    boxShadow: `0 18px 55px -44px ${hexToRgba(section.accent, 0.75)}`,
  };
  const accentStyle: CSSProperties = {
    backgroundColor: section.accent,
  };

  useEffect(() => {
    if (isNearViewport) {
      onVisible(section.slug);
    }
  }, [isNearViewport, onVisible, section.slug]);

  return (
    <div
      ref={ref}
      style={headerStyle}
      className="newsroom-panel overflow-hidden rounded-lg border px-3 py-4 sm:px-5 sm:py-5 md:px-6"
    >
      <div className="newsroom-divider mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3 sm:mb-4 sm:pb-4">
        <div className="min-w-0">
          <h2 className="newsroom-heading flex items-center gap-2 text-[1.05rem] font-black sm:text-2xl">
            <span style={accentStyle} className="h-5 w-1 rounded-sm sm:h-6 sm:w-1.5" />
            <span className="truncate">{categoryLabel}</span>
          </h2>
          <p className="newsroom-muted mt-1 text-xs font-medium sm:text-sm">
            {language === 'hi'
              ? '\u0938\u092c\u0938\u0947 \u0928\u0908 \u092a\u094d\u0930\u0915\u093e\u0936\u093f\u0924 \u0916\u092c\u0930\u0947\u0902'
              : 'Top latest published stories'}
          </p>
        </div>
        <Link
          href={categoryHref}
          className="reader-touch-link reader-focus-ring newsroom-soft-button inline-flex min-h-10 items-center gap-1 rounded-md border px-3 py-2 text-[11px] font-semibold transition sm:text-sm"
        >
          {language === 'hi' ? '\u0936\u094d\u0930\u0947\u0923\u0940 \u0926\u0947\u0916\u0947\u0902' : 'View Category'}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {!isNearViewport ? (
        <CategoryStoriesSkeleton />
      ) : visibleArticles.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleArticles.map((article, index) => (
            <NewsCard key={article.id} article={article} size="sm" index={index} />
          ))}
        </div>
      ) : (
        <div className="newsroom-empty rounded-lg border border-dashed px-4 py-8 text-center text-sm font-medium">
          {language === 'hi'
            ? '\u0907\u0938 \u0936\u094d\u0930\u0947\u0923\u0940 \u092e\u0947\u0902 \u0905\u092d\u0940 \u0915\u094b\u0908 \u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930 \u0928\u0939\u0940\u0902 \u0939\u0948.'
            : 'No latest stories are published in this category yet.'}
        </div>
      )}

      {hasMoreStories ? (
        <div className="flex justify-center pt-4 sm:pt-5">
          <button
            type="button"
            onClick={() => onShowMore(section.slug, section.items.length)}
            className="reader-touch-button reader-focus-ring newsroom-soft-button min-h-12 w-full rounded-md border px-6 py-3 text-[13px] font-semibold transition-all hover:-translate-y-0.5 sm:w-auto sm:px-8 sm:text-sm"
          >
            Load more Stories
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function fetchLatestPublicationPreview(
  publicationType: 'epaper' | 'emagazine'
): Promise<HomePageEpaperPreview | null> {
  try {
    const query = new URLSearchParams({
      limit: '1',
      publicationType,
    });
    if (publicationType === 'epaper') {
      query.set('citySlug', HOME_EPAPER_CITY_SLUG);
    }
    const response = await fetch(`/api/v1/public/epapers/latest?${query.toString()}`);
    const payload = (await response.json().catch(() => ({}))) as HomeEpaperResponse;
    if (!response.ok) return null;

    const first = Array.isArray(payload.items) ? payload.items[0] : null;
    if (!first || (publicationType === 'epaper' && !isIndoreEpaperPreview(first))) return null;

    return {
      _id: String(first._id || ''),
      publicationType,
      citySlug: String(first.citySlug || ''),
      cityName: String(first.cityName || ''),
      title: String(first.title || ''),
      publishDate: String(first.publishDate || ''),
      thumbnailPath: firstNonEmptyString(first.thumbnailPath, first.thumbnail),
      pageCount: Number(first.pageCount || 0),
    };
  } catch {
    return null;
  }
}

function fetchLatestEpaperPreview() {
  return fetchLatestPublicationPreview('epaper');
}

function fetchLatestEmagazinePreview() {
  return fetchLatestPublicationPreview('emagazine');
}

export default function HomePage({ initialHomeFeed = null }: HomePageProps) {
  const { language } = useAppStore();
  const [isClientReady, setIsClientReady] = useState(false);
  const [isFeedLoading, setIsFeedLoading] = useState(!initialHomeFeed?.articles?.length);
  const [feedArticles, setFeedArticles] = useState<Article[]>(
    () => initialHomeFeed?.articles || []
  );
  const [latestEpaper, setLatestEpaper] = useState<HomePageEpaperPreview | null>(
    () => (isIndoreEpaperPreview(initialHomeFeed?.epaper) ? initialHomeFeed?.epaper || null : null)
  );
  const [latestEmagazine, setLatestEmagazine] = useState<HomePageEpaperPreview | null>(
    () => initialHomeFeed?.emagazine || null
  );
  const hasInitialArticles = Boolean(initialHomeFeed?.articles?.length);
  const hasInitialEpaper = isIndoreEpaperPreview(initialHomeFeed?.epaper);
  const hasInitialEmagazine = Boolean(initialHomeFeed?.emagazine);
  const [visibleCategoryStoryCounts, setVisibleCategoryStoryCounts] = useState<Record<string, number>>({});
  const [categoryArticlesBySlug, setCategoryArticlesBySlug] = useState<Record<string, Article[]>>({});
  const requestedCategorySlugsRef = useRef<Set<string>>(new Set());
  const categoryRequestGenerationRef = useRef(0);
  const latestPublishedArticles = useMemo(() => {
    const safeSource = (Array.isArray(feedArticles) ? feedArticles : []).filter(
      (a): a is Article => Boolean(a && typeof a === 'object' && a.id)
    );
    return [...safeSource].sort(
      (a, b) => getPublishedTimestamp(b) - getPublishedTimestamp(a)
    );
  }, [feedArticles]);

  const heroArticles = useMemo(() => {
    const articles = latestPublishedArticles.slice(0, 5);
    return articles;
  }, [latestPublishedArticles]);

  const liveUpdateStories = useMemo(
    () =>
      buildHomepageRail(
        latestPublishedArticles,
        (article) => Boolean(article?.isBreaking),
        4,
        (a, b) => getPublishedTimestamp(b) - getPublishedTimestamp(a)
      ),
    [latestPublishedArticles]
  );

  const featuredSidebar = useMemo(
    () =>
      buildHomepageRail(
        latestPublishedArticles,
        (article) => Boolean(article?.isTrending),
        6,
        (a, b) => (b?.views || 0) - (a?.views || 0) || getPublishedTimestamp(b) - getPublishedTimestamp(a)
      ),
    [latestPublishedArticles]
  );

  const categorySections = useMemo(() => {
    return NEWS_CATEGORY_DEFINITIONS.map((definition) => {
      const slug = definition.slug;
      const category = resolveNewsCategory(slug);
      const fetchedItems = Array.isArray(categoryArticlesBySlug[slug]) ? categoryArticlesBySlug[slug] : [];
      const feedItems = latestPublishedArticles.filter(
        (article) => article && categoryMatches(article.category, slug, NEWS_CATEGORY_DEFINITIONS)
      );
      const rawItems = fetchedItems.length ? fetchedItems : feedItems;
      const items = (Array.isArray(rawItems) ? rawItems : [])
        .filter((a): a is Article => Boolean(a && a.id))
        .slice(0, CATEGORY_FETCH_LIMIT);

      return {
        slug,
        category,
        items,
        accent: category?.color || '#F97316',
      };
    });
  }, [categoryArticlesBySlug, latestPublishedArticles]);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

  const loadCategoryStories = useCallback((slug: string) => {
    if (requestedCategorySlugsRef.current.has(slug)) return;
    requestedCategorySlugsRef.current.add(slug);
    const generation = categoryRequestGenerationRef.current;

    void (async () => {
      const page = await fetchPublicArticlesPage({
        category: slug,
        limit: CATEGORY_FETCH_LIMIT,
      });
      const articles = page
        ? mapPublicArticlesToUiArticles(page.items).sort(
          (a, b) => getPublishedTimestamp(b) - getPublishedTimestamp(a)
        )
        : [];

      if (generation !== categoryRequestGenerationRef.current) return;

      setCategoryArticlesBySlug((current) => ({
        ...current,
        [slug]: articles,
      }));
    })();
  }, []);

  const showMoreCategoryStories = useCallback((slug: string, totalItems: number) => {
    setVisibleCategoryStoryCounts((current) => {
      const visibleCount = current[slug] || CATEGORY_INITIAL_STORIES_COUNT;

      return {
        ...current,
        [slug]: Math.min(visibleCount + CATEGORY_STORIES_PAGE_STEP, totalItems),
      };
    });
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let hasArticles = hasInitialArticles;
      let hasEpaper = hasInitialEpaper;
      let hasEmagazine = hasInitialEmagazine;

      if (!hasArticles || !hasEpaper || !hasEmagazine) {
        const homeFeed = await fetchHomeFeedForHomePage();

        if (active && homeFeed) {
          if (!hasArticles && homeFeed.articles?.length) {
            setFeedArticles(homeFeed.articles);
            hasArticles = true;
          }
          if (!hasEpaper && isIndoreEpaperPreview(homeFeed.epaper)) {
            setLatestEpaper(homeFeed.epaper);
            hasEpaper = true;
          }
          if (!hasEmagazine && homeFeed.emagazine) {
            setLatestEmagazine(homeFeed.emagazine);
            hasEmagazine = true;
          }
        }
      }

      const [fallbackArticles, fallbackEpaper, fallbackEmagazine] = await Promise.all([
        hasArticles ? Promise.resolve(null) : fetchPublicArticlesPage({ limit: 100 }),
        hasEpaper ? Promise.resolve(null) : fetchLatestEpaperPreview(),
        hasEmagazine ? Promise.resolve(null) : fetchLatestEmagazinePreview(),
      ]);

      if (!active) return;

      setIsFeedLoading(false);

      if (fallbackArticles) {
        setFeedArticles(mapPublicArticlesToUiArticles(fallbackArticles.items));
      }
      if (fallbackEpaper) {
        setLatestEpaper(fallbackEpaper);
      }
      if (fallbackEmagazine) {
        setLatestEmagazine(fallbackEmagazine);
      }
    };

    if (!hasInitialArticles || !hasInitialEpaper || !hasInitialEmagazine) {
      void load();
    }

    return () => {
      active = false;
    };
  }, [hasInitialArticles, hasInitialEpaper, hasInitialEmagazine]);

  useEffect(() => {
    setVisibleCategoryStoryCounts({});
    setCategoryArticlesBySlug({});
    requestedCategorySlugsRef.current.clear();
    categoryRequestGenerationRef.current += 1;
  }, [feedArticles]);

  const epaperHref = (() => {
    if (!latestEpaper) return '/main/epaper';
    const query = new URLSearchParams();
    if (latestEpaper.citySlug) {
      query.set('city', latestEpaper.citySlug);
    }
    if (latestEpaper.publishDate) {
      query.set('date', latestEpaper.publishDate);
    }
    const search = query.toString();
    return search ? `/main/epaper?${search}` : '/main/epaper';
  })();
  const epaperCity = latestEpaper?.cityName.trim()
    ? latestEpaper.cityName
    : language === 'hi'
      ? '\u0921\u093f\u091c\u093f\u091f\u0932 \u090f\u0921\u093f\u0936\u0928'
      : 'Digital edition';
  const localizedEpaperCity =
    language === 'hi' && latestEpaper?.citySlug
      ? HI_EPAPER_CITY_LABELS[latestEpaper.citySlug] || epaperCity
      : epaperCity;
  const desktopHeroEpaperDateLabel = formatDesktopHeroDate(latestEpaper?.publishDate, language);
  const isDesktopHeroEpaperToday = Boolean(
    latestEpaper?.publishDate && latestEpaper.publishDate === getLocalDateKey()
  );
  const epaperThumbnail = latestEpaper?.thumbnailPath || '/placeholders/epaper-3x4.svg';
  const epaperThumbnailAlt =
    language === 'hi'
      ? `${localizedEpaperCity} \u0908-\u092a\u0947\u092a\u0930 \u0915\u0935\u0930`
      : `${epaperCity} e-paper cover`;
  const epaperEditionLabel =
    language === 'hi'
      ? latestEpaper?.cityName.trim()
        ? `${localizedEpaperCity} \u0938\u0902\u0938\u094d\u0915\u0930\u0923`
        : '\u0906\u091c \u0915\u093e \u0921\u093f\u091c\u093f\u091f\u0932 \u0938\u0902\u0938\u094d\u0915\u0930\u0923'
      : latestEpaper?.cityName.trim()
        ? `${epaperCity} Edition`
        : "Today's digital edition";
  const desktopHeroEpaperTitle =
    language === 'hi'
      ? '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940'
      : 'Lokswami';
  const desktopHeroEpaperEyebrow =
    language === 'hi'
      ? isDesktopHeroEpaperToday
        ? '\u0906\u091c \u0915\u093e \u0908-\u092a\u0947\u092a\u0930'
        : '\u0924\u093e\u091c\u093c\u093e \u0908-\u092a\u0947\u092a\u0930'
      : isDesktopHeroEpaperToday
        ? "Today's E-Paper"
        : 'Latest E-Paper';
  const desktopHeroEpaperEdition =
    language === 'hi' ? `${localizedEpaperCity} \u090f\u0921\u093f\u0936\u0928` : epaperEditionLabel;
  const desktopHeroEpaperSupport =
    language === 'hi'
      ? isDesktopHeroEpaperToday
        ? '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, \u092a\u0942\u0930\u093e \u0921\u093f\u091c\u093f\u091f\u0932 \u0938\u0902\u0938\u094d\u0915\u0930\u0923'
        : '\u0909\u092a\u0932\u092c\u094d\u0927 \u0938\u092c\u0938\u0947 \u0928\u0908 \u0921\u093f\u091c\u093f\u091f\u0932 \u090f\u0921\u093f\u0936\u0928'
      : isDesktopHeroEpaperToday
        ? 'Fresh news, full digital edition'
        : 'Latest available digital edition';
  const desktopHeroEpaperAriaLabel =
    language === 'hi' ? '\u0905\u092d\u0940 \u0908-\u092a\u0947\u092a\u0930 \u092a\u0922\u093c\u0947\u0902' : "Read today's e-paper";
  const desktopHeroEpaperPrimaryCta =
    language === 'hi' ? '\u0908-\u092a\u0947\u092a\u0930 \u092a\u0922\u093c\u0947\u0902' : 'Read E-Paper';
  const emagazineIssueMonth = normalizePublicationIssueMonth(latestEmagazine?.publishDate);
  const emagazineHref = emagazineIssueMonth
    ? `/main/e-magazine?month=${encodeURIComponent(emagazineIssueMonth)}`
    : '/main/e-magazine';
  const emagazineIssueLabel = formatMagazineIssueLabel(
    latestEmagazine?.publishDate,
    language
  );
  const emagazineEditionLabel = emagazineIssueLabel
    ? language === 'hi'
      ? `${emagazineIssueLabel} \u0905\u0902\u0915`
      : `${emagazineIssueLabel} Issue`
    : language === 'hi'
      ? '\u092e\u093e\u0938\u093f\u0915 \u0905\u0902\u0915'
      : 'Monthly Issue';
  const emagazineThumbnail = latestEmagazine?.thumbnailPath || '/placeholders/epaper-3x4.svg';
  const emagazinePromo: PublicationPromoCard = {
    href: emagazineHref,
    dateLabel: emagazineIssueLabel || undefined,
    thumbnailSrc: emagazineThumbnail,
    thumbnailAlt:
      language === 'hi'
        ? '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940 \u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928 \u0915\u0935\u0930'
        : 'Lokswami e-magazine cover',
    eyebrowLabel:
      language === 'hi'
        ? '\u0924\u093e\u091c\u093c\u093e \u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928'
        : 'Latest E-Magazine',
    title: language === 'hi' ? '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940' : 'Lokswami',
    editionLabel: emagazineEditionLabel,
    supportLabel:
      language === 'hi'
        ? '\u0939\u0930 \u092e\u0939\u0940\u0928\u0947 \u092a\u094d\u0930\u0915\u093e\u0936\u093f\u0924 \u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928 \u0905\u0902\u0915'
        : 'Published monthly as an e-magazine issue',
    ctaLabel:
      language === 'hi'
        ? '\u092e\u0948\u0917\u091c\u093c\u0940\u0928 \u092a\u0922\u093c\u0947\u0902'
        : 'Read Magazine',
    ariaLabel:
      language === 'hi'
        ? '\u0924\u093e\u091c\u093c\u093e \u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928 \u092a\u0922\u093c\u0947\u0902'
        : 'Read latest e-magazine',
  };

  return (
    <div className="newsroom-home relative -mx-3 -mt-4 pb-6 [--section-gap:0.9rem] sm:-mx-5 sm:[--section-gap:1rem] lg:-mx-6 lg:[--section-gap:1.1rem] xl:-mx-8">
      <div className="mx-auto w-full max-w-[98rem] px-3 py-3 sm:px-4 lg:px-5">
        <section className="newsroom-top-package rounded-[28px] border p-2 sm:p-3 lg:p-3.5">
          <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)_minmax(15.5rem,17.5rem)] xl:items-stretch 2xl:grid-cols-[minmax(0,1fr)_minmax(18rem,20.5rem)_minmax(16.5rem,18rem)]">
            <div className="newsroom-panel newsroom-hero-shell overflow-hidden rounded-[28px] p-1.5 sm:p-2 lg:p-2.5">
              <div className="mb-1.5 flex items-center justify-start gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[10px] font-black uppercase text-white">
                  <Flame className="h-3 w-3" />
                  {getSectionCopy(language, 'टॉप स्टोरी', 'Top Story')}
                </span>
              </div>
              <div className="min-w-0">
                <HeroCarousel articles={heroArticles} variant="modern" />
                {heroArticles.length === 0 ? (
                  <p role="status" className="newsroom-muted px-4 py-10 text-center text-sm">
                    {isFeedLoading
                      ? getSectionCopy(language, 'खबरें लोड हो रही हैं…', 'Loading stories…')
                      : getSectionCopy(language, 'अभी खबरें उपलब्ध नहीं हैं। कृपया थोड़ी देर बाद फिर देखें।', 'Stories are unavailable right now. Please check again shortly.')}
                  </p>
                ) : null}
              </div>
            </div>

            <aside className="newsroom-panel newsroom-live-rail rounded-2xl p-3 lg:p-3.5">
              <NewsroomSectionHeader
                title={getSectionCopy(language, 'लाइव अपडेट्स', 'Live Updates')}
                href="/main/latest"
                cta={getSectionCopy(language, 'सभी देखें', 'View All')}
              />
              <div className="grid gap-2.5" data-testid="live-updates-rail">
                {isClientReady ? (
                  liveUpdateStories.map((article, index) => (
                    <motion.div
                      key={article.id}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, delay: index * 0.05 }}
                    >
                      <LiveUpdateStory article={article} language={language} />
                    </motion.div>
                  ))
                ) : (
                  <TopSideStoriesFallback count={4} />
                )}
              </div>
            </aside>

            <aside className="newsroom-panel newsroom-edition-rail hidden rounded-2xl p-3 xl:block xl:p-3.5">
              <div className="min-h-[280px] xl:min-h-0">
                <DesktopHeroEpaperCard
                  href={epaperHref}
                  dateLabel={desktopHeroEpaperDateLabel}
                  thumbnailSrc={epaperThumbnail}
                  thumbnailAlt={epaperThumbnailAlt}
                  eyebrowLabel={desktopHeroEpaperEyebrow}
                  title={desktopHeroEpaperTitle}
                  editionLabel={desktopHeroEpaperEdition}
                  supportLabel={desktopHeroEpaperSupport}
                  ariaLabel={desktopHeroEpaperAriaLabel}
                  primaryCtaLabel={desktopHeroEpaperPrimaryCta}
                  shareLabel={language === 'hi' ? '\u0936\u0947\u092f\u0930' : 'Share'}
                  language={language}
                />
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-[var(--section-gap)] grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.40fr)]">
          <div className="space-y-4">
            <HomeShortsSection shorts={initialHomeFeed?.shorts} language={language} />

            <div>
              <NewsroomSectionHeader
                title={getSectionCopy(language, '\u0924\u093e\u091c\u093e \u0914\u0930 \u092e\u0941\u0916\u094d\u092f \u0916\u092c\u0930\u0947\u0902', 'Top Story')}
                href="/main/latest"
                cta={getSectionCopy(language, '\u0938\u092d\u0940 \u0926\u0947\u0916\u0947\u0902', 'View All')}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {latestPublishedArticles.slice(0, 6).map((article, index) => (
                  <HeadlineImageCard
                    key={article.id}
                    article={article}
                    language={language}
                    priority={index < 2}
                  />
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <NewsPoll />

            <div className="newsroom-panel rounded-2xl border border-red-500/20 p-3.5 sm:p-4">
              <NewsroomSectionHeader
                title={getSectionCopy(language, '\u092e\u093e\u0938\u093f\u0915 \u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928', 'Monthly E-Magazine')}
                href={emagazineHref}
                cta={getSectionCopy(language, '\u092e\u0948\u0917\u091c\u093c\u0940\u0928 \u092a\u0922\u093c\u0947\u0902', 'Read Magazine')}
              />
              <MagazinePromoTile promo={emagazinePromo} />
            </div>
          </aside>
        </section>

        {categorySections.length ? (
          <section className="relative mt-[var(--section-gap)] space-y-4 sm:space-y-5">
            {categorySections.map((section) => (
              <LazyCategorySection
                key={section.slug}
                section={section}
                language={language}
                visibleCount={
                  visibleCategoryStoryCounts[section.slug] || CATEGORY_INITIAL_STORIES_COUNT
                }
                onVisible={loadCategoryStories}
                onShowMore={showMoreCategoryStories}
              />
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
