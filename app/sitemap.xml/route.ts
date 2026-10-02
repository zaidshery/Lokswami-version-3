import { generateSitemaps } from '@/app/sitemap';
import { getSiteUrl } from '@/lib/seo/articleSeo';

export const dynamic = 'force-dynamic';

/** Discover the existing Next.js sitemap chunks without duplicating their content. */
export async function GET() {
  const siteUrl = getSiteUrl();
  const chunks = await generateSitemaps();
  const sitemaps = chunks.map(({ id }) => {
    const url = `${siteUrl}/sitemap/${id}.xml`;
    const escaped = url.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `  <sitemap><loc>${escaped}</loc></sitemap>`;
  }).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>`,
    { headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    } }
  );
}
