import 'server-only';

import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import Video from '@/lib/models/Video';
import User from '@/lib/models/User';
import {
  createStoredVideo,
  deleteStoredVideo,
  getStoredVideoById,
  listAllStoredVideos,
  updateStoredVideo,
  type CreateVideoInput,
} from '@/lib/storage/videosFile';
import { cursorPage, type CursorPageResult } from '@/lib/utils/cursorPage';
import {
  PUBLIC_VIDEO_PROJECTION,
  isPubliclyPublishedVideo,
  isSwipeFeedEligibleVideo,
  toPublicVideoItem,
  type PublicVideoItem,
  type PublicVideoSource,
} from '@/lib/content/videoPublication';
import {
  InvalidVideoIdError,
  MongoAssignmentUnavailableError,
  type AssigneeRef,
  type PublicSwipeFeedOptions,
  type PublicVideoFeedPageOptions,
  type VideoLike,
  type VideoStore,
} from './videoTypes';

const MAX_SWIPE_RESOLUTION_CANDIDATES = 200;

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSwipeMongoFilter(now: Date) {
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

export class VideoRepository {
  async resolveStore(): Promise<VideoStore> {
    if (!process.env.MONGODB_URI) return 'file';
    try {
      await connectDB();
      return 'mongo';
    } catch (error) {
      console.error('MongoDB unavailable for VideoRepository, defaulting to file store.', error);
      return 'file';
    }
  }

  async findById(id: string, store?: VideoStore): Promise<VideoLike | null> {
    const effectiveStore = store || (await this.resolveStore());
    if (effectiveStore === 'mongo') {
      if (!Types.ObjectId.isValid(id)) {
        throw new InvalidVideoIdError('Invalid video ID');
      }
      const found = (await Video.findById(id).lean()) as VideoLike | null;
      return found;
    }

    const found = await getStoredVideoById(id);
    return (found as unknown as VideoLike) || null;
  }

  async create(data: Record<string, unknown>, store: VideoStore): Promise<VideoLike> {
    if (store === 'mongo') {
      const doc = new Video(data);
      const saved = await doc.save();
      return saved.toObject() as VideoLike;
    }

    const stored = await createStoredVideo(data as unknown as CreateVideoInput);
    return stored as unknown as VideoLike;
  }

  async update(
    id: string,
    updates: Record<string, unknown>,
    store: VideoStore
  ): Promise<VideoLike | null> {
    if (store === 'mongo') {
      if (!Types.ObjectId.isValid(id)) {
        throw new InvalidVideoIdError('Invalid video ID');
      }
      const updated = await Video.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      );
      return (updated?.toObject() as VideoLike) || null;
    }

    const updated = await updateStoredVideo(id, updates as unknown as Partial<CreateVideoInput>);
    return (updated as unknown as VideoLike) || null;
  }

  async delete(id: string, store: VideoStore): Promise<boolean> {
    if (store === 'mongo') {
      if (!Types.ObjectId.isValid(id)) {
        throw new InvalidVideoIdError('Invalid video ID');
      }
      const deleted = await Video.findByIdAndDelete(id);
      return Boolean(deleted);
    }

    const deleted = await deleteStoredVideo(id);
    return Boolean(deleted);
  }

  async findRawAdminVideos(
    filter: {
      category?: string | null;
      type?: string | null;
      search?: string;
    },
    store: VideoStore
  ): Promise<VideoLike[]> {
    if (store === 'mongo') {
      const query: Record<string, unknown> = {};
      if (filter.category && filter.category !== 'all') {
        query.category = filter.category;
      }

      if (filter.type === 'shorts') {
        query.isShort = true;
      } else if (filter.type === 'standard') {
        query.isShort = false;
      }

      if (filter.search) {
        const safeSearch = escapeRegex(filter.search);
        query.$or = [
          { title: { $regex: safeSearch, $options: 'i' } },
          { description: { $regex: safeSearch, $options: 'i' } },
        ];
      }

      const rows = (await Video.find(query)
        .sort({ updatedAt: -1, publishedAt: -1, _id: -1 })
        .lean()) as VideoLike[];
      return rows;
    }

    const rows = await listAllStoredVideos();
    return rows as unknown as VideoLike[];
  }

  async resolveAssignee(assignedToId: string, store: VideoStore): Promise<AssigneeRef | null> {
    const normalized = assignedToId.trim();
    if (!normalized) return null;

    if (store === 'file') {
      throw new MongoAssignmentUnavailableError('Assignments require MongoDB-backed users.');
    }

    const query = Types.ObjectId.isValid(normalized)
      ? { _id: normalized }
      : { email: normalized.toLowerCase() };

    const assignee = await User.findOne(query).select('_id name email role').lean();
    if (!assignee || typeof assignee.role !== 'string' || assignee.role === 'reader') {
      return null;
    }

    return {
      id: String(assignee._id || ''),
      name: String(assignee.name || '').trim() || String(assignee.email || '').trim(),
      email: String(assignee.email || '').trim(),
      role: assignee.role as AssigneeRef['role'],
    };
  }

  async getPublicVideoFeedPage(
    options: PublicVideoFeedPageOptions = {}
  ): Promise<CursorPageResult<PublicVideoItem>> {
    const limit = options.limit ?? 20;
    const cursorPublishedAt = options.cursorPublishedAt;
    const cursorId = options.cursorId;

    if (await isMongoAvailable({ label: 'public videos feed page' })) {
      try {
        return await cursorPage<PublicVideoItem>({
          model: Video,
          mongoFilter: { isPublished: true },
          mongoProjection: PUBLIC_VIDEO_PROJECTION,
          limit,
          dateField: 'publishedAt',
          cursorPublishedAt,
          cursorId,
          mapItem: (raw) => toPublicVideoItem(asObject(raw)),
        });
      } catch (error) {
        console.error(
          'Failed to fetch public videos feed page from MongoDB, falling back to file store.',
          error
        );
      }
    }

    const rows = await listAllStoredVideos();
    return cursorPage<PublicVideoItem>({
      arrayItems: rows.filter((item) => isPubliclyPublishedVideo(item)),
      limit,
      dateField: 'publishedAt',
      cursorPublishedAt,
      cursorId,
      mapItem: (raw) => toPublicVideoItem(asObject(raw)),
    });
  }

  async getPublicSwipeFeedPage(
    options: PublicSwipeFeedOptions = {}
  ): Promise<CursorPageResult<PublicVideoItem>> {
    const now = new Date();
    if (await isMongoAvailable({ label: 'public swipe feed' })) {
      try {
        return await cursorPage<PublicVideoItem>({
          model: Video,
          mongoFilter: buildSwipeMongoFilter(now),
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

  async getSwipeCandidates(slug: string): Promise<PublicVideoSource[]> {
    if (await isMongoAvailable({ label: 'public swipe story lookup' })) {
      try {
        const exact = (await Video.findOne({ isPublished: true, isShort: true, slug })
          .select(PUBLIC_VIDEO_PROJECTION)
          .lean()) as PublicVideoSource | null;
        if (exact) return [exact];

        const legacyCandidates = (await Video.find({
          isPublished: true,
          isShort: true,
          $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }],
        })
          .select(PUBLIC_VIDEO_PROJECTION)
          .sort({ publishedAt: -1, _id: -1 })
          .limit(MAX_SWIPE_RESOLUTION_CANDIDATES)
          .lean()) as PublicVideoSource[];
        return legacyCandidates;
      } catch (error) {
        console.error('Failed to resolve public Swipe story from MongoDB.', error);
      }
    }

    const rows = await listAllStoredVideos();
    return rows as unknown as PublicVideoSource[];
  }

  async getHomeFeedVideos(
    limits: { videos: number; shorts: number },
    store?: VideoStore
  ): Promise<{ rawVideos: unknown[]; rawShorts: unknown[] }> {
    const effectiveStore = store || (await this.resolveStore());
    if (effectiveStore === 'mongo') {
      const [rawVideos, rawShorts] = await Promise.all([
        limits.videos > 0
          ? Video.find({ isPublished: true, isShort: { $ne: true } })
              .select(PUBLIC_VIDEO_PROJECTION)
              .sort({ publishedAt: -1, _id: -1 })
              .limit(limits.videos)
              .lean()
          : Promise.resolve([]),
        limits.shorts > 0
          ? Video.find({ isPublished: true, isShort: true })
              .select(PUBLIC_VIDEO_PROJECTION)
              .sort({ createdAt: -1, _id: -1 })
              .limit(limits.shorts)
              .lean()
          : Promise.resolve([]),
      ]);
      return { rawVideos, rawShorts };
    }

    const videoRows = limits.videos > 0 || limits.shorts > 0
      ? await listAllStoredVideos()
      : [];
    return {
      rawVideos: videoRows.filter((item) => item.isPublished !== false && !item.isShort),
      rawShorts: videoRows.filter((item) => item.isPublished !== false && Boolean(item.isShort)),
    };
  }
}

export const videoRepository = new VideoRepository();
