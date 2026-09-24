'use client';

import React from 'react';
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  Lock,
  RotateCcw,
  History,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import type { StoryEditorSaveStatus } from './useStoryAutosave';
import type { StoryLockHolder } from './useStoryLease';

export interface StoryCollaborationBarProps {
  saveStatus: StoryEditorSaveStatus;
  statusMessage: string;
  hasLease: boolean;
  isLockedByOther: boolean;
  lockHolder: StoryLockHolder | null;
  canTakeOver: boolean;
  onTakeOver: () => void;
  recoveredDraft: { timestamp: number; data: unknown } | null;
  onRestoreDraft: () => void;
  onDiscardDraft: () => void;
  onOpenRevisions: () => void;
  revisionCount?: number;
}

export function StoryCollaborationBar({
  saveStatus,
  statusMessage,
  hasLease,
  isLockedByOther,
  lockHolder,
  canTakeOver,
  onTakeOver,
  recoveredDraft,
  onRestoreDraft,
  onDiscardDraft,
  onOpenRevisions,
  revisionCount = 0,
}: StoryCollaborationBarProps) {
  return (
    <div className="flex flex-col gap-2 p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-neutral-200 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Save / Sync Status Indicator */}
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>{statusMessage || 'All changes saved'}</span>
            </span>
          )}

          {saveStatus === 'saving' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-950/80 text-blue-300 border border-blue-800/60">
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span>{statusMessage || 'Saving draft...'}</span>
            </span>
          )}

          {saveStatus === 'unsaved' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800/60">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{statusMessage || 'Unsaved changes'}</span>
            </span>
          )}

          {saveStatus === 'version_conflict' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800/60">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>{statusMessage || 'Version conflict'}</span>
            </span>
          )}

          {saveStatus === 'lease_conflict' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-950/80 text-purple-300 border border-purple-800/60">
              <Lock className="w-3.5 h-3.5 text-purple-400" />
              <span>{statusMessage || 'Editing locked by another user'}</span>
            </span>
          )}

          {saveStatus === 'autosave_failed' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-950/80 text-red-300 border border-red-800/60">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span>{statusMessage || 'Autosave failed'}</span>
            </span>
          )}

          {saveStatus === 'recovery_available' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>{statusMessage || 'Recovery draft available'}</span>
            </span>
          )}

          {/* Lease Ownership Badge */}
          {hasLease && !isLockedByOther && (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-400 pl-2 border-l border-neutral-700">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>Lease active</span>
            </span>
          )}
        </div>

        {/* Action Controls: Lock Takeover & Revisions History */}
        <div className="flex items-center gap-2">
          {isLockedByOther && lockHolder && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-300 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                Locked by {lockHolder.name || lockHolder.email} ({lockHolder.role})
              </span>
              {canTakeOver && (
                <button
                  type="button"
                  onClick={onTakeOver}
                  className="px-2.5 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-neutral-950 rounded transition-colors"
                >
                  Take Over
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onOpenRevisions}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
          >
            <History className="w-3.5 h-3.5 text-neutral-400" />
            <span>Revisions</span>
            {revisionCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-neutral-700 text-neutral-300 text-[10px]">
                {revisionCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Recovery Banner */}
      {recoveredDraft && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-cyan-950/60 border border-cyan-800/80 text-cyan-200 text-xs">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              Unsaved draft recovered from{' '}
              {new Date(recoveredDraft.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
              . Would you like to restore it?
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRestoreDraft}
              className="px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-neutral-950 font-medium transition-colors"
            >
              Restore Draft
            </button>
            <button
              type="button"
              onClick={onDiscardDraft}
              className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
