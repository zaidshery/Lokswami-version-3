import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import Video from '@/lib/models/Video';
import { listAllStoredVideos } from '@/lib/storage/videosFile';
import { cursorPage, type CursorPageResult } from '@/lib/utils/cursorPage';
import {
  PUBLIC_VIDEO_PROJECTION,
  isSwipeFeedEligibleVideo,
  toPublicVideoItem,
  type PublicVideoItem,
} from '@/lib/content/videoPublication';

type PublicSwipeFeedOptions = {
  limit?: unknown;
  cursorPublishedAt?: string | null;
  cursorId?: string | null;
};

function asObject(value: unknown) {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function buildMongoFilter(now: Date) {
  return {
    isPublished: true,
    isShort: true,
    $and: [
      { $or: [{ 'workflow.status': 'published' }, { 'workflow.status': { $exists: false } }] },
      {
        $or: [
          { 'workflow.scheduledFor': { $exists: false } },
          { 'workflow.scheduledFor': null },
          { 'workflow.scheduledFor': { $lte: now } },
        ],
      },
      { $or: [{ publishedAt: { $exists: false } }, { publishedAt: { $lte: now } }] },
      { $or: [{ processingStatus: 'ready' }, { processingStatus: { $exists: false } }] },
      { $or: [{ aspectRatio: { $exists: false } }, { aspectRatio: { $ne: '16:9' } }] },
    ],
  };
}

async function fromFileStore(
  options: PublicSwipeFeedOptions,
  now: Date
): Promise<CursorPageResult<PublicVideoItem>> {
  const rows = await listAllStoredVideos();
  return cursorPage<PublicVideoItem>({
    arrayItems: rows.filter((item) => isSwipeFeedEligibleVideo(item, now)),
    limit: options.limit ?? '8',
    dateField: 'createdAt',
    fallbackDateFields: ['publishedAt'],
    cursorPublishedAt: options.cursorPublishedAt,
    cursorId: options.cursorId,
    mapItem: (raw) => toPublicVideoItem(asObject(raw), { requireShort: true, now }),
  });
}

export async function getPublicSwipeFeedPage(
  options: PublicSwipeFeedOptions = {}
): Promise<CursorPageResult<PublicVideoItem>> {
  const now = new Date();
  if (await isMongoAvailable({ label: 'public swipe feed' })) {
    try {
      return await cursorPage<PublicVideoItem>({
        model: Video,
        mongoFilter: buildMongoFilter(now),
        mongoProjection: PUBLIC_VIDEO_PROJECTION,
        limit: options.limit ?? '8',
        dateField: 'createdAt',
        fallbackDateFields: ['publishedAt'],
        cursorPublishedAt: options.cursorPublishedAt,
        cursorId: options.cursorId,
        mapItem: (raw) => toPublicVideoItem(asObject(raw), { requireShort: true, now }),
      });
    } catch (error) {
      console.error('MongoDB public Swipe feed failed; using file store.', error);
    }
  }
  return fromFileStore(options, now);
}
