import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SwipeFeed from '@/components/swipe/SwipeFeed';
import type { SwipeCursor, SwipeFeedItem } from '@/components/swipe/types';
import { getPublicSwipeStory } from '@/lib/server/publicVideos';
import { getPublicSwipeFeedPage } from '@/lib/server/publicSwipeFeed';
import { isSwipeBetaEnabled } from '@/lib/content/swipeBeta';
import { buildSwipePageMetadata } from '@/lib/seo/readerPageMetadata';

type PageProps = {
  params: Promise<{ slug: string }>;
};

type FeedResponse = {
  items?: SwipeFeedItem[];
  hasMore?: boolean;
  nextCursor?: SwipeCursor;
};

function decodeSwipeSlug(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function getInitialFeed() {
  try {
    const payload = (await getPublicSwipeFeedPage({ limit: 8 })) as FeedResponse;
    return {
      items: Array.isArray(payload.items) ? payload.items : [],
      hasMore: Boolean(payload.hasMore),
      nextCursor: payload.nextCursor || null,
    };
  } catch {
    return { items: [] as SwipeFeedItem[], hasMore: false, nextCursor: null as SwipeCursor };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!isSwipeBetaEnabled()) return {};
  const { slug: rawSlug } = await params;
  const slug = decodeSwipeSlug(rawSlug);
  const story = await getPublicSwipeStory(slug);
  if (!story) {
    return {
      title: 'Swipe story not found | Lokswami',
      robots: { index: false, follow: false },
    };
  }
  return buildSwipePageMetadata({
    slug: story.video.slug,
    videoId: story.video._id,
    title: story.video.title,
    description: story.video.description,
    category: story.video.category,
    image: story.video.posterUrl || story.video.thumbnail,
  });
}

export default async function SwipeStoryPage({ params }: PageProps) {
  if (!isSwipeBetaEnabled()) notFound();
  const { slug: rawSlug } = await params;
  const slug = decodeSwipeSlug(rawSlug);
  const [story, feed] = await Promise.all([getPublicSwipeStory(slug), getInitialFeed()]);
  if (!story) notFound();

  const items = [
    story.video,
    ...feed.items.filter((item) => item._id !== story.video._id),
  ];

  return (
    <SwipeFeed
      initialItems={items}
      initialArticle={story.article}
      initialHasMore={feed.hasMore}
      initialNextCursor={feed.nextCursor}
    />
  );
}
