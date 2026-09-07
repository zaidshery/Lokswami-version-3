import type { Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { buildEpaperPageMetadata } from '@/lib/seo/readerPageMetadata';
import {
  getPublicEpaperForMetadata,
  getPublicEpaperStoryForMetadata,
} from '@/lib/server/publicEpaperMetadata';
import { listPublicEpaperFeed } from '@/lib/server/publicEpaperFeed';
import { parseUiDateInput } from '@/lib/utils/dateFormat';
import {
  parsePublicEpaperFilters,
  parseArchiveMonth,
  resolvePublicEpaperCityFilter,
  type EPaperCityFilter,
} from '@/lib/utils/publicEpaperFilters';
import type { EPaperPublicationType } from '@/lib/types/epaper';
import {
  isMonthlyEPaperPublication,
  normalizePublicationIssueDate,
  normalizePublicationIssueMonth,
} from '@/lib/utils/epaperPublication';
import EPaperPageClient, {
  type PublicCursor,
  type PublicEPaperListItem,
} from './EPaperPageClient';

const EPAPER_LIMIT = 12;

export type EPaperReaderPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseLimit(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return EPAPER_LIMIT;
  return parsed;
}

function toSingleString(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function parsePositiveInt(value: string | string[] | undefined) {
  const parsed = Number.parseInt(toSingleString(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.floor(parsed);
}

function resolveInitialFilters(
  params: Record<string, string | string[] | undefined>,
  publicationType: EPaperPublicationType
) {
  const cityRaw = toSingleString(params.city).trim().toLowerCase();
  const dateRaw = toSingleString(params.date).trim();
  const monthRaw = toSingleString(params.month).trim();
  const isMonthly = isMonthlyEPaperPublication(publicationType);

  const city = isMonthly ? 'all' : resolvePublicEpaperCityFilter(cityRaw);
  const parsedDate = parseUiDateInput(dateRaw);
  const parsedMonth = parseArchiveMonth(monthRaw);
  const date = !isMonthly && typeof parsedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsedDate)
    ? parsedDate
    : '';
  const month = isMonthly
    ? parsedMonth ||
      normalizePublicationIssueMonth(
        typeof parsedDate === 'string' ? parsedDate : dateRaw
      )
    : '';

  return {
    city,
    issueDate: isMonthly ? month : date,
  };
}

export async function generateEPaperMetadata(
  { searchParams }: EPaperReaderPageProps,
  publicationType: EPaperPublicationType = 'epaper'
): Promise<Metadata> {
  const resolvedParams = searchParams ? await searchParams : {};
  const filters = resolveInitialFilters(resolvedParams, publicationType);
  const paperId = toSingleString(resolvedParams.paper).trim();
  const requestedPage = parsePositiveInt(resolvedParams.page);
  const storyToken = toSingleString(resolvedParams.story).trim();
  const shouldResolveIssue = Boolean(paperId || filters.city !== 'all' || filters.issueDate);
  const issue = shouldResolveIssue
    ? await getPublicEpaperForMetadata({
        id: paperId,
        citySlug: filters.city === 'all' ? '' : filters.city,
        publishDate: normalizePublicationIssueDate(filters.issueDate, publicationType),
        publicationType,
      })
    : null;
  const story =
    storyToken && (issue?.id || paperId)
      ? await getPublicEpaperStoryForMetadata({
          epaperId: issue?.id || paperId,
          storyToken,
          publicationType,
        })
      : null;
  const resolvedPage = requestedPage || story?.pageNumber || 0;
  const previewQuery = new URLSearchParams({ paper: issue?.id || paperId, publicationType, brand: '1' });
  if (story) { previewQuery.set('story', story.id); previewQuery.set('v', String(story.releaseVersion || 1)); }
  const shareImage = issue ? `/api/og/epaper?${previewQuery}` : '';

  return buildEpaperPageMetadata({
    publicationType,
    city: issue?.citySlug || filters.city,
    publishDate: issue?.publishDate || normalizePublicationIssueDate(filters.issueDate, publicationType),
    paperId: issue?.id || paperId,
    page: resolvedPage,
    storyToken: story?.slug || storyToken,
    issueTitle: issue?.title,
    issueCityName: issue?.cityName,
    storyTitle: story?.title,
    storyExcerpt: story?.excerpt,
    storyPage: story?.pageNumber,
    image: shareImage,
  });
}

async function listInitialEPapers(
  city: EPaperCityFilter,
  issueDate: string,
  publicationType: EPaperPublicationType = 'epaper'
) {
  const query = new URLSearchParams();
  query.set('publicationType', publicationType);
  if (city !== 'all') {
    query.set('citySlug', city);
  }
  if (issueDate) {
    if (isMonthlyEPaperPublication(publicationType)) {
      query.set('month', normalizePublicationIssueMonth(issueDate));
    } else {
      query.set('date', issueDate);
    }
  }
  const parsed = parsePublicEpaperFilters(query);
  if ('error' in parsed) {
    throw new Error(parsed.error);
  }

  return listPublicEpaperFeed({
    filters: parsed.filters,
    limit: EPAPER_LIMIT,
  });
}

const listCachedDefaultEPapers = unstable_cache(
  () => listInitialEPapers('all', '', 'epaper'),
  ['public-epaper-feed-first-page-v1'],
  { revalidate: 300 }
);

const listCachedDefaultEMagazines = unstable_cache(
  () => listInitialEPapers('all', '', 'emagazine'),
  ['public-emagazine-feed-first-page-v1'],
  { revalidate: 300 }
);

async function fetchInitialEPapers(
  city: EPaperCityFilter,
  issueDate: string,
  publicationType: EPaperPublicationType = 'epaper'
) {
  try {
    const payload =
      city === 'all' && !issueDate
        ? publicationType === 'emagazine'
          ? await listCachedDefaultEMagazines()
          : await listCachedDefaultEPapers()
        : await listInitialEPapers(city, issueDate, publicationType);
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      limit: parseLimit(payload.limit),
      hasMore: Boolean(payload.hasMore),
      nextCursor:
        payload.nextCursor &&
        typeof payload.nextCursor.publishedAt === 'string' &&
        typeof payload.nextCursor.id === 'string'
          ? payload.nextCursor
          : null,
    };
  } catch {
    return {
      items: [] as PublicEPaperListItem[],
      limit: EPAPER_LIMIT,
      hasMore: false,
      nextCursor: null as PublicCursor | null,
    };
  }
}

export async function renderEPaperPage(
  { searchParams }: EPaperReaderPageProps,
  publicationType: EPaperPublicationType = 'epaper'
) {
  const resolvedParams = searchParams ? await searchParams : {};
  const filters = resolveInitialFilters(resolvedParams, publicationType);
  const initial = await fetchInitialEPapers(filters.city, filters.issueDate, publicationType);
  const publicBasePath =
    publicationType === 'emagazine' ? '/main/e-magazine' : '/main/epaper';

  return (
    <EPaperPageClient
      initialItems={initial.items}
      initialLimit={initial.limit}
      initialHasMore={initial.hasMore}
      initialNextCursor={initial.nextCursor}
      initialCity={filters.city}
      initialPublishDate={filters.issueDate}
      publicationType={publicationType}
      publicBasePath={publicBasePath}
    />
  );
}
