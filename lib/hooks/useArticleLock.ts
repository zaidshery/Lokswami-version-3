'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeader } from '@/lib/auth/clientToken';

export interface LockHolderInfo {
  userId?: string;
  userName: string;
  userRole: string;
  lockedAt: string;
  expiresAt?: string;
}

export interface UseArticleLockOptions {
  articleId?: string;
  enabled?: boolean;
  onLockStatusChange?: (hasLock: boolean) => void;
}

export interface UseArticleLockReturn {
  hasLock: boolean;
  lockedBy: LockHolderInfo | null;
  isTakingOver: boolean;
  isChecking: boolean;
  takeOver: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  refreshLock: () => Promise<void>;
}

const HEARTBEAT_INTERVAL_MS = 25_000;

export function useArticleLock({
  articleId,
  enabled = true,
  onLockStatusChange,
}: UseArticleLockOptions): UseArticleLockReturn {
  const [hasLock, setHasLock] = useState(false);
  const [lockedBy, setLockedBy] = useState<LockHolderInfo | null>(null);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const onLockStatusChangeRef = useRef(onLockStatusChange);
  onLockStatusChangeRef.current = onLockStatusChange;

  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasLockRef = useRef(false);
  hasLockRef.current = hasLock;

  const acquireOrHeartbeat = useCallback(
    async (action: 'acquire' | 'heartbeat' = 'heartbeat') => {
      if (!articleId || !enabled) return;

      setIsChecking(true);
      try {
        const response = await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}/lock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({ action }),
        });

        if (response.ok) {
          const payload = await response.json();
          if (payload.hasLock) {
            setHasLock(true);
            setLockedBy(null);
            onLockStatusChangeRef.current?.(true);
            return;
          }
        }

        if (response.status === 423) {
          const payload = await response.json();
          setHasLock(false);
          setLockedBy(payload.holder || null);
          onLockStatusChangeRef.current?.(false);
          return;
        }

        // Other status codes (e.g. 401/500)
        if (!response.ok) {
          console.warn(`Article lock request returned status ${response.status}`);
        }
      } catch (error) {
        console.warn('Failed to ping article lock heartbeat:', error);
      } finally {
        setIsChecking(false);
      }
    },
    [articleId, enabled]
  );

  const takeOver = useCallback(async (): Promise<boolean> => {
    if (!articleId) return false;

    setIsTakingOver(true);
    try {
      const response = await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ action: 'take_over' }),
      });

      if (response.ok) {
        setHasLock(true);
        setLockedBy(null);
        onLockStatusChangeRef.current?.(true);
        return true;
      }

      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || 'Take-over failed.');
    } catch (error) {
      console.warn('Take over lock failed:', error);
      return false;
    } finally {
      setIsTakingOver(false);
    }
  }, [articleId]);

  const releaseLock = useCallback(async () => {
    if (!articleId) return;

    try {
      await fetch(`/api/admin/articles/${encodeURIComponent(articleId)}/lock`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeader(),
        },
      });
      setHasLock(false);
      onLockStatusChangeRef.current?.(false);
    } catch (error) {
      console.warn('Failed to release article lock:', error);
    }
  }, [articleId]);

  const refreshLock = useCallback(async () => {
    await acquireOrHeartbeat('heartbeat');
  }, [acquireOrHeartbeat]);

  // Heartbeat loop management with Visibility API
  useEffect(() => {
    if (!articleId || !enabled) {
      setHasLock(false);
      setLockedBy(null);
      return;
    }

    // 1. Initial acquire
    void acquireOrHeartbeat('acquire');

    // 2. Set up interval
    const startHeartbeat = () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') {
          void acquireOrHeartbeat('heartbeat');
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const stopHeartbeat = () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };

    startHeartbeat();

    // 3. Pause when hidden, re-check immediately when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acquireOrHeartbeat('heartbeat');
        startHeartbeat();
      } else {
        stopHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Send beacon on beforeunload to release immediately
    const handleBeforeUnload = () => {
      if (hasLockRef.current && articleId) {
        const url = `/api/admin/articles/${encodeURIComponent(articleId)}/lock`;
        const blob = new Blob([JSON.stringify({ action: 'release' })], {
          type: 'application/json',
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, blob);
        } else {
          void fetch(url, {
            method: 'DELETE',
            headers: getAuthHeader(),
            keepalive: true,
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // Release lock on unmount
      if (hasLockRef.current && articleId) {
        void fetch(`/api/admin/articles/${encodeURIComponent(articleId)}/lock`, {
          method: 'DELETE',
          headers: getAuthHeader(),
          keepalive: true,
        });
      }
    };
  }, [articleId, enabled, acquireOrHeartbeat]);

  return {
    hasLock,
    lockedBy,
    isTakingOver,
    isChecking,
    takeOver,
    releaseLock,
    refreshLock,
  };
}

export default useArticleLock;
