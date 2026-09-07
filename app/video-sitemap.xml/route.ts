import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/seo/articleSeo';
import { getPublicVideoFeedPage } from '@/lib/server/publicVideos';
import { buildVideoReaderPath } from '@/lib/utils/readerContentPaths';

export const dynamic = 'force-dynamic';

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
  const { items: videos } = await getPublicVideoFeedPage({ limit: 1000 });

  const urlNodes = videos
    .map((video) => {
      const pagePath = buildVideoReaderPath(video._id, video.slug);
      const loc = absoluteUrl(siteUrl, pagePath);
      const thumbnailLoc = video.thumbnail.startsWith('http')
        ? video.thumbnail
        : absoluteUrl(siteUrl, video.thumbnail);
      const description = video.description || video.title;

      return [
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
      ].join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${urlNodes}\n</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
