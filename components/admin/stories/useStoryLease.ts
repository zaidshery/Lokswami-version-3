'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeader } from '@/lib/auth/clientToken';

export interface StoryLockHolder {
  userId: string;
  name: string;
  email: string;
  role: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface UseStoryLeaseOptions {
  storyId: string;
  enabled?: boolean;
}

export function useStoryLease({ storyId, enabled = true }: UseStoryLeaseOptions) {
  const [hasLease, setHasLease] = useState(false);
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [holder, setHolder] = useState<StoryLockHolder | null>(null);
  const [isAcquiring, setIsAcquiring] = useState(false);
  const [leaseError, setLeaseError] = useState<string | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  const acquire = useCallback(
    async (action: 'acquire' | 'heartbeat' | 'take_over' = 'acquire') => {
      if (!storyId) return false;
      setIsAcquiring(true);
      setLeaseError(null);
      try {
        const res = await fetch(`/api/admin/stories/${encodeURIComponent(storyId)}/lock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          setHasLease(true);
          setIsLockedByOther(false);
          setHolder(null);
          return true;
        } else if (res.status === 409 && data.code === 'STORY_EDIT_LEASE_CONFLICT') {
          setHasLease(false);
          setIsLockedByOther(true);
          setHolder(data.lease || data.holder || null);
          setLeaseError(data.error || 'Story is currently locked by another editor.');
          return false;
        } else {
          setLeaseError(data.error || 'Failed to acquire story lock.');
          return false;
        }
      } catch (err) {
        setLeaseError(err instanceof Error ? err.message : 'Network error acquiring lock.');
        return false;
      } finally {
        setIsAcquiring(false);
      }
    },
    [storyId]
  );

  const release = useCallback(async () => {
    if (!storyId) return;
    try {
      await fetch(`/api/admin/stories/${encodeURIComponent(storyId)}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ action: 'release' }),
      });
    } catch {
      // ignore network errors on release
    } finally {
      setHasLease(false);
    }
  }, [storyId]);

  const takeOver = useCallback(async () => {
    return acquire('take_over');
  }, [acquire]);

  useEffect(() => {
    if (!enabled || !storyId) return;

    let active = true;
    acquire('acquire').then((acquired) => {
      if (!active) return;
      if (acquired) {
        heartbeatTimerRef.current = setInterval(() => {
          acquire('heartbeat');
        }, 25000);
      }
    });

    return () => {
      active = false;
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      release();
    };
  }, [acquire, enabled, release, storyId]);

  return {
    hasLease,
    isLockedByOther,
    holder,
    isAcquiring,
    leaseError,
    acquire,
    release,
    takeOver,
  };
}
