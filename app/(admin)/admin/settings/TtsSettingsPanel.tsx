'use client';

import { useCallback, useEffect, useState } from 'react';

type SettingsPayload = {
  mode: 'manual-upload-only';
  message: string;
  storage: {
    mode: string;
    writable: boolean;
    digitalOceanSpacesConfigured: boolean;
  };
  assets: {
    ready: number;
    failed: number;
    stale: number;
  };
};

type SettingsResponse = {
  success?: boolean;
  data?: SettingsPayload;
  error?: string;
};

const PANEL_CLASS =
  'rounded-[32px] border border-zinc-200/80 bg-white/92 p-8 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.38)] dark:border-white/10 dark:bg-zinc-950/60';

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export default function TtsSettingsPanel() {
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/tts/settings', { cache: 'no-store' });
      const data = (await response.json().catch(() => ({}))) as SettingsResponse;
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to load TTS settings.');
      }
      setPayload(data.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Failed to load TTS settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  if (loading && !payload) {
    return (
      <div className={PANEL_CLASS}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading TTS settings...</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className={PANEL_CLASS}>
        <p className="text-sm text-red-600 dark:text-red-400">
          {error || 'Unable to load TTS settings.'}
        </p>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={loading}
          className="mt-4 rounded-2xl border border-zinc-200/80 bg-white/85 px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
        >
          {loading ? 'Refreshing...' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className={PANEL_CLASS}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            Manual audio
          </p>
          <h2 className="mt-2 text-3xl font-black text-zinc-900 dark:text-zinc-100">
            TTS &amp; Audio Status
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
            {payload.message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={loading}
          className="rounded-2xl border border-zinc-200/80 bg-white/85 px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
        >
          {loading ? 'Refreshing...' : 'Refresh status'}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/95 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Runtime mode
          </p>
          <p className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Manual upload only
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Automatic generation is disabled.
          </p>
        </div>

        <div className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/95 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Storage
          </p>
          <p className="mt-2 text-lg font-bold capitalize text-zinc-900 dark:text-zinc-100">
            {payload.storage.mode}
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {payload.storage.digitalOceanSpacesConfigured
              ? 'DigitalOcean Spaces configured'
              : payload.storage.writable
                ? 'Local storage available'
                : 'Storage unavailable'}
          </p>
        </div>

        <div className="rounded-[24px] border border-zinc-200/80 bg-zinc-50/95 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Audio assets
          </p>
          <p className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {payload.assets.ready} ready
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {payload.assets.failed} failed · {payload.assets.stale} stale
          </p>
        </div>
      </div>
    </div>
  );
}
