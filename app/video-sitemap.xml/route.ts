import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/seo/articleSeo';
import { getPublicVideoFeedPage } from '@/lib/server/publicVideos';
import { buildVideoReaderPath } from '@/lib/utils/readerContentPaths';

import type { PublicVideoItem } from '@/lib/content/videoPublication';

export const dynamic = 'force-dynamic';

const MAX_SITEMAP_VIDEOS = 10000;
const MAX_SITEMAP_PAGES = 250;
const SITEMAP_PAGE_SIZE = 50;

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absoluteUrl(baseUrl: string, path: string) {
  return path.startsWith('/') ? `${baseUrl}${path}` : `${baseUrl}/${path}`;
}

export async function GET() {
  const siteUrl = getSiteUrl();

  const allVideos: PublicVideoItem[] = [];
  const seenVideoIds = new Set<string>();
  const seenCursors = new Set<string>();

  let cursorPublishedAt: string | null | undefined = null;
  let cursorId: string | null | undefined = null;
  let pageCount = 0;

  while (pageCount < MAX_SITEMAP_PAGES && allVideos.length < MAX_SITEMAP_VIDEOS) {
    pageCount++;
    const page = await getPublicVideoFeedPage({
      limit: SITEMAP_PAGE_SIZE,
      cursorPublishedAt,
      cursorId,
    });

    for (const item of page.items) {
      if (!seenVideoIds.has(item._id)) {
        seenVideoIds.add(item._id);
        allVideos.push(item);
        if (allVideos.length >= MAX_SITEMAP_VIDEOS) break;
      }
    }

    if (!page.hasMore || !page.nextCursor) {
      break;
    }

    const cursorKey = `${page.nextCursor.publishedAt}:${page.nextCursor.id}`;
    if (seenCursors.has(cursorKey)) {
      console.warn('[video-sitemap] Loop detected in cursor pagination at:', cursorKey);
      break;
    }
    seenCursors.add(cursorKey);

    cursorPublishedAt = page.nextCursor.publishedAt;
    cursorId = page.nextCursor.id;
  }

  const seenUrls = new Set<string>();
  const urlNodes: string[] = [];

  for (const video of allVideos) {
    const pagePath = buildVideoReaderPath(
      video._id,
      video.isShort ? video.slug : undefined
    );
    const loc = absoluteUrl(siteUrl, pagePath);
    if (seenUrls.has(loc)) {
      continue;
    }
    seenUrls.add(loc);

    const thumbnailLoc = video.thumbnail.startsWith('http')
      ? video.thumbnail
      : absoluteUrl(siteUrl, video.thumbnail);
    const description = video.description || video.title;

    urlNodes.push(
      [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        '    <video:video>',
        `      <video:thumbnail_loc>${escapeXml(thumbnailLoc)}</video:thumbnail_loc>`,
        `      <video:title>${escapeXml(video.title)}</video:title>`,
        `      <video:description>${escapeXml(description)}</video:description>`,
        ...(video.videoUrl ? [`      <video:content_loc>${escapeXml(video.videoUrl)}</video:content_loc>`] : []),
        `      <video:publication_date>${escapeXml(video.publishedAt)}</video:publication_date>`,
        `      <video:duration>${Math.max(1, Math.floor(video.duration || 60))}</video:duration>`,
        '    </video:video>',
        '  </url>',
      ].join('\n')
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urlNodes.join('\n')}\n</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
