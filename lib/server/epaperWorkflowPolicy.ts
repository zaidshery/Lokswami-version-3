import 'server-only';

import EPaper from '@/lib/models/EPaper';
import { PROTECTED_EPAPER_AUTOMATION_IDS } from '@/lib/server/epaperAutomationPolicy';
import {
  buildEpaperActivityMessage,
  recordEpaperActivity,
} from '@/lib/server/epaperActivity';
import { logEpaperMetric } from '@/lib/server/epaperObservability';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

import { EpaperConflictError } from '@/lib/server/epaper/epaperTypes';

type Actor = Pick<AdminSessionIdentity, 'id' | 'name' | 'email' | 'role'>;

export const REVISION_INITIALIZATION_STALE_MS = 10 * 60_000;

export function isRevisionInitializationStale(
  epaper: {
    revisionInitializationStatus?: unknown;
    revisionInitializationStartedAt?: unknown;
    createdAt?: unknown;
  },
  staleThresholdMs = REVISION_INITIALIZATION_STALE_MS,
  now = Date.now()
): boolean {
  if (epaper.revisionInitializationStatus !== 'initializing') {
    return false;
  }
  const startedAt = epaper.revisionInitializationStartedAt instanceof Date
    ? epaper.revisionInitializationStartedAt.getTime()
    : epaper.revisionInitializationStartedAt
      ? new Date(String(epaper.revisionInitializationStartedAt)).getTime()
      : epaper.createdAt instanceof Date
        ? epaper.createdAt.getTime()
        : epaper.createdAt
          ? new Date(String(epaper.createdAt)).getTime()
          : null;
  if (startedAt === null || Number.isNaN(startedAt)) {
    return false;
  }
  return now - startedAt >= staleThresholdMs;
}

export function assertEpaperDraftEditable(epaper: {
  _id?: unknown;
  status?: unknown;
  productionStatus?: unknown;
  revisionInitializationStatus?: unknown;
  revisionInitializationStartedAt?: unknown;
  createdAt?: unknown;
}, options: { allowFailedInitialization?: boolean } = {}) {
  if (!epaper) {
    throw new EpaperConflictError('EPAPER_IMMUTABLE: Edition is immutable.');
  }
  if (PROTECTED_EPAPER_AUTOMATION_IDS.has(String(epaper._id || '').toLowerCase())) {
    throw new EpaperConflictError('This preserved QA edition cannot be mutated.');
  }

  const status = typeof epaper.status === 'string' ? epaper.status.trim().toLowerCase() : '';
  const productionStatus =
    typeof epaper.productionStatus === 'string'
      ? epaper.productionStatus.trim().toLowerCase()
      : '';

  if (status === 'published' || productionStatus === 'published') {
    throw new EpaperConflictError(
      'EPAPER_IMMUTABLE: Published editions are immutable. Create a new revision to make changes.'
    );
  }

  if (status === 'archived' || productionStatus === 'archived') {
    throw new EpaperConflictError('EPAPER_IMMUTABLE: Archived editions are immutable.');
  }
  if (epaper.revisionInitializationStatus === 'initializing') {
    const isStale = isRevisionInitializationStale(epaper);
    if (!isStale || !options.allowFailedInitialization) {
      throw new EpaperConflictError('Revision initialization is in progress. Wait before editing.');
    }
  }
  if (epaper.revisionInitializationStatus === 'failed' && !options.allowFailedInitialization) {
    throw new EpaperConflictError('Revision initialization failed. Delete the failed draft and retry from the published issue.');
  }
}

export async function invalidateEpaperQa(input: {
  epaperId: string;
  actor: Actor;
  reason: string;
  pageNumbers?: number[];
  versionAlreadyIncremented?: boolean;
}) {
  const current = await EPaper.findById(input.epaperId)
    .select('_id status productionStatus revisionInitializationStatus revisionInitializationStartedAt createdAt qaCompletedAt version')
    .lean();
  if (!current) return { changed: false, fromStatus: null, toStatus: null };

  assertEpaperDraftEditable(current);
  const fromStatus = String(current.productionStatus || 'draft_upload');
  const shouldReturnToMapping = fromStatus === 'ready_to_publish';

  const toStatus = shouldReturnToMapping ? 'hotspot_mapping' : fromStatus;
  const setUpdates: Record<string, unknown> = {};
  if (shouldReturnToMapping) {
    setUpdates.productionStatus = 'hotspot_mapping';
    setUpdates.qaCompletedAt = null;
  } else if (current.qaCompletedAt) {
    setUpdates.qaCompletedAt = null;
  }

  const mongoUpdate: Record<string, unknown> = {
    $inc: { version: 1 },
  };
  if (Object.keys(setUpdates).length > 0) {
    mongoUpdate.$set = setUpdates;
  }

  if (!input.versionAlreadyIncremented) {
    const invalidated = await EPaper.findOneAndUpdate({
      _id: input.epaperId,
      status: 'draft',
      productionStatus: current.productionStatus,
      version: current.version == null ? { $exists: false } : current.version,
    }, mongoUpdate, { new: true, runValidators: true });
    if (!invalidated) {
      throw new EpaperConflictError('Edition changed during readiness invalidation. Reload before retrying.');
    }
  }

  await recordEpaperActivity({
    epaperId: input.epaperId,
    actor: input.actor,
    action: 'qa_invalidated',
    fromStatus: fromStatus as never,
    toStatus: toStatus as never,
    message: 'Edition returned to hotspot mapping after content changed.',
    metadata: {
      reason: input.reason,
      pageNumbers: input.pageNumbers || [],
    },
  });
  logEpaperMetric('qa_returned_after_edit', {
    epaperId: input.epaperId,
    fromStatus,
    toStatus,
    pageNumbers: input.pageNumbers || [],
    reason: input.reason,
  });

  return { changed: true, fromStatus, toStatus };
}

export function requireRequestChangesReason(value: unknown) {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (!reason) {
    throw new Error('A reason is required when requesting changes.');
  }
  return reason;
}

export function buildRequestChangesMessage() {
  return buildEpaperActivityMessage({
    action: 'request_changes',
    toStatus: 'hotspot_mapping',
  });
}
