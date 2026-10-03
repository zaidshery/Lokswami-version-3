import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY_INFO } from '@/lib/constants/company';
import { getArticleForMetadata, type ServerArticle } from '@/lib/content/serverArticles';
import {
  buildArticlePageMetadata,
  normalizeMetadataSiteUrl,
} from '@/lib/seo/articleMetadata';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import ShortArticleRedirectClient from './ShortArticleRedirectClient';

type PageContext = {
  params: Promise<{ id: string }>;
};

function decodeShareToken(value: string) {
  try {
    return decodeURIComponent(value || '').trim();
  } catch {
    return '';
  }
}

export function resolveShortArticleTargetPath(token: string, article: ServerArticle | null) {
  if (article) {
    return buildArticlePublicPath({ id: article.id, slug: article.slug });
  }

  return buildArticlePublicPath({ id: token }) || '/main';
}

export async function generateMetadata(context: PageContext): Promise<Metadata> {
  const { id } = await context.params;
  const siteUrl = normalizeMetadataSiteUrl();
  const article = id ? await getArticleForMetadata(id) : null;

  return buildArticlePageMetadata({
    article,
    siteUrl,
    index: false,
  });
}

export default async function ShortArticleSharePage(context: PageContext) {
  const { id } = await context.params;
  const token = decodeShareToken(id);
  const article = id ? await getArticleForMetadata(id) : null;
  const targetPath = resolveShortArticleTargetPath(token, article);
  const title = article?.title || COMPANY_INFO.name;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <ShortArticleRedirectClient href={targetPath} />
      <meta httpEquiv="refresh" content={`0; url=${targetPath}`} />
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
          {COMPANY_INFO.name}
        </p>
        <h1 className="mt-3 text-2xl font-black leading-tight">{title}</h1>
        <Link
          href={targetPath}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700"
        >
          Open story
        </Link>
      </div>
    </main>
  );
}
