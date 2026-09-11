import {
  normalizeSocialAutomationProvider,
  normalizeSocialPlatform,
  normalizeSocialPostStatus,
} from '@/lib/content/newsroomPublishing';
import { getSocialDraftContentSources } from '@/lib/server/content/socialDistributionContentQueryService';
import {
  dispatchSocialPostToAutomation,
  getSocialAutomationConfig,
  getSocialAutomationPublicConfig,
} from '@/lib/server/socialAutomation';
import {
  buildSocialDraftSeed,
  canGenerateSocialDrafts,
} from '@/lib/server/socialPostDrafts';
import {
  DistributionServiceError,
  type DistributionActor,
  type SocialPostFilters,
  type SocialPostUpdates,
} from './distributionTypes';
import {
  socialPostRepository,
  type SocialPostRepository,
} from './socialPostRepository';

function normalizeOptionalDateString(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeUpdates(body: unknown): SocialPostUpdates {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  const updates: SocialPostUpdates = {};
  if (typeof source.caption === 'string') updates.caption = source.caption.trim();
  if (typeof source.hashtags === 'string') updates.hashtags = source.hashtags.trim();
  if (typeof source.thumbnailUrl === 'string') updates.thumbnailUrl = source.thumbnailUrl.trim();
  if (typeof source.videoUrl === 'string') updates.videoUrl = source.videoUrl.trim();
  if (typeof source.externalPostId === 'string') updates.externalPostId = source.externalPostId.trim();
  if (typeof source.externalUrl === 'string') updates.externalUrl = source.externalUrl.trim();
  if (typeof source.lastError === 'string') updates.lastError = source.lastError.trim();
  if (source.automationProvider !== undefined) {
    updates.automationProvider = normalizeSocialAutomationProvider(source.automationProvider);
  }
  if (typeof source.automationExecutionId === 'string') {
    updates.automationExecutionId = source.automationExecutionId.trim();
  }
  if (typeof source.automationExecutionUrl === 'string') {
    updates.automationExecutionUrl = source.automationExecutionUrl.trim();
  }
  if (source.platform !== undefined) updates.platform = normalizeSocialPlatform(source.platform);
  if (source.status !== undefined) updates.status = normalizeSocialPostStatus(source.status);
  if (source.automationDispatchedAt !== undefined) {
    updates.automationDispatchedAt = normalizeOptionalDateString(source.automationDispatchedAt);
  }
  if (source.scheduledAt !== undefined) {
    updates.scheduledAt = normalizeOptionalDateString(source.scheduledAt);
  }
  if (source.publishedAt !== undefined) {
    updates.publishedAt = normalizeOptionalDateString(source.publishedAt);
  }
  return updates;
}

function filtersFromUrl(url: URL): SocialPostFilters {
  const platform = url.searchParams.get('platform');
  const status = url.searchParams.get('status');
  return {
    storyId: url.searchParams.get('storyId') || undefined,
    articleId: url.searchParams.get('articleId') || undefined,
    platform: platform && platform !== 'all' ? normalizeSocialPlatform(platform) : 'all',
    status: status && status !== 'all' ? normalizeSocialPostStatus(status) : 'all',
  };
}

function normalizeDispatchPost(value: unknown) {
  const source = typeof value === 'object' && value ? (value as Record<string, unknown>) : null;
  if (!source) return null;
  const sourceStoryId = typeof source.sourceStoryId === 'string' ? source.sourceStoryId.trim() : '';
  const platform = typeof source.platform === 'string' ? source.platform.trim() : '';
  const videoUrl = typeof source.videoUrl === 'string' ? source.videoUrl.trim() : '';
  if (!sourceStoryId || !platform || !videoUrl) return null;

  return {
    _id: typeof source._id === 'string' ? source._id.trim() : String(source._id || '').trim(),
    sourceStoryId,
    sourceArticleId: typeof source.sourceArticleId === 'string' ? source.sourceArticleId.trim() : '',
    platform: platform as 'youtube' | 'facebook' | 'instagram',
    status: typeof source.status === 'string' ? source.status.trim() : 'draft',
    caption: typeof source.caption === 'string' ? source.caption.trim() : '',
    hashtags: typeof source.hashtags === 'string' ? source.hashtags.trim() : '',
    thumbnailUrl: typeof source.thumbnailUrl === 'string' ? source.thumbnailUrl.trim() : '',
    videoUrl,
    scheduledAt: typeof source.scheduledAt === 'string' ? source.scheduledAt : null,
  };
}

export class SocialDistributionService {
  constructor(private readonly repo: SocialPostRepository = socialPostRepository) {}

  async list(url: URL) {
    return {
      data: await this.repo.list(filtersFromUrl(url)),
      automation: getSocialAutomationPublicConfig(),
    };
  }

  async update(id: string, body: unknown) {
    const updates = normalizeUpdates(body);
    if (Object.keys(updates).length === 0) {
      throw new DistributionServiceError('No valid updates provided', 400);
    }
    try {
      const updated = await this.repo.update(id, updates);
      if (!updated) throw new DistributionServiceError('Social post not found', 404);
      return updated;
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_SOCIAL_POST_ID') {
        throw new DistributionServiceError('Invalid social post ID', 400);
      }
      throw error;
    }
  }

  async generateDrafts(storyId: string, actor: DistributionActor) {
    if (!storyId) throw new DistributionServiceError('storyId is required', 400);
    const { store, story, article } = await getSocialDraftContentSources(storyId);
    const articleId = story && typeof story.linkedArticleId === 'string'
      ? story.linkedArticleId.trim()
      : '';
    const normalizedStory = story
      ? {
          _id: typeof story._id === 'string' ? story._id : String(story._id || ''),
          title: typeof story.title === 'string' ? story.title : '',
          category: typeof story.category === 'string' ? story.category : '',
          author: typeof story.author === 'string' ? story.author : '',
          thumbnail: typeof story.thumbnail === 'string' ? story.thumbnail : '',
          linkedArticleId: articleId,
          videoProduction:
            typeof story.videoProduction === 'object' && story.videoProduction
              ? (story.videoProduction as NonNullable<
                  Parameters<typeof canGenerateSocialDrafts>[0]['story']
                >['videoProduction'])
              : undefined,
        }
      : null;
    const normalizedArticle = article
      ? {
          _id: typeof article._id === 'string' ? article._id : String(article._id || ''),
          title: typeof article.title === 'string' ? article.title : '',
          summary: typeof article.summary === 'string' ? article.summary : '',
          sourceStoryId: typeof article.sourceStoryId === 'string' ? article.sourceStoryId : '',
        }
      : null;

    const generationError = canGenerateSocialDrafts({
      story: normalizedStory,
      article: normalizedArticle,
    });
    if (generationError) throw new DistributionServiceError(generationError, 400);

    const seeds = buildSocialDraftSeed({
      story: normalizedStory!,
      article: normalizedArticle!,
      actor,
    });
    return this.repo.upsertDrafts(seeds, store);
  }

  async dispatch(id: string, actor: DistributionActor) {
    const config = getSocialAutomationConfig();
    if (!config.enabled) {
      throw new DistributionServiceError(
        config.provider === 'manual'
          ? 'Automation is currently in manual mode. Configure n8n or a generic webhook first.'
          : 'Automation webhook is not configured.',
        400
      );
    }

    const store = await this.repo.resolveStore();
    const record = normalizeDispatchPost(await this.repo.getById(id, store));
    if (!record) throw new DistributionServiceError('Social post not found', 404);
    if (record.status !== 'approved' && record.status !== 'scheduled' && record.status !== 'failed') {
      throw new DistributionServiceError(
        'Approve or schedule the social post before sending it to automation.',
        400
      );
    }

    try {
      const dispatch = await dispatchSocialPostToAutomation({ post: record, actor });
      const data = await this.repo.update(
        id,
        {
          status: 'publishing',
          lastError: '',
          automationProvider: dispatch.provider,
          automationDispatchedAt: new Date().toISOString(),
          automationExecutionId: dispatch.executionId,
          automationExecutionUrl: dispatch.executionUrl,
          ...(dispatch.externalUrl ? { externalUrl: dispatch.externalUrl } : {}),
        },
        store
      );
      return { data, automation: getSocialAutomationPublicConfig() };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Automation dispatch failed';
      const data = await this.repo.update(
        id,
        {
          status: 'failed',
          lastError: message,
          automationProvider: config.provider,
        },
        store
      );
      throw new DistributionServiceError(message, 502, data);
    }
  }
}

export const socialDistributionService = new SocialDistributionService();
