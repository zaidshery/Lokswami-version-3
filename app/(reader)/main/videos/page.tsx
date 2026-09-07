import type { Metadata } from 'next';
import {
  buildVideoPageMetadata,
  buildVideosPageMetadata,
} from '@/lib/seo/readerPageMetadata';
import { getPublicVideoForMetadata } from '@/lib/server/publicVideoMetadata';
import { getPublicVideoFeedPage } from '@/lib/server/publicVideos';
import { isSwipeBetaEnabled } from '@/lib/content/swipeBeta';
import VideosPageClient, {
  type PublicCursor,
  type PublicVideoFeedItem,
} from './VideosPageClient';

const VIDEOS_LIMIT = 20;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function toSingleString(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function mapMetadataVideoToFeedItem(
  video: NonNullable<Awaited<ReturnType<typeof getPublicVideoForMetadata>>>
): PublicVideoFeedItem {
  return {
    _id: video.id,
    title: video.title,
    description: video.description,
    thumbnail: video.thumbnail,
    videoUrl: video.videoUrl,
    duration: video.duration,
    category: video.category,
    isShort: video.isShort,
    isPublished: true,
    shortsRank: 0,
    views: video.views,
    publishedAt: video.publishedAt,
  };
}

async function fetchInitialVideosFeed() {
  try {
    const result = await getPublicVideoFeedPage({ limit: VIDEOS_LIMIT });
    return {
      items: result.items as unknown as PublicVideoFeedItem[],
      limit: result.limit,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    };
  } catch (error) {
    console.error('Failed to load initial videos feed directly:', error);
    return {
      items: [] as PublicVideoFeedItem[],
      limit: VIDEOS_LIMIT,
      hasMore: false,
      nextCursor: null as PublicCursor | null,
    };
  }
}

async function resolveSelectedVideo(searchParams?: Promise<Record<string, string | string[] | undefined>>) {
  const resolvedParams = searchParams ? await searchParams : {};
  const selectedVideoId = toSingleString(resolvedParams.video).trim();
  const selectedVideo = selectedVideoId
    ? await getPublicVideoForMetadata(selectedVideoId)
    : null;

  return {
    selectedVideoId,
    selectedVideo,
  };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { selectedVideo } = await resolveSelectedVideo(searchParams);
  if (!selectedVideo) {
    return buildVideosPageMetadata();
  }

  return buildVideoPageMetadata({
    videoId: selectedVideo.id,
    title: selectedVideo.title,
    description: selectedVideo.description,
    category: selectedVideo.category,
    image: selectedVideo.thumbnail,
  });
}

export default async function VideosPage({ searchParams }: PageProps) {
  const { selectedVideoId, selectedVideo } = await resolveSelectedVideo(searchParams);
  const initial = await fetchInitialVideosFeed();
  const initialItems =
    selectedVideo && !initial.items.some((item) => item._id === selectedVideo.id)
      ? [mapMetadataVideoToFeedItem(selectedVideo), ...initial.items]
      : initial.items;

  const primaryVideo = selectedVideo
    ? mapMetadataVideoToFeedItem(selectedVideo)
    : initialItems[0] || null;

  const videoJsonLd = primaryVideo
    ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: primaryVideo.title,
        description: primaryVideo.description || primaryVideo.title,
        thumbnailUrl: [primaryVideo.thumbnail],
        uploadDate: primaryVideo.publishedAt,
        contentUrl: primaryVideo.videoUrl,
        duration: primaryVideo.duration ? `PT${primaryVideo.duration}S` : undefined,
      }
    : null;

  return (
    <>
      {videoJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }}
        />
      ) : null}
      <VideosPageClient
        initialItems={initialItems}
        initialLimit={initial.limit}
        initialHasMore={initial.hasMore}
        initialNextCursor={initial.nextCursor}
        initialSelectedVideoId={selectedVideo ? selectedVideo.id : selectedVideoId}
        swipeBetaEnabled={isSwipeBetaEnabled()}
      />
    </>
  );
}
