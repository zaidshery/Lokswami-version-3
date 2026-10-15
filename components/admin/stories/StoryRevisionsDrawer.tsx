'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Clock, User, AlertTriangle, Loader2 } from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';

export interface StoryRevisionItem {
  _id: string;
  id?: string;
  version: number;
  savedAt: string;
  savedBy?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  } | null;
  changeReason?: string;
  title: string;
  caption?: string;
}

export interface StoryRevisionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  storyId: string;
  currentVersion: number;
  onRevisionRestored: (newStory: Record<string, unknown>) => void;
}

export function StoryRevisionsDrawer({
  isOpen,
  onClose,
  storyId,
  currentVersion,
  onRevisionRestored,
}: StoryRevisionsDrawerProps) {
  const [revisions, setRevisions] = useState<StoryRevisionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus drawer on open
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !storyId) return;

    let active = true;
    setIsLoading(true);
    setError(null);

    fetch(`/api/admin/stories/${encodeURIComponent(storyId)}/revisions`, {
      headers: { ...getAuthHeader() },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.success && Array.isArray(data.data)) {
          setRevisions(data.data);
        } else {
          setError(data.error || 'Failed to load revisions');
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Network error loading revisions');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, storyId]);

  const handleRestore = async (rev: StoryRevisionItem) => {
    const revId = rev._id || rev.id;
    if (!revId) return;

    const confirmed = window.confirm(
      `Are you sure you want to restore revision v${rev.version}? Your current editor state will be captured as a recoverable revision before restoring. Publication and workflow status will remain unchanged.`
    );
    if (!confirmed) return;

    setRestoringId(revId);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/stories/${encodeURIComponent(storyId)}/revisions/${encodeURIComponent(
          revId
        )}/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({ expectedVersion: currentVersion }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.data) {
        onRevisionRestored(data.data);
        onClose();
      } else if (res.status === 409 && data.code === 'STORY_VERSION_CONFLICT') {
        setError('Version conflict: A newer version exists on the server. Please reload first.');
      } else if (res.status === 409 && data.code === 'STORY_EDIT_LEASE_CONFLICT') {
        setError('Lease conflict: Story is currently locked by another user.');
      } else {
        setError(data.error || 'Failed to restore revision');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error during restore');
    } finally {
      setRestoringId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-revisions-title"
      ref={drawerRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs outline-none"
    >
      <div className="w-full max-w-md h-full bg-neutral-900 border-l border-neutral-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          <div>
            <h2 id="story-revisions-title" className="text-base font-semibold text-neutral-100">
              Revision History
            </h2>
            <p className="text-xs text-neutral-400">
              Current version: v{currentVersion} (Max 30 retained)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close revision history"
            className="p-1 rounded text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="m-4 p-3 rounded bg-rose-950/70 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-400 text-xs gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
              <span>Loading revision snapshots...</span>
            </div>
          )}

          {!isLoading && revisions.length === 0 && (
            <div className="text-center py-12 text-neutral-500 text-xs">
              No revisions recorded yet. Revisions are created upon meaningful saves.
            </div>
          )}

          {!isLoading &&
            revisions.map((rev) => {
              const isRestoring = (rev._id || rev.id) === restoringId;
              const savedDate = new Date(rev.savedAt);
              return (
                <div
                  key={rev._id || rev.id}
                  className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-neutral-800 text-neutral-200">
                      v{rev.version}
                    </span>
                    <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {savedDate.toLocaleDateString()} {savedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-neutral-200 line-clamp-1 mb-1">
                    {rev.title || 'Untitled Story'}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1 border-t border-neutral-900">
                    <span className="flex items-center gap-1 truncate max-w-[180px]">
                      <User className="w-3 h-3 text-neutral-500" />
                      {rev.savedBy?.name || rev.savedBy?.email || 'System'}
                    </span>
                    <button
                      type="button"
                      disabled={isRestoring || (rev._id || rev.id) === restoringId}
                      onClick={() => handleRestore(rev)}
                      aria-label={`Restore revision v${rev.version}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors disabled:opacity-50"
                    >
                      {isRestoring ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3 text-emerald-400" />
                      )}
                      <span>Restore</span>
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
