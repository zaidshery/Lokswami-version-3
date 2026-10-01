import { getSiteUrl } from '@/lib/seo/articleSeo';

export type BuildArticleWhatsAppShareInput = {
  title: string;
  articleUrl: string;
  summary?: string;
  category?: string;
  sourceLabel?: string;
  ctaLabel?: string;
  includeUrl?: boolean;
};

export type BuildEpaperIssueShareInput = {
  title: string;
  issueUrl: string;
  cityLabel?: string;
  dateLabel?: string;
  sourceLabel?: string;
  ctaLabel?: string;
  includeUrl?: boolean;
};

export type BuildEpaperStoryShareInput = {
  title: string;
  storyUrl: string;
  paperTitle?: string;
  excerpt?: string;
  page?: number;
  sourceLabel?: string;
  ctaLabel?: string;
  includeUrl?: boolean;
};

export type BuildEpaperSharePathInput = {
  paperId?: string;
  page?: number;
  story?: string;
};

export type BuildArticleSharePathInput = {
  id?: string;
  slug?: string;
};

function cleanUrl(value: string) {
  return value.trim();
}

function cleanShareLine(value?: string | null) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncateShareLine(value: string, maxLength: number) {
  const normalized = cleanShareLine(value);
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, Math.max(0, maxLength - 3));
  return `${clipped.replace(/\s+\S*$/, '').trim() || clipped.trim()}...`;
}

function pushShareLine(lines: string[], value?: string | null) {
  const normalized = cleanShareLine(value);
  if (normalized) lines.push(normalized);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function isLocalOrigin(value: string) {
  try {
    const url = new URL(value);
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1'
    );
  } catch {
    return true;
  }
}

function getPreferredOrigin(origin: string) {
  const runtimeOrigin = trimTrailingSlash(cleanUrl(origin));
  const configured = trimTrailingSlash(cleanUrl(process.env.NEXT_PUBLIC_SITE_URL || ''));

  if (configured && !isLocalOrigin(configured)) return getSiteUrl(configured);
  return getSiteUrl(runtimeOrigin);
}

export function toAbsoluteShareUrl(value: string, origin: string) {
  const trimmed = cleanUrl(value);
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const baseOrigin = getPreferredOrigin(origin);
  return `${baseOrigin}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export function buildArticleWhatsAppShareText({
  title,
  articleUrl,
  summary,
  category,
  sourceLabel = 'Lokswami',
  ctaLabel = 'Read full story',
  includeUrl = true,
}: BuildArticleWhatsAppShareInput) {
  const lines: string[] = [];
  const cleanTitle = truncateShareLine(title, 170);
  const cleanSummary = truncateShareLine(summary || '', 220);
  const cleanArticleUrl = cleanUrl(articleUrl);
  const cleanCategory = cleanShareLine(category);
  const source = cleanShareLine(sourceLabel) || 'Lokswami';

  lines.push(cleanCategory ? `${source} | ${cleanCategory}` : `${source} | Top Story`);
  pushShareLine(lines, cleanTitle);
  pushShareLine(lines, cleanSummary);
  if (includeUrl && cleanArticleUrl) {
    lines.push(`${cleanShareLine(ctaLabel) || 'Read full story'}: ${cleanArticleUrl}`);
  }

  return lines.join('\n').trim();
}

export function buildArticleWhatsAppShareUrl(input: BuildArticleWhatsAppShareInput) {
  const text = buildArticleWhatsAppShareText(input);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildArticleSharePath({ id, slug }: BuildArticleSharePathInput) {
  const token = cleanShareLine(slug) || cleanShareLine(id);
  return token ? `/a/${encodeURIComponent(token)}` : '/main';
}

export function buildEpaperSharePath({ paperId, page, story }: BuildEpaperSharePathInput) {
  const cleanPaperId = cleanShareLine(paperId);
  const pageNumber = Number.parseInt(String(page ?? ''), 10);
  const storyToken = cleanShareLine(story);

  if (!cleanPaperId) return '/main/epaper';

  const params = new URLSearchParams();
  if (Number.isFinite(pageNumber) && pageNumber > 0) {
    params.set('p', String(Math.floor(pageNumber)));
  }
  if (storyToken) params.set('s', storyToken);

  const query = params.toString();
  return query
    ? `/e/${encodeURIComponent(cleanPaperId)}?${query}`
    : `/e/${encodeURIComponent(cleanPaperId)}`;
}

export function buildEpaperIssueShareText({
  title,
  issueUrl,
  cityLabel,
  dateLabel,
  sourceLabel = 'Lokswami E-Paper',
  ctaLabel = 'Open e-paper',
  includeUrl = true,
}: BuildEpaperIssueShareInput) {
  const lines: string[] = [];
  const meta = [cleanShareLine(cityLabel), cleanShareLine(dateLabel)].filter(Boolean).join(' | ');

  lines.push(cleanShareLine(sourceLabel) || 'Lokswami E-Paper');
  pushShareLine(lines, truncateShareLine(title, 160));
  pushShareLine(lines, meta);
  if (includeUrl && issueUrl) {
    lines.push(`${cleanShareLine(ctaLabel) || 'Open e-paper'}: ${cleanUrl(issueUrl)}`);
  }

  return lines.join('\n').trim();
}

export function buildEpaperIssueWhatsAppShareUrl(input: BuildEpaperIssueShareInput) {
  const text = buildEpaperIssueShareText(input);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function buildEpaperStoryShareText({
  title,
  storyUrl,
  paperTitle,
  excerpt,
  page,
  sourceLabel = 'Lokswami E-Paper | Story',
  ctaLabel = 'Read in e-paper',
  includeUrl = true,
}: BuildEpaperStoryShareInput) {
  const lines: string[] = [];
  const pageNumber = Number.parseInt(String(page ?? ''), 10);
  const meta = [
    cleanShareLine(paperTitle),
    Number.isFinite(pageNumber) && pageNumber > 0 ? `Page ${Math.floor(pageNumber)}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  lines.push(cleanShareLine(sourceLabel) || 'Lokswami E-Paper | Story');
  pushShareLine(lines, truncateShareLine(title, 170));
  pushShareLine(lines, meta);
  pushShareLine(lines, truncateShareLine(excerpt || '', 220));
  if (includeUrl && storyUrl) {
    lines.push(`${cleanShareLine(ctaLabel) || 'Read in e-paper'}: ${cleanUrl(storyUrl)}`);
  }

  return lines.join('\n').trim();
}

export function buildEpaperStoryWhatsAppShareUrl(input: BuildEpaperStoryShareInput) {
  const text = buildEpaperStoryShareText(input);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
