import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import SocialPost from '@/lib/models/SocialPost';
import {
  getStoredSocialPostById,
  listStoredSocialPosts,
  updateStoredSocialPost,
  upsertStoredSocialPostByStoryAndPlatform,
} from '@/lib/storage/socialPostsFile';
import type {
  SocialPlatform,
  SocialPostFilters,
  SocialPostRecord,
  SocialPostStore,
  SocialPostUpdates,
} from './distributionTypes';

type SocialDraftSeed = Omit<SocialPostRecord, '_id' | 'createdAt' | 'updatedAt'>;

export class SocialPostRepository {
  async resolveStore(): Promise<SocialPostStore> {
    if (!process.env.MONGODB_URI) return 'file';
    try {
      await connectDB();
      return 'mongo';
    } catch {
      return 'file';
    }
  }

  async list(filters: SocialPostFilters, store?: SocialPostStore) {
    const effectiveStore = store ?? (await this.resolveStore());
    if (effectiveStore === 'file') return listStoredSocialPosts(filters);

    const query: Record<string, unknown> = {};
    if (filters.storyId) query.sourceStoryId = filters.storyId;
    if (filters.articleId) query.sourceArticleId = filters.articleId;
    if (filters.platform !== 'all') query.platform = filters.platform;
    if (filters.status !== 'all') query.status = filters.status;
    return SocialPost.find(query).sort({ updatedAt: -1, _id: -1 }).lean();
  }

  async getById(id: string, store?: SocialPostStore) {
    const effectiveStore = store ?? (await this.resolveStore());
    if (effectiveStore === 'file') return getStoredSocialPostById(id);
    if (!Types.ObjectId.isValid(id)) return null;
    return SocialPost.findById(id).lean();
  }

  async update(id: string, updates: SocialPostUpdates, store?: SocialPostStore) {
    const effectiveStore = store ?? (await this.resolveStore());
    if (effectiveStore === 'file') return updateStoredSocialPost(id, updates);
    if (!Types.ObjectId.isValid(id)) {
      throw new Error('INVALID_SOCIAL_POST_ID');
    }
    return SocialPost.findByIdAndUpdate(
      id,
      { $set: { ...updates, updatedAt: new Date() } },
      { new: true, runValidators: true }
    ).lean();
  }

  async upsertDrafts(
    seeds: SocialDraftSeed[],
    store: SocialPostStore
  ): Promise<unknown[]> {
    if (store === 'file') {
      return Promise.all(
        seeds.map((seed) =>
          upsertStoredSocialPostByStoryAndPlatform(
            seed.sourceStoryId,
            seed.platform,
            seed
          )
        )
      );
    }

    return Promise.all(
      seeds.map((seed) => this.upsertMongoDraft(seed.sourceStoryId, seed.platform, seed))
    );
  }

  private upsertMongoDraft(
    sourceStoryId: string,
    platform: SocialPlatform,
    seed: SocialDraftSeed
  ) {
    return SocialPost.findOneAndUpdate(
      { sourceStoryId, platform },
      {
        $set: {
          sourceArticleId: seed.sourceArticleId,
          status: seed.status,
          caption: seed.caption,
          hashtags: seed.hashtags,
          thumbnailUrl: seed.thumbnailUrl,
          videoUrl: seed.videoUrl,
          lastError: '',
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
          createdBy: seed.createdBy,
        },
      },
      { upsert: true, new: true, runValidators: true }
    ).lean();
  }
}

export const socialPostRepository = new SocialPostRepository();
