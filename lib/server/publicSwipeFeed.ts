import 'server-only';

import { videoService } from '@/lib/server/video/videoService';
import type { CursorPageResult } from '@/lib/utils/cursorPage';
import type { PublicVideoItem } from '@/lib/content/videoPublication';
import type { PublicSwipeFeedOptions } from '@/lib/server/video/videoTypes';

export type { PublicSwipeFeedOptions };

export async function getPublicSwipeFeedPage(
  options: PublicSwipeFeedOptions = {}
): Promise<CursorPageResult<PublicVideoItem>> {
  return videoService.getPublicSwipeFeedPage(options);
}
