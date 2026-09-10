import 'server-only';

import { videoService } from '@/lib/server/video/videoService';
import type { CursorPageResult } from '@/lib/utils/cursorPage';
import type { PublicVideoItem } from '@/lib/content/videoPublication';
import type {
  PublicSwipeStory,
  PublicVideoFeedPageOptions,
  SwipeArticlePreview,
} from '@/lib/server/video/videoTypes';

export type { SwipeArticlePreview, PublicSwipeStory, PublicVideoFeedPageOptions };

export async function getPublicSwipeVideoBySlug(slug: string): Promise<PublicVideoItem | null> {
  return videoService.getPublicSwipeVideoBySlug(slug);
}

export async function getPublicSwipeStory(slug: string): Promise<PublicSwipeStory | null> {
  return videoService.getPublicSwipeStory(slug);
}

export async function getPublicVideoFeedPage(
  options: PublicVideoFeedPageOptions = {}
): Promise<CursorPageResult<PublicVideoItem>> {
  return videoService.getPublicVideoFeedPage(options);
}
