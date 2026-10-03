import type { Metadata } from 'next';
import HomePageClient from './HomePageClient';
import { mapHomeFeedToHomePageState } from '@/lib/content/homeFeed';
import { getPublicHomepageInitialFeed } from '@/lib/server/publicHomeFeed';
import { getHomepageDiscovery } from '@/lib/server/content/homepageDiscoveryService';
import { getSiteUrl } from '@/lib/seo/articleSeo';

const siteUrl = getSiteUrl();
const canonical = `${siteUrl}/main`;

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lokswami - \u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u0935\u093f\u0936\u094d\u0935\u0938\u0928\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e',
  description: '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, \u0935\u0940\u0921\u093f\u092f\u094b, \u0908-\u092a\u0947\u092a\u0930 \u0914\u0930 \u092c\u0939\u0941\u0924 \u0915\u0941\u091b\u0964',
  alternates: {
    canonical,
  },
  openGraph: {
    title: 'Lokswami - \u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u0935\u093f\u0936\u094d\u0935\u0938\u0928\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e',
    description: '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, \u0935\u0940\u0921\u093f\u092f\u094b, \u0908-\u092a\u0947\u092a\u0930 \u0914\u0930 \u092c\u0939\u0941\u0924 \u0915\u0941\u091b\u0964',
    url: canonical,
    type: 'website',
    locale: 'hi_IN',
    siteName: 'Lokswami',
    images: [
      {
        url: `${siteUrl}/lokswami-share-preview.png`,
        width: 1200,
        height: 630,
        alt: 'Lokswami - \u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u0935\u093f\u0936\u094d\u0935\u0938\u0928\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lokswami - \u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u0935\u093f\u0936\u094d\u0935\u0938\u0928\u0940\u092f \u0938\u092e\u093e\u091a\u093e\u0930 \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e',
    description: '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, \u0935\u0940\u0921\u093f\u092f\u094b, \u0908-\u092a\u0947\u092a\u0930 \u0914\u0930 \u092c\u0939\u0941\u0924 \u0915\u0941\u091b\u0964',
    images: [`${siteUrl}/lokswami-share-preview.png`],
  },
};

async function fetchInitialHomeFeed() {
  try {
    const result = await getPublicHomepageInitialFeed();
    return mapHomeFeedToHomePageState(result.feed);
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [initialHomeFeed, initialDiscovery] = await Promise.all([fetchInitialHomeFeed(), getHomepageDiscovery()]);
  return <HomePageClient initialHomeFeed={initialHomeFeed} initialDiscovery={initialDiscovery} />;
}
