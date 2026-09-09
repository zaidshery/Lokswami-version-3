import 'server-only';

import { getPublicArticleBySlug } from '@/lib/server/publicArticles';
import {
  normalizeVideoSlug,
  toPublicVideoItem,
  type PublicVideoItem,
} from '@/lib/content/videoPublication';
import type { CursorPageResult } from '@/lib/utils/cursorPage';
import { videoRepository, VideoRepository } from './videoRepository';
import type {
  PublicSwipeFeedOptions,
  PublicSwipeStory,
  PublicVideoFeedPageOptions,
  SwipeArticlePreview,
  VideoStore,
} from './videoTypes';

export class VideoService {
  constructor(private readonly repo: VideoRepository = videoRepository) {}

  async getPublicVideoFeedPage(
    options: PublicVideoFeedPageOptions = {}
  ): Promise<CursorPageResult<PublicVideoItem>> {
    return this.repo.getPublicVideoFeedPage(options);
  }

  async getPublicSwipeFeedPage(
    options: PublicSwipeFeedOptions = {}
  ): Promise<CursorPageResult<PublicVideoItem>> {
    return this.repo.getPublicSwipeFeedPage(options);
  }

  async getPublicSwipeVideoBySlug(slug: string): Promise<PublicVideoItem | null> {
    const normalizedSlug = normalizeVideoSlug(slug);
    if (!normalizedSlug) return null;

    const candidates = await this.repo.getSwipeCandidates(normalizedSlug);
    for (const candidate of candidates) {
      const item = toPublicVideoItem(candidate, { requireShort: true });
      if (item?.slug === normalizedSlug) return item;
    }

    return null;
  }

  async getArticlePreview(articleId: string): Promise<SwipeArticlePreview | null> {
    if (!articleId) return null;
    try {
      const result = await getPublicArticleBySlug(articleId);
      if (!result) return null;
      const { article } = result;
      return {
        id: article.id,
        slug: article.slug,
        title: article.title,
        summary: article.summary,
        category: article.category,
        author: article.author,
        city: article.city,
        publishedAt: article.publishedAt,
        href: article.href,
      };
    } catch (error) {
      console.error('Failed to resolve published article for Swipe story.', error);
      return null;
    }
  }

  async getPublicSwipeStory(slug: string): Promise<PublicSwipeStory | null> {
    const video = await this.getPublicSwipeVideoBySlug(slug);
    if (!video) return null;
    return {
      video,
      article: await this.getArticlePreview(video.articleId),
    };
  }

  async getHomeFeedVideos(
    limits: { videos: number; shorts: number },
    store?: VideoStore
  ): Promise<{ rawVideos: unknown[]; rawShorts: unknown[] }> {
    return this.repo.getHomeFeedVideos(limits, store);
  }
}

export const videoService = new VideoService();
