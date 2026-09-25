import { isAdminRole } from '@/lib/auth/roles';
import { canViewPage } from '@/lib/auth/permissions';
import { getSocialDraftContentSources } from '@/lib/server/content/socialDistributionContentQueryService';
import type { WorkflowActorRef } from '@/lib/workflow/types';
import type {
  PushAudience,
  PushPayload,
  PushProviderMode,
} from './pushDeliveryTypes';

export type PushValidationResult =
  | {
      valid: true;
      sanitizedPayload: PushPayload;
      sanitizedRecipient: PushAudience;
      sourceRevision?: string | number;
    }
  | {
      valid: false;
      category: 'authorization' | 'validation_failed' | 'provider_disabled';
      reason: string;
    };

export class PushSafetyService {
  /**
   * Validates actor, payload, deep link, recipient audience, source status, and provider state.
   */
  async validatePushPreparation(params: {
    actor: WorkflowActorRef;
    title: string;
    body: string;
    deepLink: string;
    imageUrl?: string;
    priority?: 'high' | 'normal';
    audienceType?: 'all_subscribers' | 'test_recipients';
    sourceStoryId?: string;
    sourceArticleId?: string;
    provider?: PushProviderMode;
  }): Promise<PushValidationResult> {
    const { actor, title, body, deepLink, imageUrl, priority, audienceType, sourceStoryId } =
      params;

    // 1. Actor RBAC Check
    if (!actor || !actor.id || !actor.role) {
      return {
        valid: false,
        category: 'authorization',
        reason: 'UNAUTHENTICATED: Actor identity is missing.',
      };
    }

    if (!isAdminRole(actor.role) || !canViewPage(actor.role, 'push_alerts')) {
      return {
        valid: false,
        category: 'authorization',
        reason: `FORBIDDEN: Role '${actor.role}' lacks permission to prepare push alerts.`,
      };
    }

    // 2. Payload Validation
    const cleanTitle = (title || '').trim().replace(/[\r\n\t]/g, ' ');
    if (!cleanTitle || cleanTitle.length < 3) {
      return {
        valid: false,
        category: 'validation_failed',
        reason: 'INVALID_TITLE: Alert title must be at least 3 characters.',
      };
    }
    if (cleanTitle.length > 120) {
      return {
        valid: false,
        category: 'validation_failed',
        reason: 'INVALID_TITLE: Alert title exceeds 120 character limit.',
      };
    }

    const cleanBody = (body || '').trim();
    if (!cleanBody || cleanBody.length < 5) {
      return {
        valid: false,
        category: 'validation_failed',
        reason: 'INVALID_BODY: Alert body text must be at least 5 characters.',
      };
    }
    if (cleanBody.length > 250) {
      return {
        valid: false,
        category: 'validation_failed',
        reason: 'INVALID_BODY: Alert body text exceeds 250 character limit.',
      };
    }

    // 3. Deep Link Validation: MUST be relative canonical reader path
    const cleanDeepLink = (deepLink || '').trim();
    if (!cleanDeepLink.startsWith('/')) {
      return {
        valid: false,
        category: 'validation_failed',
        reason: 'INVALID_DEEP_LINK: Deep link must be a relative canonical path starting with "/".',
      };
    }
    if (/^[a-z]+:/i.test(cleanDeepLink) || cleanDeepLink.startsWith('//')) {
      return {
        valid: false,
        category: 'validation_failed',
        reason: 'INVALID_DEEP_LINK: External schemes or protocol-relative URLs are forbidden.',
      };
    }
    if (/[\r\n\t<>"']/.test(cleanDeepLink)) {
      return {
        valid: false,
        category: 'validation_failed',
        reason: 'INVALID_DEEP_LINK: Deep link contains forbidden characters.',
      };
    }

    // 4. Optional Image Validation
    const cleanImageUrl = (imageUrl || '').trim();
    if (cleanImageUrl) {
      if (!cleanImageUrl.startsWith('/') && !cleanImageUrl.startsWith('https://')) {
        return {
          valid: false,
          category: 'validation_failed',
          reason: 'INVALID_IMAGE_URL: Alert image must use HTTPS or relative asset path.',
        };
      }
    }

    // 5. Recipient Audience Validation
    const effectiveAudienceType =
      audienceType === 'test_recipients' ? 'test_recipients' : 'all_subscribers';
    const sanitizedRecipient: PushAudience = {
      type: effectiveAudienceType,
      label:
        effectiveAudienceType === 'test_recipients'
          ? 'Internal Test Recipients (Future Foundation)'
          : 'All Opted-in Readers (Future Foundation)',
      targetCountEstimate: 0,
    };

    // 6. Source Content Revalidation
    let sourceRevision: string | number = '1';
    if (sourceStoryId && sourceStoryId.trim()) {
      const { story, article } = await getSocialDraftContentSources(sourceStoryId);
      if (!story) {
        return {
          valid: false,
          category: 'validation_failed',
          reason: `SOURCE_STORY_NOT_FOUND: Story '${sourceStoryId}' was not found.`,
        };
      }

      if (!article) {
        return {
          valid: false,
          category: 'validation_failed',
          reason: `SOURCE_ARTICLE_NOT_FOUND: Linked article for story '${sourceStoryId}' was not found.`,
        };
      }

      const articleObj = article as Record<string, unknown>;
      const articleStatus = String(articleObj.status || articleObj.publicationStatus || '')
        .trim()
        .toLowerCase();

      if (articleObj.isArchived === true || articleStatus === 'archived' || articleStatus === 'withdrawn') {
        return {
          valid: false,
          category: 'validation_failed',
          reason: 'SOURCE_ARTICLE_WITHDRAWN: Linked article is archived or withdrawn.',
        };
      }

      if (articleStatus !== 'published') {
        return {
          valid: false,
          category: 'validation_failed',
          reason: `SOURCE_ARTICLE_NOT_PUBLISHED: Article status is '${articleStatus}', expected 'published'.`,
        };
      }

      const now = new Date();
      const scheduledFor = articleObj.scheduledFor ? new Date(String(articleObj.scheduledFor)) : null;
      const publishedAt = articleObj.publishedAt ? new Date(String(articleObj.publishedAt)) : null;

      if (scheduledFor && !Number.isNaN(scheduledFor.getTime()) && scheduledFor > now) {
        return {
          valid: false,
          category: 'validation_failed',
          reason: 'SOURCE_ARTICLE_SCHEDULED_FUTURE: Linked article is scheduled for the future.',
        };
      }

      if (publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt > now) {
        return {
          valid: false,
          category: 'validation_failed',
          reason: 'SOURCE_ARTICLE_EMBARGOED: Linked article publication timestamp is in the future.',
        };
      }

      sourceRevision = (articleObj.version as number | string) || (articleObj.revision as string) || '1';
    }

    const fingerprint = `${cleanTitle}:${cleanBody}:${cleanDeepLink}`;

    return {
      valid: true,
      sanitizedPayload: {
        title: cleanTitle,
        body: cleanBody,
        deepLink: cleanDeepLink,
        imageUrl: cleanImageUrl || undefined,
        priority: priority === 'high' ? 'high' : 'normal',
        payloadFingerprint: Buffer.from(fingerprint).toString('base64'),
      },
      sanitizedRecipient,
      sourceRevision,
    };
  }
}

export const pushSafetyService = new PushSafetyService();

/**
 * Validates newsroom actor eligibility to prepare or cancel push alerts.
 */
export function validatePushActor(actor: WorkflowActorRef | null | undefined): {
  allowed: boolean;
  error?: string;
} {
  if (!actor || !actor.id || !actor.role) {
    return { allowed: false, error: 'Unauthorized: Actor identity is missing' };
  }
  if (!isAdminRole(actor.role) || !canViewPage(actor.role, 'push_alerts')) {
    return {
      allowed: false,
      error: `Forbidden: Role '${actor.role}' lacks permission to prepare or manage push alerts.`,
    };
  }
  return { allowed: true };
}

/**
 * Standalone payload validation for length, deep-link syntax, and assets.
 */
export function validatePushPayload(payload: {
  title?: string;
  body?: string;
  deepLink?: string;
  imageUrl?: string;
  priority?: 'high' | 'normal';
}): {
  valid: boolean;
  sanitizedPayload?: PushPayload;
  error?: string;
} {
  const cleanTitle = (payload?.title || '').trim().replace(/[\r\n\t]/g, ' ');
  if (!cleanTitle || cleanTitle.length < 3 || cleanTitle.length > 120) {
    return {
      valid: false,
      error: 'Alert title must be between 3 and 120 characters.',
    };
  }

  const cleanBody = (payload?.body || '').trim();
  if (!cleanBody || cleanBody.length < 5 || cleanBody.length > 250) {
    return {
      valid: false,
      error: 'Alert body must be between 5 and 250 characters.',
    };
  }

  const cleanDeepLink = (payload?.deepLink || '').trim();
  if (!cleanDeepLink.startsWith('/') || /^[a-z]+:/i.test(cleanDeepLink) || cleanDeepLink.startsWith('//') || /[\r\n\t<>"']/.test(cleanDeepLink)) {
    return {
      valid: false,
      error: 'Alert deep link must be a canonical relative reader path starting with "/".',
    };
  }

  const cleanImageUrl = (payload?.imageUrl || '').trim();
  if (cleanImageUrl && !cleanImageUrl.startsWith('/') && !cleanImageUrl.startsWith('https://')) {
    return {
      valid: false,
      error: 'Alert imageUrl must be HTTPS or relative path.',
    };
  }

  const fingerprint = `${cleanTitle}:${cleanBody}:${cleanDeepLink}`;

  return {
    valid: true,
    sanitizedPayload: {
      title: cleanTitle,
      body: cleanBody,
      deepLink: cleanDeepLink,
      imageUrl: cleanImageUrl || undefined,
      priority: payload?.priority === 'high' ? 'high' : 'normal',
      payloadFingerprint: Buffer.from(fingerprint).toString('base64'),
    },
  };
}

/**
 * Validates push recipient audience.
 */
export function validatePushRecipient(recipient: {
  audience?: string;
  testUserIds?: string[];
}): {
  valid: boolean;
  error?: string;
} {
  if (recipient.audience === 'all_subscribers') {
    return { valid: true };
  }
  if (recipient.audience === 'test_recipients') {
    if (!Array.isArray(recipient.testUserIds) || recipient.testUserIds.length === 0) {
      return {
        valid: false,
        error: 'test_recipients audience requires at least one recipient ID.',
      };
    }
    return { valid: true };
  }
  return {
    valid: false,
    error: `Invalid audience '${recipient?.audience}'. Must be 'all_subscribers' or 'test_recipients'.`,
  };
}
