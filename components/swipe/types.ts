import type { PublicVideoItem } from '@/lib/content/videoPublication';
import type { SwipeArticlePreview } from '@/lib/server/publicVideos';

export type SwipeFeedItem = PublicVideoItem;
export type SwipeArticle = SwipeArticlePreview;

export type SwipeCursor = {
  publishedAt: string;
  id: string;
} | null;

export type SwipeStoryResponse = {
  success?: boolean;
  data?: {
    video?: SwipeFeedItem;
    article?: SwipeArticle | null;
  };
};
