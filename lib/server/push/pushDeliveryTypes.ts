import type { WorkflowActorRef } from '@/lib/workflow/types';

export type PushProviderMode = 'disabled' | 'manual' | 'mock';

export type PushDeliveryStatus =
  | 'prepared'
  | 'pending'
  | 'dispatching'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type PushAudience = {
  type: 'all_subscribers' | 'test_recipients';
  label: string;
  targetCountEstimate?: number;
  filter?: Record<string, unknown>;
};

export type PushProviderStatus = {
  provider: PushProviderMode;
  networkCallsPermitted: boolean;
  ready: boolean;
  description: string;
};

export type PushPayload = {
  title: string;
  body: string;
  deepLink: string;
  imageUrl?: string;
  priority: 'high' | 'normal';
  payloadFingerprint: string;
};

export type PushDeliveryError = {
  category: 'provider_disabled' | 'validation_failed' | 'authorization' | 'internal';
  message: string;
  timestamp?: string;
};

export type PushDeliveryAudit = {
  createdBy: WorkflowActorRef;
  preparedAt: string;
  cancelledBy?: WorkflowActorRef | null;
  cancelledAt?: string | null;
  cancelReason?: string;
};

export type PushDeliveryRecord = {
  _id: string;
  deliveryId: string;
  preparedMessageId?: string;
  sourceStoryId?: string;
  sourceArticleId?: string;
  sourceRevision?: string | number;
  recipient: PushAudience;
  payload: PushPayload;
  status: PushDeliveryStatus;
  provider: PushProviderMode;
  attempts: number;
  maxAttempts: number;
  error?: PushDeliveryError | null;
  audit: PushDeliveryAudit;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PushDeliveryFilters = {
  status?: PushDeliveryStatus | 'all';
  sourceStoryId?: string;
  sourceArticleId?: string;
};

/**
 * Future Reader Device Contract Foundation.
 * Does NOT collect or register real tokens in Phase 3.8.
 */
export type ReaderDevicePlatform = 'web_push' | 'android' | 'ios' | 'unknown';

export type ReaderDeviceSubscription = {
  subscriptionId: string;
  platform: ReaderDevicePlatform;
  // Opaque hash or placeholder only; NEVER store raw tokens/endpoints
  endpointDomain?: string;
  tokenHashPlaceholder?: string;
  consentGiven: boolean;
  consentVersion?: string;
  optedInAt?: string;
  lastVerifiedAt?: string;
  isActive: boolean;
};
