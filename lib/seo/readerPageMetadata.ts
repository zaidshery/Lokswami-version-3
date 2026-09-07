import type { Metadata } from 'next';
import { COMPANY_INFO } from '@/lib/constants/company';
import { EPAPER_CITY_OPTIONS } from '@/lib/constants/epaperCities';
import { resolveNewsCategory } from '@/lib/constants/newsCategories';
import {
  formatPublicationIssueLabel,
  getPublicationTypeLabels,
  isMonthlyEPaperPublication,
  normalizePublicationIssueMonth,
} from '@/lib/utils/epaperPublication';
import type { EPaperPublicationType } from '@/lib/types/epaper';

const FALLBACK_SITE_URL = 'http://localhost:3000';
const DEFAULT_OG_IMAGE = '/lokswami-share-preview.png';

type MetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string;
  robots?: Metadata['robots'];
};

type EpaperMetadataInput = {
  publicationType?: EPaperPublicationType;
  city: string;
  publishDate: string;
  paperId?: string;
  page?: number;
  storyToken?: string;
  issueTitle?: string;
  issueCityName?: string;
  storyTitle?: string;
  storyExcerpt?: string;
  storyPage?: number;
  image?: string;
};

type VideoMetadataInput = {
  videoId?: string;
  title?: string;
  description?: string;
  category?: string;
  image?: string;
};

type SwipeMetadataInput = VideoMetadataInput & {
  slug: string;
};

function formatTitle(title: string) {
  return title.includes(COMPANY_INFO.name) ? title : `${title} | ${COMPANY_INFO.name}`;
}

export function normalizeSiteUrl(value: string) {
  return value.replace(/\/+$/, '');
}

export function resolveSiteUrl() {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL);
}

export function toAbsoluteUrl(input: string, siteUrl = resolveSiteUrl()) {
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  if (!input.startsWith('/')) return `${siteUrl}/${input}`;
  return `${siteUrl}${input}`;
}

function slugToTitle(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function formatMetadataDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function buildEpaperIssueTitle(cityName: string, formattedDate: string) {
  const location = cityName ? `${cityName} ` : '';
  const date = formattedDate ? ` - ${formattedDate}` : '';
  return `Lokswami ${location}E-Paper${date}`;
}

function buildPublicationIssueTitle(
  cityName: string,
  formattedDate: string,
  publicationType: EPaperPublicationType
) {
  if (!isMonthlyEPaperPublication(publicationType)) {
    return buildEpaperIssueTitle(cityName, formattedDate);
  }

  const date = formattedDate ? ` - ${formattedDate}` : '';
  return `Lokswami E-Magazine${date}`;
}

function buildMetadata(input: MetadataInput): Metadata {
  const siteUrl = resolveSiteUrl();
  const canonical = toAbsoluteUrl(input.path, siteUrl);
  const image = toAbsoluteUrl(input.image || DEFAULT_OG_IMAGE, siteUrl);
  const title = formatTitle(input.title);

  return {
    title,
    description: input.description,
    keywords: input.keywords,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description: input.description,
      url: canonical,
      type: 'website',
      siteName: COMPANY_INFO.name,
      locale: 'hi_IN',
      images: image
        ? [
            {
              url: image,
              width: 1200,
              height: 630,
              alt: title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: input.description,
      images: image ? [image] : undefined,
    },
    robots: input.robots || {
      index: true,
      follow: true,
      'max-image-preview': 'large',
    },
  };
}

export function buildLatestPageMetadata() {
  return buildMetadata({
    title: 'Latest Hindi News and Breaking Headlines',
    description:
      'Track the newest Hindi news updates, breaking headlines, and top stories from Lokswami across politics, regional, business, sports, and more.',
    path: '/main/latest',
    keywords: [
      'latest hindi news',
      'breaking headlines',
      'today news',
      'lokswami latest news',
      'india news updates',
    ],
  });
}

export function buildVideosPageMetadata() {
  return buildMetadata({
    title: 'Hindi News Videos and Shorts',
    description:
      'Watch Hindi news videos, explainers, interviews, and shorts from Lokswami covering the biggest stories of the day.',
    path: '/main/videos',
    keywords: [
      'hindi news videos',
      'news shorts',
      'lokswami videos',
      'breaking news video',
      'india video news',
    ],
  });
}

export function buildVideoPageMetadata(input: VideoMetadataInput) {
  const videoId = String(input.videoId || '').trim();
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const category = String(input.category || '').trim();

  return buildMetadata({
    title: title ? `${title} | Lokswami Video` : 'Lokswami Video',
    description:
      description ||
      'Watch this Lokswami news video with a full preview image, headline, and quick summary.',
    path: videoId ? `/main/videos?video=${encodeURIComponent(videoId)}` : '/main/videos',
    image: input.image,
    keywords: [
      'lokswami video',
      'news video',
      'hindi video update',
      category ? `${category.toLowerCase()} video` : '',
    ].filter(Boolean),
  });
}

export function buildSwipePageMetadata(input: SwipeMetadataInput) {
  const slug = String(input.slug || '').trim();
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const category = String(input.category || '').trim();

  return buildMetadata({
    title: title ? `${title} | Lokswami Swipe` : 'Lokswami Swipe',
    description:
      description ||
      'Watch this Lokswami Swipe news update, open the quick summary, and read the complete published report.',
    path: slug ? `/main/shorts/${encodeURIComponent(slug)}` : '/main/videos',
    image: input.image,
    keywords: [
      'lokswami swipe',
      'hindi news shorts',
      'vertical news video',
      category ? `${category.toLowerCase()} news video` : '',
    ].filter(Boolean),
  });
}

export function buildEpaperPageMetadata(input: EpaperMetadataInput) {
  const publicationType = input.publicationType || 'epaper';
  const labels = getPublicationTypeLabels(publicationType);
  const isMonthly = isMonthlyEPaperPublication(publicationType);
  const titleName = labels.singular;
  const contentName = labels.lowercase;
  const cityName = isMonthly
    ? ''
    : input.issueCityName ||
      EPAPER_CITY_OPTIONS.find((item) => item.slug === input.city)?.name ||
      '';
  const formattedDate = input.publishDate
    ? isMonthly
      ? formatPublicationIssueLabel(input.publishDate, publicationType)
      : formatMetadataDate(input.publishDate)
    : '';
  const query = new URLSearchParams();
  const pageNumber = Number.parseInt(String(input.page ?? input.storyPage ?? ''), 10);
  const storyToken = String(input.storyToken || '').trim();
  const storyTitle = String(input.storyTitle || '').trim();
  const storyExcerpt = String(input.storyExcerpt || '').trim();

  if (input.paperId?.trim()) {
    query.set('paper', input.paperId.trim());
  }
  if (!isMonthly && input.city && input.city !== 'all') {
    query.set('city', input.city);
  }
  if (input.publishDate) {
    if (isMonthly) {
      query.set('month', normalizePublicationIssueMonth(input.publishDate));
    } else {
      query.set('date', input.publishDate);
    }
  }
  if (Number.isFinite(pageNumber) && pageNumber > 0) {
    query.set('page', String(Math.floor(pageNumber)));
  }
  if (storyToken) {
    query.set('story', storyToken);
  }

  let title = `${titleName} Archive and Digital Edition`;
  let description =
    isMonthly
      ? 'Read Lokswami e-magazine monthly issues online with archive filters, mapped features, downloadable issues, and story access.'
      : 'Read the Lokswami e-paper online with archive filters, mapped stories, downloadable daily editions, and city-wise access.';

  if (storyTitle) {
    title = `${storyTitle} | Lokswami ${titleName}`;
    description =
      storyExcerpt ||
      `Read this ${cityName ? `${cityName} ` : ''}Lokswami ${contentName} story${
        Number.isFinite(pageNumber) && pageNumber > 0 ? ` from page ${Math.floor(pageNumber)}` : ''
      }${formattedDate ? ` from ${formattedDate}` : ''}.`;
  } else if (input.issueTitle && cityName && formattedDate) {
    title = buildPublicationIssueTitle(cityName, formattedDate, publicationType);
    description = isMonthly
      ? `Read the ${formattedDate} ${cityName} Lokswami e-magazine issue online with full digital magazine access.`
      : `Read the ${formattedDate} ${cityName} Lokswami e-paper edition online with the full digital newspaper thumbnail and archive access.`;
  } else if (input.issueTitle && isMonthly && formattedDate) {
    title = buildPublicationIssueTitle('', formattedDate, publicationType);
    description = `Read the ${formattedDate} Lokswami e-magazine issue online with full digital magazine access.`;
  } else if (cityName && formattedDate) {
    title = `${cityName} ${titleName} for ${formattedDate}`;
    description = `Read the ${formattedDate} ${cityName} Lokswami ${contentName} ${isMonthly ? 'issue' : 'edition'} online with archive access, mapped stories, and downloadable pages.`;
  } else if (cityName) {
    title = `${cityName} ${titleName} Archive`;
    description = `Browse the Lokswami ${cityName} ${contentName} archive online with ${isMonthly ? 'monthly digital issues' : 'daily digital editions'}, mapped stories, and downloadable PDFs.`;
  } else if (formattedDate) {
    title = `${titleName} for ${formattedDate}`;
    description = `Read the Lokswami ${contentName} for ${formattedDate} online with digital archive access, mapped stories, and downloadable pages.`;
  }

  const basePath = labels.publicBasePath;
  const path = query.size > 0 ? `${basePath}?${query.toString()}` : basePath;

  return buildMetadata({
    title,
    description,
    path,
    image: input.image,
    keywords: [
      isMonthly ? 'lokswami e-magazine' : 'lokswami epaper',
      isMonthly ? 'lokswami e-magazine' : 'hindi epaper',
      'digital newspaper',
      isMonthly ? 'monthly magazine archive' : 'epaper archive',
      storyTitle ? `${contentName} story` : '',
      cityName ? `${cityName.toLowerCase()} ${contentName}` : '',
    ].filter(Boolean),
  });
}

export function buildCategoryPageMetadata(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  const category = resolveNewsCategory(normalizedSlug);
  const displayName = category?.nameEn || slugToTitle(normalizedSlug) || 'News';

  return buildMetadata({
    title: `${displayName} News`,
    description: category
      ? `Read the latest ${category.nameEn.toLowerCase()} news, breaking updates, analysis, and top stories on Lokswami.`
      : `Read the latest news, headlines, and updates from ${displayName} on Lokswami.`,
    path: `/main/category/${encodeURIComponent(normalizedSlug)}`,
    keywords: [
      `${displayName.toLowerCase()} news`,
      'hindi news',
      'lokswami category news',
      normalizedSlug,
    ].filter(Boolean),
    robots: {
      index: Boolean(category),
      follow: true,
      'max-image-preview': 'large',
    },
  });
}
