import type { MetadataRoute } from 'next';

const FALLBACK_SITE_URL = 'https://lokswami.com';

function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL;
  return raw.replace(/\/+$/, '');
}

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

