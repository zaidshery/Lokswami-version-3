import { resolveNewsCategory } from '@/lib/constants/newsCategories';
import { detectBreakingTtsLanguage } from '@/lib/types/breaking';

export type ArticleSeoFields = {
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  canonicalUrl: string;
  focusKeyword: string;
  secondaryKeywords: string;
  featuredImageAlt: string;
  featuredImageCaption: string;
  imageCredit: string;
  authorProfileUrl: string;
  authorDisplayName?: string;
  authorDisplayNameSet?: boolean;
  authorAvatarUrl?: string;
  authorProgramName?: string;
  includeInNewsSitemap: boolean;
  majorUpdateNote: string;
};

export type ArticleSeoChecklistItem = {
  label: string;
  done: boolean;
};

export type ArticleSeoAnalysis = {
  score: number;
  items: ArticleSeoChecklistItem[];
  missingInlineImageAltCount: number;
};

export type ArticlePublicRef = {
  id: string;
  slug?: string;
};

export type ArticleCanonicalEdit =
  | { kind: 'omitted' }
  | { kind: 'invalid' }
  | { kind: 'value'; value: string };

const FALLBACK_SITE_URL = 'https://lokswami.com';
const ARTICLE_SLUG_PATTERN = /^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*$/u;
const INTERNAL_ARTICLE_QUERY_KEYS = new Set([
  '_rsc',
  'next-router-state-tree',
  '__nextDefaultLocale',
  '__nextFallback',
]);

export function defaultArticleSeo(): ArticleSeoFields {
  return {
    metaTitle: '',
    metaDescription: '',
    ogImage: '',
    canonicalUrl: '',
    focusKeyword: '',
    secondaryKeywords: '',
    featuredImageAlt: '',
    featuredImageCaption: '',
    imageCredit: '',
    authorProfileUrl: '',
    authorDisplayName: '',
    authorDisplayNameSet: false,
    authorAvatarUrl: '',
    authorProgramName: '',
    includeInNewsSitemap: true,
    majorUpdateNote: '',
  };
}

export function normalizeArticleSeo(input: unknown): ArticleSeoFields {
  const source = typeof input === 'object' && input ? (input as Record<string, unknown>) : {};
  return {
    metaTitle: typeof source.metaTitle === 'string' ? source.metaTitle.trim() : '',
    metaDescription:
      typeof source.metaDescription === 'string' ? source.metaDescription.trim() : '',
    ogImage: typeof source.ogImage === 'string' ? source.ogImage.trim() : '',
    canonicalUrl: typeof source.canonicalUrl === 'string' ? source.canonicalUrl.trim() : '',
    focusKeyword: typeof source.focusKeyword === 'string' ? source.focusKeyword.trim() : '',
    secondaryKeywords:
      typeof source.secondaryKeywords === 'string' ? source.secondaryKeywords.trim() : '',
    featuredImageAlt:
      typeof source.featuredImageAlt === 'string' ? source.featuredImageAlt.trim() : '',
    featuredImageCaption:
      typeof source.featuredImageCaption === 'string'
        ? source.featuredImageCaption.trim()
        : '',
    imageCredit: typeof source.imageCredit === 'string' ? source.imageCredit.trim() : '',
    authorProfileUrl:
      typeof source.authorProfileUrl === 'string' ? source.authorProfileUrl.trim() : '',
    authorDisplayName:
      typeof source.authorDisplayName === 'string' ? source.authorDisplayName.trim() : '',
    authorDisplayNameSet:
      typeof source.authorDisplayNameSet === 'boolean' ? source.authorDisplayNameSet : false,
    authorAvatarUrl:
      typeof source.authorAvatarUrl === 'string' ? source.authorAvatarUrl.trim() : '',
    authorProgramName:
      typeof source.authorProgramName === 'string' ? source.authorProgramName.trim() : '',
    includeInNewsSitemap:
      typeof source.includeInNewsSitemap === 'boolean'
        ? source.includeInNewsSitemap
        : true,
    majorUpdateNote:
      typeof source.majorUpdateNote === 'string' ? source.majorUpdateNote.trim() : '',
  };
}

export function normalizeArticleSlug(input: string) {
  const normalized = input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return Array.from(normalized).slice(0, 200).join('');
}

export function isValidArticleSlug(input: string) {
  const normalized = input.normalize('NFKC').trim();
  return normalized === normalized.toLowerCase() && ARTICLE_SLUG_PATTERN.test(normalized);
}

export type ParsedArticleRequestToken =
  | { ok: true; decoded: string; normalizedSlug: string | null; objectId: string | null }
  | { ok: false };

/** Parses a public URL token without applying creation-time punctuation replacement. */
export function parseArticleRequestToken(input: string): ParsedArticleRequestToken {
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return { ok: false };
  }

  if (!decoded || decoded !== decoded.trim()) return { ok: false };
  const nfkc = decoded.normalize('NFKC');
  const normalizedSlug = nfkc.toLowerCase();
  const isObjectId = /^[a-f\d]{24}$/i.test(nfkc);

  if (!isObjectId && !ARTICLE_SLUG_PATTERN.test(normalizedSlug)) {
    return { ok: false };
  }

  return {
    ok: true,
    decoded,
    normalizedSlug: ARTICLE_SLUG_PATTERN.test(normalizedSlug) ? normalizedSlug : null,
    objectId: isObjectId ? nfkc : null,
  };
}

export async function resolveUniqueArticleSlug(
  requestedTitleOrSlug: string,
  exists: (candidate: string) => Promise<boolean>
) {
  const base = normalizeArticleSlug(requestedTitleOrSlug) || 'article';
  let candidate = base;
  let suffix = 2;

  while (await exists(candidate)) {
    const suffixText = `-${suffix}`;
    const availableLength = Math.max(1, 200 - Array.from(suffixText).length);
    const prefix = Array.from(base).slice(0, availableLength).join('').replace(/-+$/, '');
    candidate = `${prefix || 'article'}${suffixText}`;
    suffix += 1;
    if (suffix > 1000) break;
  }

  return candidate;
}

export function getSiteUrl(value = process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL) {
  try {
    const url = new URL(value.trim());
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (process.env.NODE_ENV === 'production' && localHost)
    ) return FALLBACK_SITE_URL;
    return url.origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export function toAbsoluteArticleUrl(input: string, siteUrl = getSiteUrl()) {
  if (!input) return '';
  if (/^https?:\/\//i.test(input)) return input;
  return input.startsWith('/') ? `${siteUrl}${input}` : `${siteUrl}/${input}`;
}

export function getArticlePublicToken(article: ArticlePublicRef) {
  const slug = article.slug?.trim() || '';
  return (slug && isValidArticleSlug(slug) ? slug : '') || article.id.trim();
}

export function buildArticlePublicPath(article: ArticlePublicRef) {
  const token = getArticlePublicToken(article);
  return token ? `/main/article/${encodeURIComponent(token)}` : '';
}

export function buildArticlePublicUrl(article: ArticlePublicRef, siteUrl = getSiteUrl()) {
  const path = buildArticlePublicPath(article);
  return path ? toAbsoluteArticleUrl(path, siteUrl) : '';
}

export function buildArticleRedirectPath(
  article: ArticlePublicRef,
  searchParams?: URLSearchParams | Record<string, string | string[] | undefined>
) {
  const path = buildArticlePublicPath(article);
  if (!path || !searchParams) return path;

  const output = new URLSearchParams();
  const entries = searchParams instanceof URLSearchParams
    ? Array.from(searchParams.entries()).map(([key, value]) => [key, [value]] as const)
    : Object.entries(searchParams).map(([key, value]) => [
        key,
        Array.isArray(value) ? value : value === undefined ? [] : [value],
      ] as const);

  for (const [key, values] of entries) {
    if (
      INTERNAL_ARTICLE_QUERY_KEYS.has(key) ||
      key.startsWith('__next') ||
      key.startsWith('_next')
    ) continue;
    for (const value of values) output.append(key, value);
  }

  const query = output.toString();
  return query ? `${path}?${query}` : path;
}

export function resolveArticleCanonicalUrl(
  article: ArticlePublicRef & { canonicalUrl?: string },
  siteUrl = getSiteUrl()
) {
  const authority = buildArticlePublicUrl(article, siteUrl);
  const override = article.canonicalUrl?.trim();
  if (!override) return authority;

  try {
    const parsed = new URL(override);
    const expected = new URL(authority);
    if (
      parsed.protocol === expected.protocol &&
      parsed.host === expected.host &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      parsed.pathname === expected.pathname
    ) {
      return expected.toString();
    }
  } catch {
    // Existing unsafe overrides are excluded from public authority without rewriting data.
  }

  return authority;
}

export function validateArticleCanonicalOverride(
  canonicalUrl: string,
  article: ArticlePublicRef,
  siteUrl = getSiteUrl()
) {
  const value = canonicalUrl.trim();
  if (!value) return null;
  const authority = buildArticlePublicUrl(article, siteUrl);

  try {
    const parsed = new URL(value);
    const expected = new URL(authority);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Canonical URL must use HTTP(S)';
    }
    if (parsed.origin !== expected.origin) {
      return 'Canonical URL must use the public site origin';
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return 'Canonical URL must be a clean, queryless article URL';
    }
    if (parsed.pathname !== expected.pathname) {
      return 'Canonical URL must match this article current public slug';
    }
    return null;
  } catch {
    return 'Canonical URL must be a valid absolute URL';
  }
}

export function readArticleCanonicalEdit(input: unknown): ArticleCanonicalEdit {
  const source = typeof input === 'object' && input
    ? (input as Record<string, unknown>)
    : null;
  if (!source || !Object.prototype.hasOwnProperty.call(source, 'canonicalUrl')) {
    return { kind: 'omitted' };
  }
  if (typeof source.canonicalUrl !== 'string') return { kind: 'invalid' };
  return { kind: 'value', value: source.canonicalUrl.trim() };
}

export function validateEditedArticleCanonicalOverride(
  edit: ArticleCanonicalEdit,
  currentCanonicalUrl: unknown,
  article: ArticlePublicRef,
  siteUrl = getSiteUrl()
) {
  if (edit.kind === 'omitted') return null;
  if (edit.kind === 'invalid') return 'Canonical URL must be a valid absolute URL';

  const current = typeof currentCanonicalUrl === 'string'
    ? currentCanonicalUrl.trim()
    : '';
  if (edit.value === current) return null;
  return validateArticleCanonicalOverride(edit.value, article, siteUrl);
}

export function stripArticleHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFirstParagraphText(html: string) {
  const match = html.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/i);
  return stripArticleHtml(match?.[1] || html).slice(0, 500);
}

function containsKeyword(text: string, keyword: string) {
  if (!keyword.trim()) return false;
  return text.toLowerCase().includes(keyword.trim().toLowerCase());
}

function countMissingInlineImageAlt(html: string) {
  const images = Array.from(html.matchAll(/<img\b([^>]*)>/gi));
  return images.filter((match) => {
    const attrs = match[1] || '';
    const altMatch = attrs.match(/\balt=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const alt = altMatch?.[1] || altMatch?.[2] || altMatch?.[3] || '';
    return !alt.trim();
  }).length;
}

export function analyzeArticleSeo(input: {
  title: string;
  summary: string;
  content: string;
  slug: string;
  seo: Partial<ArticleSeoFields>;
  hasFeaturedImage: boolean;
  hasSourceOrExternalLink?: boolean;
}) {
  const seo = normalizeArticleSeo(input.seo);
  const firstParagraph = getFirstParagraphText(input.content);
  const headingText = stripArticleHtml(
    Array.from(input.content.matchAll(/<h[23](?:\s[^>]*)?>([\s\S]*?)<\/h[23]>/gi))
      .map((match) => match[1] || '')
      .join(' ')
  );
  const keyword = seo.focusKeyword;
  const missingInlineImageAltCount = countMissingInlineImageAlt(input.content);
  const hasInternalArticleLink = /href=["'][^"']*\/main\/article\//i.test(input.content);
  const hasAnyLink = /<a\b/i.test(input.content);
  const hasSeoImage = input.hasFeaturedImage && Boolean(seo.featuredImageAlt.trim());
  const hasSchemaBasics = Boolean(
    input.title.trim() &&
      input.summary.trim() &&
      input.hasFeaturedImage &&
      input.slug.trim() &&
      seo.includeInNewsSitemap !== undefined
  );

  const items: ArticleSeoChecklistItem[] = [
    { label: 'Meta title ready', done: (seo.metaTitle || input.title).trim().length >= 20 },
    {
      label: 'Meta description ready',
      done: (seo.metaDescription || input.summary).trim().length >= 70,
    },
    { label: 'SEO slug ready', done: isValidArticleSlug(input.slug) },
    { label: 'Featured image alt text added', done: hasSeoImage },
    {
      label: 'Focus keyword in title',
      done: Boolean(keyword) && containsKeyword(input.title, keyword),
    },
    {
      label: 'Focus keyword in first paragraph',
      done: Boolean(keyword) && containsKeyword(firstParagraph, keyword),
    },
    {
      label: 'Focus keyword in heading',
      done: Boolean(keyword) && containsKeyword(headingText, keyword),
    },
    { label: 'Internal article link added', done: hasInternalArticleLink },
    {
      label: 'Source or external link added',
      done: Boolean(input.hasSourceOrExternalLink || (hasAnyLink && !hasInternalArticleLink)),
    },
    { label: 'NewsArticle schema complete', done: hasSchemaBasics },
    { label: 'News sitemap eligible', done: seo.includeInNewsSitemap && hasSchemaBasics },
  ];
  const doneCount = items.filter((item) => item.done).length;
  return {
    score: Math.round((doneCount / items.length) * 100),
    items,
    missingInlineImageAltCount,
  } satisfies ArticleSeoAnalysis;
}

export function buildArticleGooglePreview(input: {
  id: string;
  slug: string;
  title: string;
  summary: string;
  image: string;
  seo: Partial<ArticleSeoFields>;
  siteUrl?: string;
}) {
  const seo = normalizeArticleSeo(input.seo);
  const title = seo.metaTitle || input.title || 'Untitled article';
  const description = seo.metaDescription || input.summary || '';
  const url = resolveArticleCanonicalUrl(
    {
      id: input.id || 'article-preview',
      slug: input.slug || undefined,
      canonicalUrl: seo.canonicalUrl,
    },
    getSiteUrl(input.siteUrl)
  );

  return {
    title,
    description,
    url,
    image: seo.ogImage || input.image,
  };
}

export function buildNewsArticleJsonLd(input: {
  id: string;
  slug?: string;
  title: string;
  summary: string;
  image: string;
  category: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  seo: Partial<ArticleSeoFields>;
  siteUrl?: string;
}) {
  const seo = normalizeArticleSeo(input.seo);
  const siteUrl = getSiteUrl(input.siteUrl);
  const articleUrl = resolveArticleCanonicalUrl(
    { id: input.id, slug: input.slug, canonicalUrl: seo.canonicalUrl },
    siteUrl
  );
  const imageUrl = toAbsoluteArticleUrl(input.image || seo.ogImage, siteUrl);
  const author: Record<string, string> = {
    '@type': 'Person',
    name: input.author,
  };
  if (seo.authorProfileUrl) {
    author.url = toAbsoluteArticleUrl(seo.authorProfileUrl, siteUrl);
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    inLanguage: detectBreakingTtsLanguage(`${input.title} ${input.summary}`),
    headline: seo.metaTitle || input.title,
    description: seo.metaDescription || input.summary,
    image: imageUrl ? [imageUrl] : [],
    articleSection: input.category,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt || input.publishedAt,
    author: [author],
    publisher: {
      '@type': 'Organization',
      name: 'Lokswami',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: toAbsoluteArticleUrl('/logo-app-512.png', siteUrl),
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
  };
}

export function buildBreadcrumbListJsonLd(input: {
  category: string;
  title: string;
  articleUrl?: string;
  siteUrl?: string;
}) {
  const siteUrl = getSiteUrl(input.siteUrl);
  const matchedCategory = resolveNewsCategory(input.category);
  const categoryName = matchedCategory ? matchedCategory.name : input.category || 'समाचार';
  const categorySlug = matchedCategory ? matchedCategory.slug : 'general';
  const homeUrl = toAbsoluteArticleUrl('/main', siteUrl);
  const categoryUrl = toAbsoluteArticleUrl(`/main/category/${categorySlug}`, siteUrl);
  const articleCanonicalUrl = input.articleUrl
    ? toAbsoluteArticleUrl(input.articleUrl, siteUrl)
    : '';

  const items: Array<{
    '@type': 'ListItem';
    position: number;
    name: string;
    item: string;
  }> = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'होम',
      item: homeUrl,
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: categoryName,
      item: categoryUrl,
    },
  ];

  if (input.title && articleCanonicalUrl) {
    items.push({
      '@type': 'ListItem',
      position: 3,
      name: input.title,
      item: articleCanonicalUrl,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

export function buildVideoObjectJsonLd(input: {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  contentUrl?: string;
  embedUrl?: string;
  siteUrl?: string;
}) {
  const siteUrl = getSiteUrl(input.siteUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: input.name,
    description: input.description,
    thumbnailUrl: toAbsoluteArticleUrl(input.thumbnailUrl, siteUrl),
    uploadDate: input.uploadDate,
    ...(input.contentUrl ? { contentUrl: toAbsoluteArticleUrl(input.contentUrl, siteUrl) } : {}),
    ...(input.embedUrl ? { embedUrl: toAbsoluteArticleUrl(input.embedUrl, siteUrl) } : {}),
  };
}

export function buildWebSiteJsonLd(siteUrl?: string) {
  const baseUrl = getSiteUrl(siteUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Lokswami',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/main/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildOrganizationJsonLd(siteUrl?: string) {
  const baseUrl = getSiteUrl(siteUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Lokswami',
    url: baseUrl,
    logo: {
      '@type': 'ImageObject',
      url: toAbsoluteArticleUrl('/logo-app-512.png', baseUrl),
    },
  };
}
