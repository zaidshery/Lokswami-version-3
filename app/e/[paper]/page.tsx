import type { Metadata } from 'next';
import Link from 'next/link';
import { COMPANY_INFO } from '@/lib/constants/company';
import {
  getPublicEpaperForMetadata,
  getPublicEpaperStoryForMetadata,
} from '@/lib/server/publicEpaperMetadata';
import { buildEpaperPageMetadata } from '@/lib/seo/readerPageMetadata';
import ShortEpaperRedirectClient from './ShortEpaperRedirectClient';

type PageContext = {
  params: Promise<{ paper: string }>;
  searchParams?: Promise<{ p?: string; s?: string; page?: string; story?: string }>;
};

function decodeToken(value: string) {
  try {
    return decodeURIComponent(value || '').trim();
  } catch {
    return '';
  }
}

export async function generateMetadata(context: PageContext): Promise<Metadata> {
  const { paper } = await context.params;
  const search = context.searchParams ? await context.searchParams : {};
  const paperId = decodeToken(paper);
  const page = Number.parseInt(String(search.p || search.page || ''), 10);
  const storyToken = decodeToken(String(search.s || search.story || ''));

  const issue = paperId
    ? await getPublicEpaperForMetadata({ id: paperId, publicationType: 'epaper' })
    : null;
  const story =
    storyToken && (issue?.id || paperId)
      ? await getPublicEpaperStoryForMetadata({
          epaperId: issue?.id || paperId,
          storyToken,
          publicationType: 'epaper',
        })
      : null;

  const resolvedPage = page || story?.pageNumber || 1;
  const previewQuery = new URLSearchParams({
    paper: issue?.id || paperId,
    publicationType: 'epaper',
    brand: '1',
  });
  if (story) {
    previewQuery.set('story', story.id);
    previewQuery.set('v', String(story.releaseVersion || 1));
  }
  const shareImage = issue ? `/api/og/epaper?${previewQuery}` : '';

  return buildEpaperPageMetadata({
    publicationType: 'epaper',
    city: issue?.citySlug || '',
    publishDate: issue?.publishDate || '',
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

export function resolveShortEpaperTargetPath(input: {
  paperId?: string;
  page?: number | string | null;
  story?: string | null;
}) {
  const paperId = decodeToken(input.paperId || '');
  const page = Number.parseInt(String(input.page || ''), 10);
  const story = decodeToken(String(input.story || ''));

  const query = new URLSearchParams();
  if (paperId) query.set('paper', paperId);
  if (Number.isFinite(page) && page > 0) query.set('page', String(page));
  if (story) query.set('story', story);

  return query.size > 0 ? `/main/epaper?${query.toString()}` : '/main/epaper';
}

export default async function ShortEpaperSharePage(context: PageContext) {
  const { paper } = await context.params;
  const search = context.searchParams ? await context.searchParams : {};
  const paperId = decodeToken(paper);
  const page = search.p || search.page;
  const story = search.s || search.story;

  const targetPath = resolveShortEpaperTargetPath({ paperId, page, story });

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <ShortEpaperRedirectClient href={targetPath} />
      <meta httpEquiv="refresh" content={`0; url=${targetPath}`} />
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">
          {COMPANY_INFO.name}
        </p>
        <h1 className="mt-3 text-2xl font-black leading-tight">
          {story ? 'Opening Lokswami Story...' : 'Opening Lokswami E-Paper...'}
        </h1>
        <Link
          href={targetPath}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-red-600 px-5 text-sm font-bold text-white transition hover:bg-red-700"
        >
          Open in reader
        </Link>
      </div>
    </main>
  );
}
