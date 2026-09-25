import { canDispatchSocialPosts } from '@/lib/auth/permissions';
import { getSocialDraftContentSources } from '@/lib/server/content/socialDistributionContentQueryService';
import type { DistributionActor } from './distributionTypes';
import type { SocialDeliveryPayloadSnapshot } from './socialDeliveryTypes';

export type SourceAuthorizationResult =
  | {
      eligible: true;
      story: Record<string, unknown>;
      article: Record<string, unknown>;
      sourceRevision: string | number;
    }
  | {
      eligible: false;
      reason: string;
      category: 'authorization' | 'source_ineligible';
    };

export class SourceAuthorizationService {
  async validateSourceEligibility(params: {
    sourceStoryId: string;
    actor: DistributionActor;
    payloadSnapshot?: SocialDeliveryPayloadSnapshot;
    expectedRevision?: string | number;
  }): Promise<SourceAuthorizationResult> {
    const { sourceStoryId, actor, payloadSnapshot, expectedRevision } = params;

    // 1. Actor authorization
    if (!actor || !actor.id || !actor.role) {
      return {
        eligible: false,
        reason: 'UNAUTHENTICATED: Actor identity is missing.',
        category: 'authorization',
      };
    }

    if (!canDispatchSocialPosts(actor.role)) {
      return {
        eligible: false,
        reason: 'FORBIDDEN: Actor lacks permissions to dispatch social distribution.',
        category: 'authorization',
      };
    }

    if (!sourceStoryId || !sourceStoryId.trim()) {
      return {
        eligible: false,
        reason: 'SOURCE_STORY_ID_REQUIRED: Missing source story ID.',
        category: 'source_ineligible',
      };
    }

    // 2. Load Story and linked Article
    const { story, article } = await getSocialDraftContentSources(sourceStoryId);

    if (!story) {
      return {
        eligible: false,
        reason: `SOURCE_STORY_NOT_FOUND: Story '${sourceStoryId}' was not found.`,
        category: 'source_ineligible',
      };
    }

    const storyObj = story as Record<string, unknown>;

    // Check Story status / workflow
    const storyWorkflow =
      typeof storyObj.workflow === 'object' && storyObj.workflow
        ? (storyObj.workflow as Record<string, unknown>)
        : {};
    const storyStatus = String(storyWorkflow.status || '').trim().toLowerCase();
    if (['rejected', 'archived', 'trash'].includes(storyStatus)) {
      return {
        eligible: false,
        reason: `SOURCE_STORY_INELIGIBLE: Story workflow status is '${storyStatus}'.`,
        category: 'source_ineligible',
      };
    }

    // Check Story videoProduction
    if (typeof storyObj.videoProduction === 'object' && storyObj.videoProduction) {
      const vp = storyObj.videoProduction as Record<string, unknown>;
      const vpStatus = String(vp.status || '').trim().toLowerCase();
      if (vpStatus === 'failed') {
        return {
          eligible: false,
          reason: 'SOURCE_MEDIA_INELIGIBLE: Story video production marked as failed.',
          category: 'source_ineligible',
        };
      }
    }

    // 3. Article verification
    if (!article) {
      return {
        eligible: false,
        reason: `SOURCE_ARTICLE_NOT_FOUND: No linked article found for story '${sourceStoryId}'.`,
        category: 'source_ineligible',
      };
    }

    const articleObj = article as Record<string, unknown>;

    // Verify Article published state
    const articleStatus = String(articleObj.status || articleObj.publicationStatus || '').trim().toLowerCase();
    if (articleObj.isArchived === true || articleStatus === 'archived' || articleStatus === 'withdrawn') {
      return {
        eligible: false,
        reason: 'SOURCE_ARTICLE_WITHDRAWN: Linked article is archived or withdrawn.',
        category: 'source_ineligible',
      };
    }

    if (articleStatus !== 'published') {
      return {
        eligible: false,
        reason: `SOURCE_ARTICLE_NOT_PUBLISHED: Article status is '${articleStatus}', expected 'published'.`,
        category: 'source_ineligible',
      };
    }

    // Check publication due time (no future embargo leakage)
    const now = new Date();
    const scheduledFor = articleObj.scheduledFor ? new Date(String(articleObj.scheduledFor)) : null;
    const publishedAt = articleObj.publishedAt ? new Date(String(articleObj.publishedAt)) : null;

    if (scheduledFor && !Number.isNaN(scheduledFor.getTime()) && scheduledFor > now) {
      return {
        eligible: false,
        reason: 'SOURCE_ARTICLE_SCHEDULED_FUTURE: Linked article is scheduled for the future and not yet due.',
        category: 'source_ineligible',
      };
    }

    if (publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt > now) {
      return {
        eligible: false,
        reason: 'SOURCE_ARTICLE_EMBARGOED: Linked article publication timestamp is in the future.',
        category: 'source_ineligible',
      };
    }

    // 4. Media verification
    const videoUrl = payloadSnapshot?.videoUrl || String(storyObj.videoUrl || '');
    if (!videoUrl || !videoUrl.trim()) {
      return {
        eligible: false,
        reason: 'SOURCE_MEDIA_MISSING: No video asset or video URL available for social dispatch.',
        category: 'source_ineligible',
      };
    }

    // 5. Revision verification
    const currentRevision = (articleObj.version as number | string) || (articleObj.revision as string) || '1';
    if (expectedRevision && String(expectedRevision) !== String(currentRevision)) {
      return {
        eligible: false,
        reason: `STALE_REVISION: Approved snapshot revision (${expectedRevision}) does not match current source revision (${currentRevision}).`,
        category: 'source_ineligible',
      };
    }

    return {
      eligible: true,
      story: storyObj,
      article: articleObj,
      sourceRevision: currentRevision,
    };
  }
}

export const sourceAuthorizationService = new SourceAuthorizationService();
