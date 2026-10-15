'use client';

import { useState } from 'react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import type { EPaperRecord } from '@/lib/types/epaper';

export default function EpaperRevisionPageQa({ epaper, pageNumber, onReviewed }: {
  epaper: EPaperRecord;
  pageNumber: number;
  onReviewed: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (!epaper.supersedesId || epaper.status === 'published' || epaper.productionStatus === 'archived') return null;
  const page = epaper.pages.find((entry) => entry.pageNumber === pageNumber);
  const ready = page?.reviewStatus === 'ready';
  const blocked = epaper.revisionInitializationStatus === 'initializing' || epaper.revisionInitializationStatus === 'failed';

  async function markReviewed() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/epapers/${encodeURIComponent(epaper._id)}/pages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ expectedVersion: epaper.version, pages: [{ pageNumber, reviewStatus: 'ready' }] }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Page review could not be saved. Reload and try again.');
      await onReviewed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Page review could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3" aria-label="Draft revision page QA">
      <p className="text-sm font-semibold text-gray-900">{ready ? 'Page QA complete' : 'Page QA required'}</p>
      <p className="mt-1 text-xs text-gray-600">
        Review this page’s images and mapped stories before marking QA complete. Every page must be reviewed before this draft revision can become ready to publish. Further edits require another review.
      </p>
      <button type="button" onClick={() => void markReviewed()} disabled={saving || ready || blocked || !epaper.version}
        className="mt-3 rounded-md bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70">
        {saving ? 'Saving page QA…' : ready ? 'Page reviewed' : 'Mark page QA complete'}
      </button>
      {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
    </section>
  );
}
