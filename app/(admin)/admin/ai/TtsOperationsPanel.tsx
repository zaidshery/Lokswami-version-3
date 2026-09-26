'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ConfirmModal from '@/components/ui/modal/ConfirmModal';

type AssetStatus = 'pending' | 'ready' | 'failed' | 'stale';
type AssetVariant = 'breaking_headline' | 'article_full' | 'epaper_story';

type AssetRecord = {
  _id: string;
  sourceType: string;
  sourceId: string;
  sourceParentId?: string;
  variant: AssetVariant;
  title?: string;
  audioUrl?: string;
  languageCode: string;
  voice: string;
  storageMode: string;
  status: AssetStatus;
  failureCount: number;
  lastError?: string;
  updatedAt: string;
  metadata?: {
    pageNumber?: number;
  };
};

type AuditRecord = {
  _id: string;
  action: string;
  result: string;
  actorEmail?: string;
  message?: string;
  createdAt: string;
};

type AssetsResponse = {
  success?: boolean;
  data?: {
    summary: {
      totalAssets: number;
      byStatus: Record<AssetStatus, number>;
      byVariant: Record<AssetVariant, number>;
      recentFailures: number;
    };
    assets: AssetRecord[];
    recentAudits: AuditRecord[];
    recentFailures: AssetRecord[];
  };
  error?: string;
};

type ActionResponse = {
  success?: boolean;
  data?: {
    processed?: number;
    ready?: number;
    failed?: number;
    skipped?: number;
    stale?: number;
    unchanged?: number;
    deletedAssets?: number;
    deletedFiles?: number;
    missingFiles?: number;
    retentionDays?: number;
    result?: Record<string, { processed: number; ready: number; failed: number }>;
  };
  error?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatTimestamp(value: string | undefined) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return parsed.toLocaleString();
}

function StatusPill({ label }: { label: string }) {
  const toneClass =
    label === 'ready' || label === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : label === 'failed'
        ? 'border-red-200 bg-red-50 text-red-700'
        : label === 'stale'
          ? 'border-amber-200 bg-amber-50 text-amber-700'
          : 'border-zinc-200 bg-zinc-100 text-zinc-700';

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass}`}
    >
      {label.replace(/_/g, ' ')}
    </span>
  );
}

export default function TtsOperationsPanel() {
  const [statusFilter, setStatusFilter] = useState('');
  const [variantFilter, setVariantFilter] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('');
  const [sourceIdFilter, setSourceIdFilter] = useState('');
  const [sourceParentIdFilter, setSourceParentIdFilter] = useState('');
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [payload, setPayload] = useState<NonNullable<AssetsResponse['data']> | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<
    'refresh' | 'revalidate' | 'prewarm' | 'retry' | 'cleanup' | ''
  >('');
  const [activeAssetId, setActiveAssetId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    setStatusFilter(searchParams.get('ttsStatus') || '');
    setVariantFilter(searchParams.get('ttsVariant') || '');
    setSourceTypeFilter(searchParams.get('ttsSourceType') || '');
    setSourceIdFilter(searchParams.get('ttsSourceId') || '');
    setSourceParentIdFilter(searchParams.get('ttsSourceParentId') || '');
  }, [searchParams]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ limit: '24' });
      if (statusFilter) params.set('status', statusFilter);
      if (variantFilter) params.set('variant', variantFilter);
      if (sourceTypeFilter) params.set('sourceType', sourceTypeFilter);
      if (sourceIdFilter) params.set('sourceId', sourceIdFilter);
      if (sourceParentIdFilter) params.set('sourceParentId', sourceParentIdFilter);

      const response = await fetch(`/api/admin/tts/assets?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as AssetsResponse;
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to load TTS operations.');
      }

      setPayload(data.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to load TTS operations.'));
    } finally {
      setLoading(false);
      setRunning('');
    }
  }, [sourceIdFilter, sourceParentIdFilter, sourceTypeFilter, statusFilter, variantFilter]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleRevalidate = useCallback(async () => {
    setRunning('revalidate');
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/tts/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusFilter || 'all',
          limit: 50,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ActionResponse;
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to revalidate TTS assets.');
      }

      setSuccess(
        `Revalidated ${data.data.processed || 0} assets. ${data.data.stale || 0} stale, ${data.data.ready || 0} restored.`
      );
      await loadOverview();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to revalidate TTS assets.'));
      setRunning('');
    }
  }, [loadOverview, statusFilter]);

  const handlePrewarm = useCallback(async () => {
    setRunning('prewarm');
    setError('');
    setSuccess('');

    try {
      const scope =
        variantFilter === 'breaking_headline'
          ? 'breaking'
          : variantFilter === 'article_full'
            ? 'article'
            : variantFilter === 'epaper_story'
              ? 'epaper'
              : 'all';

      const response = await fetch('/api/admin/tts/prewarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, forceRegenerate }),
      });
      const data = (await response.json().catch(() => ({}))) as ActionResponse;
      if (!response.ok || !data.success || !data.data?.result) {
        throw new Error(data.error || 'Failed to prewarm TTS assets.');
      }

      const summary = Object.entries(data.data.result)
        .map(([key, value]) => `${key}: ${value.ready}/${value.processed}`)
        .join(' | ');
      setSuccess(`Prewarm finished. ${summary}`);
      await loadOverview();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to prewarm TTS assets.'));
      setRunning('');
    }
  }, [forceRegenerate, loadOverview, variantFilter]);

  const handleRetry = useCallback(
    async (assetIds?: string[]) => {
      setRunning('retry');
      setActiveAssetId(assetIds?.length === 1 ? assetIds[0] : '');
      setError('');
      setSuccess('');

      try {
        const response = await fetch('/api/admin/tts/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            assetIds?.length
              ? { assetIds }
              : {
                  status: statusFilter || 'failed',
                  variant: variantFilter || undefined,
                  sourceType: sourceTypeFilter || undefined,
                  sourceId: sourceIdFilter || undefined,
                  sourceParentId: sourceParentIdFilter || undefined,
                  limit: 50,
                }
          ),
        });
        const data = (await response.json().catch(() => ({}))) as ActionResponse;
        if (!response.ok || !data.success || !data.data) {
          throw new Error(data.error || 'Failed to retry TTS assets.');
        }

        setSuccess(
          `Retry finished. ${data.data.ready || 0} ready, ${data.data.failed || 0} failed, ${data.data.skipped || 0} skipped.`
        );
        await loadOverview();
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Failed to retry TTS assets.'));
        setRunning('');
        setActiveAssetId('');
      }
    },
    [loadOverview, sourceIdFilter, sourceParentIdFilter, sourceTypeFilter, statusFilter, variantFilter]
  );

  const handleCleanup = useCallback(async () => {
    setRunning('cleanup');
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/tts/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusFilter || 'all',
          variant: variantFilter || undefined,
          sourceType: sourceTypeFilter || undefined,
          sourceId: sourceIdFilter || undefined,
          sourceParentId: sourceParentIdFilter || undefined,
          limit: 100,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as ActionResponse;
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to clean up expired TTS assets.');
      }

      setSuccess(
        `Cleanup finished. Removed ${data.data.deletedAssets || 0} expired assets and ${data.data.deletedFiles || 0} stored files using the ${data.data.retentionDays || 0}-day retention policy.`
      );
      await loadOverview();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to clean up expired TTS assets.'));
      setRunning('');
    } finally {
      setCleanupConfirmOpen(false);
    }
  }, [
    loadOverview,
    sourceIdFilter,
    sourceParentIdFilter,
    sourceTypeFilter,
    statusFilter,
    variantFilter,
  ]);

  const getSourceHref = useCallback((asset: AssetRecord) => {
    if (asset.sourceType === 'article') {
      return `/admin/articles/${encodeURIComponent(asset.sourceId)}/edit`;
    }

    if (asset.sourceType === 'epaperArticle' && asset.sourceParentId) {
      const pageNumber = Number(asset.metadata?.pageNumber || 0);
      if (Number.isFinite(pageNumber) && pageNumber > 0) {
        return `/admin/epapers/${encodeURIComponent(asset.sourceParentId)}/page/${pageNumber}`;
      }
      return `/admin/epapers/${encodeURIComponent(asset.sourceParentId)}`;
    }

    return '/admin/ai';
  }, []);

  const cards = useMemo(
    () =>
      payload
        ? [
            { label: 'Total', value: payload.summary.totalAssets },
            { label: 'Ready', value: payload.summary.byStatus.ready },
            { label: 'Stale', value: payload.summary.byStatus.stale },
            { label: 'Failed', value: payload.summary.byStatus.failed },
          ]
        : [],
    [payload]
  );
  const hasFocusedSource = Boolean(sourceTypeFilter || sourceIdFilter || sourceParentIdFilter);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">TTS Operations</h2>
          <p className="mt-1 text-sm text-gray-500">
            Inspect shared audio assets, recent history, and run repair jobs from the CMS.
          </p>
          {hasFocusedSource ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-semibold">
                Focused view
              </span>
              {sourceTypeFilter ? <span>type: {sourceTypeFilter}</span> : null}
              {sourceIdFilter ? <span>source: {sourceIdFilter}</span> : null}
              {sourceParentIdFilter ? <span>parent: {sourceParentIdFilter}</span> : null}
              <Link
                href="/admin/ai"
                className="font-semibold text-red-600 hover:underline"
              >
                Clear focus
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
          >
            <option value="">All statuses</option>
            <option value="ready">Ready</option>
            <option value="stale">Stale</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={variantFilter}
            onChange={(event) => setVariantFilter(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800"
          >
            <option value="">All surfaces</option>
            <option value="breaking_headline">Breaking</option>
            <option value="article_full">Articles</option>
            <option value="epaper_story">E-paper</option>
          </select>

          <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={forceRegenerate}
              onChange={(event) => setForceRegenerate(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            Force regenerate
          </label>

          <button
            type="button"
            onClick={() => {
              setRunning('refresh');
              void loadOverview();
            }}
            disabled={loading || running !== ''}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            {running === 'refresh' ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={() => void handleRevalidate()}
            disabled={loading || running !== ''}
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
          >
            {running === 'revalidate' ? 'Revalidating...' : 'Revalidate'}
          </button>

          <button
            type="button"
            onClick={() => void handlePrewarm()}
            disabled={loading || running !== ''}
            className="rounded-xl bg-[linear-gradient(135deg,#e63946,#c1121f)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            {running === 'prewarm' ? 'Prewarming...' : 'Prewarm latest'}
          </button>

          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={loading || running !== ''}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
          >
            {running === 'retry' ? 'Retrying...' : 'Retry filtered'}
          </button>

          <button
            type="button"
            onClick={() => setCleanupConfirmOpen(true)}
            disabled={loading || running !== ''}
            className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-60"
          >
            {running === 'cleanup' ? 'Cleaning up...' : 'Cleanup expired'}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" aria-live="assertive" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {success ? (
        <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      <ConfirmModal
        isOpen={cleanupConfirmOpen}
        onClose={() => setCleanupConfirmOpen(false)}
        onConfirm={handleCleanup}
        isLoading={running === 'cleanup'}
        title="Clean up expired TTS assets?"
        message="This permanently removes expired TTS asset records and stored files matching the current filters and retention policy."
        confirmLabel="Clean up expired assets"
        variant="danger"
      />

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
          >
            <p className="text-sm font-semibold text-gray-500">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr,1fr]">
        <div className="rounded-2xl border border-gray-200 p-4">
          <h3 className="text-lg font-bold text-gray-900">Recent assets</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Surface</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payload?.assets?.length ? (
                  payload.assets.map((asset) => (
                    <tr key={asset._id} className="align-top">
                      <td className="py-3 pr-4">
                        <StatusPill label={asset.status} />
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        <div className="font-semibold">{asset.variant.replace(/_/g, ' ')}</div>
                        <div className="text-xs text-gray-500">
                          {asset.languageCode} | {asset.voice}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        <div className="font-semibold text-gray-900">
                          {asset.title || asset.sourceId}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {asset.sourceType} | {asset.storageMode}
                        </div>
                        {asset.lastError ? (
                          <div className="mt-1 text-xs text-red-600">{asset.lastError}</div>
                        ) : null}
                        {asset.audioUrl ? (
                          <a
                            href={asset.audioUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-xs font-medium text-red-600 hover:underline"
                          >
                            Open audio
                          </a>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Link
                            href={getSourceHref(asset)}
                            className="inline-flex items-center rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            View source
                          </Link>
                          {(asset.status === 'failed' || asset.status === 'stale' || asset.status === 'pending') ? (
                            <button
                              type="button"
                              onClick={() => void handleRetry([asset._id])}
                              disabled={running !== ''}
                              className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              {running === 'retry' && activeAssetId === asset._id ? 'Retrying...' : 'Retry'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-700">
                        {formatTimestamp(asset.updatedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm text-gray-500">
                      {loading ? 'Loading assets...' : 'No assets matched these filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 p-4">
            <h3 className="text-lg font-bold text-gray-900">Recent audit events</h3>
            <div className="mt-4 space-y-3">
              {payload?.recentAudits?.length ? (
                payload.recentAudits.map((audit) => (
                  <div key={audit._id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill label={audit.result} />
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(audit.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {audit.action.replace(/_/g, ' ')}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      {audit.message || 'No message provided.'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  {loading ? 'Loading audit history...' : 'No audit events yet.'}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-4">
            <h3 className="text-lg font-bold text-gray-900">Recent failures</h3>
            <div className="mt-4 space-y-3">
              {payload?.recentFailures?.length ? (
                payload.recentFailures.map((asset) => (
                  <div key={asset._id} className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill label={asset.status} />
                      <span className="text-xs text-red-600">
                        failures: {asset.failureCount}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-red-900">
                      {asset.title || asset.sourceId}
                    </p>
                    <p className="mt-1 text-sm text-red-700">
                      {asset.lastError || 'Unknown error'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={getSourceHref(asset)}
                        className="inline-flex items-center rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        View source
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleRetry([asset._id])}
                        disabled={running !== ''}
                        className="inline-flex items-center rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {running === 'retry' && activeAssetId === asset._id ? 'Retrying...' : 'Retry'}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">
                  {loading ? 'Loading failures...' : 'No recent failures.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
