'use client';

import dynamic from 'next/dynamic';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
} from 'lucide-react';
import HomepageTopPackage from '@/components/home/HomepageTopPackage';
import Container from '@/components/layout/Container';
import CategorySection from '@/components/home/CategorySection';
import HomeVideosSection from '@/components/home/HomeVideosSection';
import { selectHomepageCategories, type HomepageDiscovery } from '@/lib/content/homepageDiscovery';
import ReaderImage from '@/components/ui/ReaderImage';
import DesktopHeroEpaperCard from '@/components/ui/DesktopHeroEpaperCard';
import HomeShortsSection from '@/components/video/HomeShortsSection';
import type { Article } from '@/lib/mock/data';
import {
  fetchHomeFeedForHomePage,
  type HomePageEpaperPreview,
  type HomePageFeedState,
} from '@/lib/content/homeFeed';
import {
  fetchPublicArticlesPage,
  mapPublicArticlesToUiArticles,
} from '@/lib/content/publicArticles';
import { useAppStore } from '@/lib/store/appStore';
import {
  buildArticleImageVariantUrl,
} from '@/lib/utils/articleMedia';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import { formatUiDate } from '@/lib/utils/dateFormat';
import { normalizePublicationIssueMonth } from '@/lib/utils/epaperPublication';

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
  initialDiscovery?: HomepageDiscovery | null;
};

function isIndoreEpaperPreview(paper: HomePageEpaperPreview | null | undefined) {
  if (!paper) return false;
  const citySlug = String(paper.citySlug || '').trim().toLowerCase();
  const cityName = String(paper.cityName || '').trim().toLowerCase();
  return citySlug === HOME_EPAPER_CITY_SLUG || (!citySlug && cityName === 'indore');
}

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
      className="editorial-focus-ring group grid min-h-[84px] grid-cols-[82px_minmax(0,1fr)] items-center gap-3 rounded-editorial-sm border border-zinc-200 bg-white p-3 transition-colors hover:border-brand-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-500"
    >
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
        <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold leading-relaxed text-brand-600 dark:text-brand-400">
            {article.category}
          </span>
          <span className="newsroom-dot h-1 w-1 rounded-full" />
          <span className="newsroom-muted text-xs leading-relaxed">
            {timeLabel}
          </span>
        </div>
        <p className="hindi-headline break-words text-base font-semibold leading-relaxed group-hover:text-brand-600 dark:group-hover:text-brand-400">
          {article.title}
        </p>
      </div>
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

export default function HomePage({ initialHomeFeed = null, initialDiscovery = null }: HomePageProps) {
  const { language } = useAppStore();

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
  const latestPublishedArticles = useMemo(() => {
    const safeSource = (Array.isArray(feedArticles) ? feedArticles : []).filter(
      (a): a is Article => Boolean(a && typeof a === 'object' && a.id)
    );
    return [...safeSource].sort(
      (a, b) => getPublishedTimestamp(b) - getPublishedTimestamp(a)
    );
  }, [feedArticles]);

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

  const categorySections = useMemo(
    () => selectHomepageCategories(latestPublishedArticles, initialDiscovery?.categoryArticles),
    [latestPublishedArticles, initialDiscovery?.categoryArticles]
  );

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
      <Container variant="wide" className="py-3">
        <HomepageTopPackage articles={latestPublishedArticles} language={language} loading={isFeedLoading} />

        <section className="mt-[var(--section-gap)] grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.40fr)]">
          <div className="min-w-0 space-y-4">
            {categorySections.map((section) => <CategorySection key={section.category.slug} {...section} language={language} />)}
            <HomeVideosSection videos={initialDiscovery?.videos || []} error={initialDiscovery?.videoError} language={language} />
            <HomeShortsSection shorts={initialDiscovery?.shorts || []} language={language} />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-editorial-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <NewsroomSectionHeader title={getSectionCopy(language, 'लाइव अपडेट्स', 'Live Updates')} href="/main/latest" cta={getSectionCopy(language, 'सभी देखें', 'View All')} />
              <div className="grid gap-3" data-testid="live-updates-rail">
                {liveUpdateStories.map((article) => <LiveUpdateStory key={article.id} article={article} language={language} />)}
              </div>
            </section>
            <DesktopHeroEpaperCard
              href={epaperHref} dateLabel={desktopHeroEpaperDateLabel}
              thumbnailSrc={epaperThumbnail} thumbnailAlt={epaperThumbnailAlt}
              eyebrowLabel={desktopHeroEpaperEyebrow} title={desktopHeroEpaperTitle}
              editionLabel={desktopHeroEpaperEdition} supportLabel={desktopHeroEpaperSupport}
              ariaLabel={desktopHeroEpaperAriaLabel} primaryCtaLabel={desktopHeroEpaperPrimaryCta}
              shareLabel={language === 'hi' ? 'शेयर' : 'Share'} language={language}
            />
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

      </Container>
    </div>
  );
}
