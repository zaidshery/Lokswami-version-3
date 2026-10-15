import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo/articleSeo';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/og/'],
        disallow: ['/admin', '/api', '/main/account', '/main/preferences', '/main/saved'],
      },
    ],
    sitemap: [
      `${siteUrl}/sitemap.xml`,
      `${siteUrl}/news-sitemap.xml`,
      `${siteUrl}/video-sitemap.xml`,
    ],
    host: siteUrl,
  };
}

