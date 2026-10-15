import type {
  SocialAutomationProvider,
  SocialPlatform,
} from '@/lib/content/newsroomPublishing';
import type { WorkflowActorRef } from '@/lib/workflow/types';

export type SocialDeliveryStatus =
  | 'pending'
  | 'dispatching'
  | 'succeeded'
  | 'retryable_failed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export type SocialDeliveryErrorCategory =
  | 'configuration'
  | 'authorization'
  | 'timeout_unknown'
  | 'throttled'
  | 'provider_rejected'
  | 'malformed_response'
  | 'persistence_reconciliation'
  | 'source_ineligible'
  | 'internal';

export type SocialDeliveryError = {
  category: SocialDeliveryErrorCategory;
  message: string;
  timestamp?: string;
};

export type ClaimLease = {
  claimId: string;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  claimant: string;
};

export type SocialDeliveryProviderResponse = {
  executionId?: string;
  executionUrl?: string;
  externalUrl?: string;
  externalPostId?: string;
  rawSummary?: Record<string, unknown>;
};

export type SocialDeliveryPayloadSnapshot = {
  caption: string;
  hashtags: string;
  thumbnailUrl: string;
  videoUrl: string;
  scheduledAt?: string | null;
};

export type SocialDeliveryRecord = {
  _id: string;
  deliveryId: string;
  socialPostId: string;
  contentId: string;
  contentType: 'story' | 'article';
  sourceStoryId: string;
  sourceArticleId?: string;
  sourceRevision?: string | number;
  platform: SocialPlatform;
  providerMode: SocialAutomationProvider | 'mock';
  status: SocialDeliveryStatus;
  payloadSnapshot: SocialDeliveryPayloadSnapshot;
  payloadFingerprint: string;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  claimLease?: ClaimLease;
  providerResponse?: SocialDeliveryProviderResponse;
  lastError?: SocialDeliveryError | null;
  reconciliationRequired: boolean;
  requestedBy?: WorkflowActorRef | null;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SocialDeliveryFilters = {
  socialPostId?: string;
  storyId?: string;
  articleId?: string;
  platform?: SocialPlatform | 'all';
  status?: SocialDeliveryStatus | 'all';
  reconciliationRequired?: boolean;
};
