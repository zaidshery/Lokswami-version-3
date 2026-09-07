'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { canPublishEpaper } from '@/lib/auth/permissions';
import { normalizeAdminRole } from '@/lib/auth/roles';
import { CheckCircle2, Globe, Loader2 } from 'lucide-react';

export default function EpaperStoryReleaseButton({
  epaperId,
  storyId,
  updatedAt,
  releaseVersion,
  onReleased,
}: {
  epaperId: string;
  storyId: string;
  updatedAt?: string;
  releaseVersion?: number;
  onReleased?: (version: number) => void;
}) {
  const { data } = useSession();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [currentVersion, setCurrentVersion] = useState(releaseVersion || 0);

  const canPublish = canPublishEpaper(normalizeAdminRole(data?.user?.role));

  if (!canPublish) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
        <span>Story saved. Admin release required to make live.</span>
      </div>
    );
  }

  async function release() {
    setPending(true);
    setMessage('Releasing saved story…');
    try {
      const response = await fetch(
        `/api/admin/epapers/${encodeURIComponent(epaperId)}/articles/${encodeURIComponent(storyId)}/release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedUpdatedAt: updatedAt }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Release failed.');
      const ver = Number(result.version || 1);
      setCurrentVersion(ver);
      onReleased?.(ver);
      setMessage(`Story is live to readers (v${ver}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Release failed. Retry after checking the saved story.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !updatedAt}
          onClick={() => void release()}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Releasing…</span>
            </>
          ) : (
            <>
              <Globe className="h-3.5 w-3.5" />
              <span>{currentVersion > 0 ? 'Update live release' : 'Release to readers'}</span>
            </>
          )}
        </button>

        {currentVersion > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Live (v{currentVersion})</span>
          </span>
        ) : (
          <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
            Draft (private)
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-500">
        Save changes first. Releasing publishes this story to the public reader.
      </p>
      {message ? (
        <p role="status" className={`text-xs ${message.includes('live') ? 'text-emerald-700' : 'text-red-600'}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
