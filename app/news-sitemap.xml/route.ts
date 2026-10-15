import { NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/seo/articleSeo';
import { sitemapContentQueryService } from '@/lib/server/content/sitemapContentQueryService';

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
  const articles = await sitemapContentQueryService.listNewsArticles(1000);
  const urlNodes = articles
    .map((article) => {
      const loc = absoluteUrl(siteUrl, sitemapContentQueryService.articlePath(article));
      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        '    <news:news>',
        '      <news:publication>',
        '        <news:name>Lokswami</news:name>',
        '        <news:language>hi</news:language>',
        '      </news:publication>',
        `      <news:publication_date>${escapeXml(article.publishedAt)}</news:publication_date>`,
        `      <news:title>${escapeXml(article.title)}</news:title>`,
        '    </news:news>',
        '  </url>',
      ].join('\n');
    })
    .join('\n');

  const xml = urlNodes
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urlNodes}\n</urlset>`
    : `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
