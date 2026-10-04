import type { EPaperPublicationType } from '@/lib/types/epaper';
import {
  getPublicationTypeLabels, isMonthlyEPaperPublication,
  normalizePublicationIssueDate, normalizePublicationIssueMonth,
} from './epaperPublication';
import { normalizeCitySlug } from '@/lib/constants/epaperCities';
import { encodePublicPathToken, toAbsolutePublicUrl } from './publicUrl';

// Reuse the existing authorities, including their existing import locations.
export { buildArticlePublicPath, buildArticlePublicUrl } from '@/lib/seo/articleSeo';
export { getNewsCategoryHref } from '@/lib/constants/newsCategories';
export { getSiteUrl, normalizePublicOrigin, toAbsolutePublicUrl } from './publicUrl';

export function buildSwipeReaderPath(slug?: string) {
  const normalizedSlug = encodePublicPathToken(slug);
  return normalizedSlug
    ? `/main/shorts/${normalizedSlug}`
    : '/main/videos';
}

export function buildVideoReaderPath(videoId?: string, swipeSlug?: string) {
  const normalizedSlug = String(swipeSlug || '').trim();
  if (normalizedSlug) return buildSwipeReaderPath(normalizedSlug);
  const normalizedId = encodePublicPathToken(videoId);
  if (!normalizedId) return '/main/videos';

  return `/main/videos?video=${normalizedId}`;
}

export type PublicationReaderLink = {
  publicationType?: EPaperPublicationType;
  paperId?: string;
  city?: string;
  publishDate?: string;
  month?: string;
  page?: number;
  storyToken?: string;
};

/** Existing issue/archive/page/story dimensions; magazines remain monthly/global. */
export function buildPublicationReaderPath(input: PublicationReaderLink = {}) {
  const publicationType = input.publicationType || 'epaper';
  const monthly = isMonthlyEPaperPublication(publicationType);
  const basePath = getPublicationTypeLabels(publicationType).publicBasePath;
  const query = new URLSearchParams();
  if (input.paperId?.trim()) query.set('paper', input.paperId.trim());
  const city = normalizeCitySlug(input.city || '');
  if (!monthly && city) query.set('city', city);
  const issue = monthly
    ? normalizePublicationIssueMonth(input.month || input.publishDate || '')
    : normalizePublicationIssueDate(input.publishDate || '', publicationType);
  if (issue) query.set(monthly ? 'month' : 'date', issue);
  if (typeof input.page === 'number' && Number.isSafeInteger(input.page) && input.page > 0) {
    query.set('page', String(input.page));
  }
  if (input.storyToken?.trim()) query.set('story', input.storyToken.trim());
  return query.size ? `${basePath}?${query.toString()}` : basePath;
}

export function buildEPaperReaderPath(input: Omit<PublicationReaderLink, 'publicationType' | 'month'> = {}) {
  return buildPublicationReaderPath({ ...input, publicationType: 'epaper' });
}

export function buildEMagazineReaderPath(input: Omit<PublicationReaderLink, 'publicationType' | 'city'> = {}) {
  return buildPublicationReaderPath({ ...input, publicationType: 'emagazine' });
}

export function buildPublicationReaderUrl(input: PublicationReaderLink, siteOrigin?: string) {
  return toAbsolutePublicUrl(buildPublicationReaderPath(input), siteOrigin);
}

/** The existing Article Reader, scoped to a released publication story. */
export function buildPublicationArticlePath(input: PublicationReaderLink & { storyToken: string }) {
  const query = new URLSearchParams(buildPublicationReaderPath(input).split('?')[1]);
  if (input.publicationType === 'emagazine') query.set('publicationType', 'emagazine');
  return `/main/article/${encodePublicPathToken(input.storyToken)}?${query.toString()}`;
}
