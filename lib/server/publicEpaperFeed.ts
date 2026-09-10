import 'server-only';

import { epaperService } from '@/lib/server/epaper/epaperService';
import type { PublicEpaperFeedInput, PublicEpaperFeedItem } from '@/lib/server/epaper/epaperTypes';
import type { CursorPageResult } from '@/lib/utils/cursorPage';

export type { PublicEpaperFeedItem };

export function listPublicEpaperFeed(
  input: PublicEpaperFeedInput
): Promise<CursorPageResult<PublicEpaperFeedItem>> {
  return epaperService.listPublicEpaperFeed(input);
}
