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
import { SectionHeader } from '@/components/ui/SectionHeader';
import magazineStyles from '@/components/home/HomepageMagazine.module.css';

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
    <div className="grid min-w-0 grid-cols-[96px_minmax(0,1fr)] items-center gap-3 min-[375px]:grid-cols-[104px_minmax(0,1fr)] md:grid-cols-[140px_minmax(0,1fr)] xl:grid-cols-[120px_minmax(0,1fr)]">
      <div className="relative aspect-[3/4] overflow-hidden rounded-editorial-sm border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
        <ReaderImage
          src={promo.thumbnailSrc}
          alt={promo.thumbnailAlt}
          fill
          fallbackSrc="/placeholders/epaper-3x4.svg"
          className="object-contain"
          sizes="(min-width: 1280px) 120px, (min-width: 768px) 140px, (min-width: 375px) 104px, 96px"
        />
      </div>
      <div className="flex min-w-0 flex-col items-start py-1">
        <span className="text-[10px] font-semibold uppercase leading-relaxed tracking-wide text-brand-600 dark:text-brand-400">{promo.eyebrowLabel}</span>
        <h3 title={promo.title} className="hindi-headline mt-1 line-clamp-2 break-words py-0.5 text-[17px] font-bold leading-relaxed text-zinc-900 dark:text-zinc-100">{promo.title}</h3>
        {promo.dateLabel ? (
          <p className="mt-1 flex max-w-full items-start gap-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            <CalendarDays aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{promo.dateLabel}</span>
          </p>
        ) : null}
        <Link href={promo.href} aria-label={promo.ariaLabel} className="editorial-focus-ring mt-4 inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-full bg-brand-600 px-3 text-xs font-semibold leading-relaxed text-white transition-colors hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
          <span>{promo.ctaLabel}</span><ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        </Link>
      </div>
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
        ? '\u0924\u093e\u091c\u093c\u093e \u0905\u0902\u0915'
        : 'Latest Issue',
    title: latestEmagazine?.title?.trim() || (language === 'hi' ? '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940' : 'Lokswami'),
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

            <section data-testid="homepage-emagazine" className="min-w-0 max-w-lg rounded-editorial-md border border-zinc-200 bg-white p-3 [container-name:homepage-magazine] [container-type:inline-size] dark:border-zinc-800 dark:bg-zinc-900 md:p-3.5 xl:p-4">
              <SectionHeader
                title={getSectionCopy(language, '\u092e\u093e\u0938\u093f\u0915 \u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928', 'Monthly E-Magazine')}
                href="/main/e-magazine"
                ctaText={getSectionCopy(language, '\u0938\u092d\u0940 \u0905\u0902\u0915', 'All Issues')}
                className={`${magazineStyles.header} !mb-3 !gap-2 [&>a]:px-0 [&>a]:font-medium [&>a]:hover:bg-transparent [&>a]:dark:hover:bg-transparent`}
                titleClassName="leading-relaxed [&>span:last-child]:whitespace-normal [&>span:last-child]:overflow-visible [&>span:last-child]:text-clip"
              />
              <MagazinePromoTile promo={emagazinePromo} />
            </section>
          </aside>
        </section>

      </Container>
    </div>
  );
}
