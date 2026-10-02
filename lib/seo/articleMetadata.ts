import type { Metadata } from 'next';
import { COMPANY_INFO } from '@/lib/constants/company';
import type { ServerArticle } from '@/lib/content/serverArticles';
import {
  getSiteUrl,
  resolveArticleCanonicalUrl,
  toAbsoluteArticleUrl,
} from '@/lib/seo/articleSeo';

const FALLBACK_SHARE_IMAGE = '/lokswami-share-preview.png';
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

export function normalizeMetadataSiteUrl(value?: string) {
  return getSiteUrl(value);
}

export function buildArticleSocialImagePath(article: Pick<ServerArticle, 'id' | 'slug'>) {
  const token = article.slug?.trim() || article.id.trim();
  return `/api/og/article/${encodeURIComponent(token || 'preview')}`;
}

export function buildArticleSocialImageUrl(
  article: Pick<ServerArticle, 'id' | 'slug'>,
  siteUrl = normalizeMetadataSiteUrl()
) {
  return toAbsoluteArticleUrl(buildArticleSocialImagePath(article), siteUrl);
}

export function buildArticlePageMetadata({
  article,
  siteUrl = normalizeMetadataSiteUrl(),
  index = true,
}: {
  article: ServerArticle | null;
  siteUrl?: string;
  index?: boolean;
}): Metadata {
  if (!article) {
    const fallbackImage = toAbsoluteArticleUrl(FALLBACK_SHARE_IMAGE, siteUrl);

    return {
      title: `Article | ${COMPANY_INFO.name}`,
      description: COMPANY_INFO.tagline.en,
      openGraph: {
        title: `Article | ${COMPANY_INFO.name}`,
        description: COMPANY_INFO.tagline.en,
        type: 'website',
        siteName: COMPANY_INFO.name,
        images: [
          {
            url: fallbackImage,
            width: OG_IMAGE_WIDTH,
            height: OG_IMAGE_HEIGHT,
            alt: COMPANY_INFO.name,
            type: 'image/png',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: `Article | ${COMPANY_INFO.name}`,
        description: COMPANY_INFO.tagline.en,
        images: [fallbackImage],
      },
      robots: { index: false, follow: true },
    };
  }

  const seoTitle = article.seo.metaTitle || article.title;
  const title = `${seoTitle} | ${COMPANY_INFO.name}`;
  const description = article.seo.metaDescription || article.summary;
  const canonical = resolveArticleCanonicalUrl(
    { id: article.id, slug: article.slug, canonicalUrl: article.seo.canonicalUrl },
    siteUrl
  );
  const ogImage = buildArticleSocialImageUrl(article, siteUrl);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
      siteName: COMPANY_INFO.name,
      section: article.category,
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: [article.author],
      images: [
        {
          url: ogImage,
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: article.seo.featuredImageAlt || seoTitle,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: {
      index,
      follow: true,
      'max-image-preview': 'large',
    },
  };
}
