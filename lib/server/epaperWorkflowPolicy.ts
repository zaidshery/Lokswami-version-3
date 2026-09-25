import 'server-only';

import EPaper from '@/lib/models/EPaper';
import {
  buildEpaperActivityMessage,
  recordEpaperActivity,
} from '@/lib/server/epaperActivity';
import { logEpaperMetric } from '@/lib/server/epaperObservability';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

import { EpaperConflictError } from '@/lib/server/epaper/epaperTypes';

type Actor = Pick<AdminSessionIdentity, 'id' | 'name' | 'email' | 'role'>;

export function assertEpaperDraftEditable(epaper: {
  status?: unknown;
  productionStatus?: unknown;
}) {
  if (!epaper) {
    throw new EpaperConflictError('EPAPER_IMMUTABLE: Edition is immutable.');
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
}

export async function invalidateEpaperQa(input: {
  epaperId: string;
  actor: Actor;
  reason: string;
  pageNumbers?: number[];
}) {
  const current = await EPaper.findById(input.epaperId)
    .select('_id status productionStatus qaCompletedAt')
    .lean();
  if (!current) return { changed: false, fromStatus: null, toStatus: null };

  assertEpaperDraftEditable(current);
  const fromStatus = String(current.productionStatus || 'draft_upload');
  const shouldReturnToMapping = fromStatus === 'ready_to_publish';
  const shouldClearQa = shouldReturnToMapping || Boolean(current.qaCompletedAt);

  if (!shouldReturnToMapping && !shouldClearQa) {
    return { changed: false, fromStatus, toStatus: fromStatus };
  }

  const toStatus = shouldReturnToMapping ? 'hotspot_mapping' : fromStatus;
  await EPaper.findByIdAndUpdate(input.epaperId, {
    ...(shouldReturnToMapping ? { productionStatus: 'hotspot_mapping' } : {}),
    qaCompletedAt: null,
  });

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
