'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthHeader } from '@/lib/auth/clientToken';

export type StoryEditorSaveStatus =
  | 'saved'
  | 'saving'
  | 'unsaved'
  | 'version_conflict'
  | 'lease_conflict'
  | 'autosave_failed'
  | 'recovery_available';

export interface UseStoryAutosaveOptions<T> {
  storyId: string;
  storyVersion: number;
  formData: T;
  hasLease: boolean;
  isLockedByOther: boolean;
  loadedAt: number;
  onVersionAdvanced: (newVersion: number) => void;
  debounceMs?: number;
}

export function useStoryAutosave<T extends Record<string, unknown>>({
  storyId,
  storyVersion,
  formData,
  hasLease,
  isLockedByOther,
  loadedAt,
  onVersionAdvanced,
  debounceMs = 4000,
}: UseStoryAutosaveOptions<T>) {
  const [saveStatus, setSaveStatus] = useState<StoryEditorSaveStatus>('saved');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [recoveredDraft, setRecoveredDraft] = useState<{ timestamp: number; data: T } | null>(null);

  const initialLoadedRef = useRef(false);
  const formDataRef = useRef(formData);
  const versionRef = useRef(storyVersion);
  const savingRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedSignatureRef = useRef<string>('');

  formDataRef.current = formData;
  versionRef.current = storyVersion;

  const storageKey = `story-draft-${storyId}`;

  // Check for local recovery draft on initial load
  useEffect(() => {
    if (!storyId || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.timestamp === 'number' &&
          parsed.timestamp > loadedAt &&
          parsed.data
        ) {
          setRecoveredDraft({ timestamp: parsed.timestamp, data: parsed.data });
          setSaveStatus('recovery_available');
          setStatusMessage('A newer local draft was recovered.');
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [loadedAt, storageKey, storyId]);

  // Persist local draft on form change & schedule debounced server autosave
  useEffect(() => {
    if (!initialLoadedRef.current) {
      initialLoadedRef.current = true;
      lastSavedSignatureRef.current = JSON.stringify(formData);
      return;
    }

    if (conflictRef.current) {
      return;
    }

    const currentSignature = JSON.stringify(formData);
    if (currentSignature === lastSavedSignatureRef.current) {
      return;
    }

    setSaveStatus('unsaved');
    setStatusMessage('Unsaved changes');

    // Save to localStorage for disaster recovery
    if (typeof window !== 'undefined' && storyId) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ timestamp: Date.now(), version: versionRef.current, data: formData })
        );
      } catch {
        // quota exceeded or disabled
      }
    }

    if (!hasLease || isLockedByOther) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveStatus('saving');
      setStatusMessage('Autosaving draft...');

      try {
        const payload = {
          ...formDataRef.current,
          autosave: true,
          expectedVersion: versionRef.current,
        };

        const res = await fetch(`/api/admin/stories/${encodeURIComponent(storyId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          const nextVersion = Number(data.data?.version);
          if (Number.isInteger(nextVersion) && nextVersion > 0) {
            onVersionAdvanced(nextVersion);
          }
          conflictRef.current = false;
          lastSavedSignatureRef.current = JSON.stringify(formDataRef.current);
          setSaveStatus('saved');
          setStatusMessage('All changes autosaved');
          // Clear local storage draft after successful server save
          try {
            localStorage.removeItem(storageKey);
          } catch {}
        } else if (res.status === 409 && data.code === 'STORY_VERSION_CONFLICT') {
          conflictRef.current = true;
          setSaveStatus('version_conflict');
          setStatusMessage('Version conflict: A newer version exists on the server. Please reload.');
        } else if (res.status === 409 && data.code === 'STORY_EDIT_LEASE_CONFLICT') {
          conflictRef.current = true;
          setSaveStatus('lease_conflict');
          setStatusMessage('Lease conflict: Editing is currently locked by another user.');
        } else {
          setSaveStatus('autosave_failed');
          setStatusMessage(data.error || 'Autosave failed. Changes remain in browser.');
        }
      } catch (err) {
        setSaveStatus('autosave_failed');
        setStatusMessage(err instanceof Error ? err.message : 'Network error during autosave');
      } finally {
        savingRef.current = false;
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [debounceMs, formData, hasLease, isLockedByOther, onVersionAdvanced, storageKey, storyId]);

  const discardRecovery = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    conflictRef.current = false;
    setRecoveredDraft(null);
    setSaveStatus('saved');
    setStatusMessage('');
  }, [storageKey]);

  return {
    saveStatus,
    statusMessage,
    recoveredDraft,
    discardRecovery,
    setSaveStatus,
    setStatusMessage,
    clearDraftStorage: () => {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    },
  };
}
