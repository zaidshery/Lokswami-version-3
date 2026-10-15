import ArticleDetailClient, { type ReaderArticle } from './ArticleDetailClient';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  mapPublicArticleToUiArticle,
  mapPublicArticlesToUiArticles,
} from '@/lib/content/publicArticles';
import {
  getPublicArticleByResolution,
  listRelatedPublicArticles,
  PublicArticleResolutionError,
  resolvePublicArticleToken,
} from '@/lib/server/publicArticles';
import type { PublicArticleResolution } from '@/lib/server/publicArticles';
import { buildArticleRedirectPath } from '@/lib/seo/articleSeo';
import type { Article } from '@/lib/mock/data';
import type { Metadata } from 'next';
import { loadPublicationArticleReader } from '@/lib/server/epaper/epaperArticleReader';

export async function generateMetadata({ params, searchParams }: ArticleDetailPageProps): Promise<Metadata> {
  const query = searchParams ? await searchParams : {};
  if (!query.paper) return {};
  const { id } = await params;
  const data = await loadPublicationArticleReader(id, query);
  if (!data) return { robots: { index: false, follow: false }, title: 'Story unavailable' };
  return { title: data.article.title, description: data.article.summary, alternates: { canonical: data.articlePath }, robots: { index: false, follow: true }, openGraph: { title: data.article.title, description: data.article.summary, url: data.articlePath } };
}

type ArticleDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export type ArticleDetailPageData = {
  article: ReaderArticle | null;
  relatedArticles: ReaderArticle[];
};

function projectReaderArticle(article: Article): ReaderArticle {
  const { seo, ...readerArticle } = article;
  const readerSeo: NonNullable<ReaderArticle['seo']> = {};

  if (seo?.featuredImageAlt !== undefined) {
    readerSeo.featuredImageAlt = seo.featuredImageAlt;
  }
  if (seo?.featuredImageCaption !== undefined) {
    readerSeo.featuredImageCaption = seo.featuredImageCaption;
  }
  if (seo?.imageCredit !== undefined) {
    readerSeo.featuredImageCredit = seo.imageCredit;
  }

  return Object.keys(readerSeo).length
    ? { ...readerArticle, seo: readerSeo }
    : readerArticle;
}

export async function loadArticleDetailPageData(
  token: string
): Promise<ArticleDetailPageData> {
  const resolution = await resolvePublicArticleToken(token);
  if (resolution.kind === 'missing') return { article: null, relatedArticles: [] };
  if (resolution.kind === 'ambiguous' || resolution.kind === 'unavailable') {
    throw new PublicArticleResolutionError(resolution.kind);
  }
  return loadResolvedArticleDetailPageData(resolution);
}

async function loadResolvedArticleDetailPageData(
  resolution: Exclude<PublicArticleResolution, { kind: 'missing' | 'ambiguous' | 'unavailable' }>
): Promise<ArticleDetailPageData> {
  const result = await getPublicArticleByResolution(resolution);
  const mappedArticle = mapPublicArticleToUiArticle(result.article);
  if (!mappedArticle) throw new PublicArticleResolutionError('unavailable');
  const article = {
    ...projectReaderArticle(mappedArticle),
    updatedAt: result.article.updatedAt,
  };

  try {
    const related = await listRelatedPublicArticles(result.article, {
      limit: 20,
      source: result.source,
    });
    return {
      article,
      relatedArticles: mapPublicArticlesToUiArticles(related.items).map(projectReaderArticle),
    };
  } catch {
    return { article, relatedArticles: [] };
  }
}

export default async function ArticleDetailPage({ params, searchParams }: ArticleDetailPageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  if (query.paper) {
    const data = await loadPublicationArticleReader(id, query);
    if (!data) notFound();
    return <ArticleDetailClient article={data.article} relatedArticles={[]} publicationContext={{ returnPath: data.returnPath, articlePath: data.articlePath, issueTitle: data.issueTitle }} />;
  }
  const resolution = await resolvePublicArticleToken(id);
  if (resolution.kind === 'missing') notFound();
  if (resolution.kind === 'ambiguous' || resolution.kind === 'unavailable') {
    throw new PublicArticleResolutionError(resolution.kind);
  }
  if (resolution.kind !== 'current' || !resolution.isExactAuthority) {
    permanentRedirect(
      buildArticleRedirectPath(resolution.article, searchParams ? await searchParams : undefined)
    );
  }
  const data = await loadResolvedArticleDetailPageData(resolution);

  return <ArticleDetailClient key={data.article?.id || id} {...data} />;
}
