import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type {
  SocialAutomationProvider,
  SocialPlatform,
  SocialPostRecord,
  SocialPostStatus,
} from '@/lib/content/newsroomPublishing';
import type { NewsroomArticleStore } from '@/lib/server/content/newsroomArticleTypes';

export type SocialPostStore = NewsroomArticleStore;
export type { SocialAutomationProvider, SocialPlatform, SocialPostRecord, SocialPostStatus };

export type SocialPostFilters = {
  storyId?: string;
  articleId?: string;
  platform: SocialPlatform | 'all';
  status: SocialPostStatus | 'all';
};

export type SocialPostUpdates = Partial<
  Pick<
    SocialPostRecord,
    | 'caption'
    | 'hashtags'
    | 'thumbnailUrl'
    | 'videoUrl'
    | 'externalPostId'
    | 'externalUrl'
    | 'lastError'
    | 'automationProvider'
    | 'automationExecutionId'
    | 'automationExecutionUrl'
    | 'platform'
    | 'status'
    | 'automationDispatchedAt'
    | 'scheduledAt'
    | 'publishedAt'
  >
>;

export type DistributionActor = Pick<
  AdminSessionIdentity,
  'id' | 'name' | 'email' | 'role'
>;

export class DistributionServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data?: unknown
  ) {
    super(message);
    this.name = 'DistributionServiceError';
  }
}
