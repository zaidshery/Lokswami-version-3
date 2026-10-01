import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbListJsonLd,
  buildNewsArticleJsonLd,
  buildOrganizationJsonLd,
  buildVideoObjectJsonLd,
  buildWebSiteJsonLd,
} from '@/lib/seo/articleSeo';
import { GET as getNewsSitemap } from '@/app/news-sitemap.xml/route';
import sitemap from '@/app/sitemap';

describe('SEO Phase 3B - Schema.org JSON-LD Structured Data', () => {
  const sampleArticle = {
    id: 'art-12345',
    slug: 'bhopal-metro-route-expansion-2026',
    title: 'भोपाल मेट्रो का नया रूट मंजूर',
    summary: 'भोपाल में मेट्रो विस्तार के नए चरण को कैबिनेट से मंजूरी मिल गई है।',
    image: 'https://lokswami.com/uploads/bhopal-metro.jpg',
    category: 'Regional',
    author: 'संजय शर्मा',
    publishedAt: '2026-08-14T06:00:00.000Z',
    updatedAt: '2026-08-14T07:30:00.000Z',
    seo: {
      metaTitle: 'भोपाल मेट्रो विस्तार 2026',
      metaDescription: 'भोपाल मेट्रो का नया रूट मंजूर, 15 नए स्टेशन बनेंगे।',
      authorProfileUrl: '/author/sanjay-sharma',
      canonicalUrl: '',
      focusKeyword: 'भोपाल मेट्रो',
      secondaryKeywords: 'भोपाल न्यूज, मेट्रो',
      featuredImageAlt: 'भोपाल मेट्रो का दृश्य',
      featuredImageCaption: 'भोपाल मेट्रो',
      imageCredit: 'लोकस्वामी',
      includeInNewsSitemap: true,
      majorUpdateNote: '',
    },
    siteUrl: 'https://lokswami.com',
  };

  it('builds a valid NewsArticle JSON-LD with Hindi language tag and full metadata', () => {
    const jsonLd = buildNewsArticleJsonLd(sampleArticle);

    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('NewsArticle');
    expect(jsonLd.inLanguage).toBe('hi-IN');
    expect(jsonLd.headline).toBe('भोपाल मेट्रो विस्तार 2026');
    expect(jsonLd.description).toBe('भोपाल मेट्रो का नया रूट मंजूर, 15 नए स्टेशन बनेंगे।');
    expect(jsonLd.articleSection).toBe('Regional');
    expect(jsonLd.datePublished).toBe('2026-08-14T06:00:00.000Z');
    expect(jsonLd.dateModified).toBe('2026-08-14T07:30:00.000Z');
    expect(jsonLd.image).toEqual(['https://lokswami.com/uploads/bhopal-metro.jpg']);
    expect(jsonLd.author).toEqual([
      {
        '@type': 'Person',
        name: 'संजय शर्मा',
        url: 'https://lokswami.com/author/sanjay-sharma',
      },
    ]);
    expect(jsonLd.publisher).toEqual({
      '@type': 'Organization',
      name: 'Lokswami',
      url: 'https://lokswami.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://lokswami.com/logo-app-512.png',
      },
    });
    expect(jsonLd.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://lokswami.com/main/article/bhopal-metro-route-expansion-2026',
    });
  });

  it('builds a valid BreadcrumbList JSON-LD hierarchy for articles', () => {
    const breadcrumb = buildBreadcrumbListJsonLd({
      category: 'regional',
      title: 'भोपाल मेट्रो का नया रूट मंजूर',
      articleUrl: '/main/article/bhopal-metro-route-expansion-2026',
      siteUrl: 'https://lokswami.com',
    });

    expect(breadcrumb['@context']).toBe('https://schema.org');
    expect(breadcrumb['@type']).toBe('BreadcrumbList');
    expect(breadcrumb.itemListElement).toHaveLength(3);
    expect(breadcrumb.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'होम',
      item: 'https://lokswami.com/main',
    });
    expect(breadcrumb.itemListElement[1]).toEqual({
      '@type': 'ListItem',
      position: 2,
      name: 'क्षेत्रीय',
      item: 'https://lokswami.com/main/category/regional',
    });
    expect(breadcrumb.itemListElement[2]).toEqual({
      '@type': 'ListItem',
      position: 3,
      name: 'भोपाल मेट्रो का नया रूट मंजूर',
      item: 'https://lokswami.com/main/article/bhopal-metro-route-expansion-2026',
    });
  });

  it('builds a valid VideoObject JSON-LD', () => {
    const videoLd = buildVideoObjectJsonLd({
      name: 'इंदौर स्वच्छ सर्वेक्षण विशेष रिपोर्ट',
      description: 'इंदौर शहर ने एक बार फिर स्वच्छता में पहला स्थान हासिल किया।',
      thumbnailUrl: '/thumbnails/indore-swachh.jpg',
      uploadDate: '2026-08-14T08:00:00.000Z',
      contentUrl: '/videos/indore-swachh.mp4',
      siteUrl: 'https://lokswami.com',
    });

    expect(videoLd['@context']).toBe('https://schema.org');
    expect(videoLd['@type']).toBe('VideoObject');
    expect(videoLd.name).toBe('इंदौर स्वच्छ सर्वेक्षण विशेष रिपोर्ट');
    expect(videoLd.thumbnailUrl).toBe('https://lokswami.com/thumbnails/indore-swachh.jpg');
    expect(videoLd.contentUrl).toBe('https://lokswami.com/videos/indore-swachh.mp4');
    expect(videoLd.uploadDate).toBe('2026-08-14T08:00:00.000Z');
  });

  it('builds valid WebSite and Organization JSON-LD with search action', () => {
    const websiteLd = buildWebSiteJsonLd('https://lokswami.com');
    expect(websiteLd['@context']).toBe('https://schema.org');
    expect(websiteLd['@type']).toBe('WebSite');
    expect(websiteLd.name).toBe('Lokswami');
    expect(websiteLd.url).toBe('https://lokswami.com');
    expect(websiteLd.potentialAction).toEqual({
      '@type': 'SearchAction',
      target: 'https://lokswami.com/main/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    });

    const orgLd = buildOrganizationJsonLd('https://lokswami.com');
    expect(orgLd['@context']).toBe('https://schema.org');
    expect(orgLd['@type']).toBe('Organization');
    expect(orgLd.name).toBe('Lokswami');
    expect(orgLd.url).toBe('https://lokswami.com');
  });
});

describe('SEO Phase 3B - XML Sitemaps Hardening', () => {
  it('generates a valid news sitemap XML response with Google News namespaces', async () => {
    const response = await getNewsSitemap();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/xml');

    const text = await response.text();
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">'
    );
    expect(text).toContain('</urlset>');
  });

  it('generates standard sitemap entries with canonical paths only', async () => {
    const entries = await sitemap();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);

    const urls = entries.map((entry) => entry.url);
    const uniqueUrls = new Set(urls);
    expect(uniqueUrls.size).toBe(urls.length);

    for (const entry of entries) {
      expect(entry.url).toMatch(/^https?:\/\//);
      expect(entry.url).not.toContain('/admin');
      expect(entry.url).not.toContain('/main/saved');
      expect(entry.url).not.toContain('/main/account');
      expect(entry.lastModified).toBeDefined();
    }
  });
});
