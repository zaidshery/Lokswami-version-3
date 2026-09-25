'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, Megaphone, ShieldAlert, XCircle } from 'lucide-react';
import type { PushAlertCandidate } from '@/lib/admin/newsroomControlCenter';
import type { PushDeliveryRecord, PushProviderStatus } from '@/lib/server/push/pushDeliveryTypes';
import {
  CMS_COLLECTION_PANEL_CLASS as PANEL_CLASS,
  CMS_COLLECTION_SOFT_CARD_CLASS as SOFT_CARD_CLASS,
} from '@/components/admin/CmsCollectionLayout';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function PushAlertDeskClient({
  candidates,
}: {
  candidates: PushAlertCandidate[];
}) {
  const [selectedId, setSelectedId] = useState(candidates[0]?.id || '');
  const [customHeadline, setCustomHeadline] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [providerStatus, setProviderStatus] = useState<PushProviderStatus | null>(null);
  const [preparedAlerts, setPreparedAlerts] = useState<PushDeliveryRecord[]>([]);

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) || candidates[0] || null,
    [candidates, selectedId]
  );

  useEffect(() => {
    if (selected && !customHeadline) {
      setCustomHeadline(selected.suggestedLine);
      setCustomBody(`Read full coverage on Lokswami: ${selected.title}`);
    }
  }, [selected]);

  // Load push alerts and provider status from server
  async function loadPushData() {
    try {
      const res = await fetch('/api/admin/push-alerts');
      if (res.ok) {
        const data = await res.json();
        setProviderStatus(data.providerStatus);
        setPreparedAlerts(data.alerts || []);
      }
    } catch {
      // Non-blocking fallback
    }
  }

  useEffect(() => {
    loadPushData();
  }, []);

  const previewTitle = customHeadline.trim() || selected?.suggestedLine || 'Breaking News Alert';
  const previewBody =
    customBody.trim() || (selected ? `Read full coverage on Lokswami: ${selected.title}` : 'Story body preview goes here.');

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(`${previewTitle}\n\n${previewBody}`);
      setStatusMessage('Push-alert draft copied to clipboard.');
      setErrorMessage('');
    } catch {
      setStatusMessage('Copy failed. Select the text and copy it manually.');
    }
  }

  async function handlePrepareAlert() {
    if (!selected) return;
    setIsSubmitting(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      const res = await fetch('/api/admin/push-alerts/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceStoryId: selected.id,
          title: previewTitle,
          body: previewBody,
          deepLink: selected.href || `/main/article/${selected.id}`,
          audience: 'all_subscribers',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to prepare push alert.');
      } else {
        setStatusMessage(`Push alert successfully prepared (ID: ${data.alert.deliveryId}). Ready for manual distribution.`);
        await loadPushData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error preparing alert.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelAlert(deliveryId: string) {
    setIsSubmitting(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      const res = await fetch(`/api/admin/push-alerts/${deliveryId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Cancelled by desk editor',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Failed to cancel push alert.');
      } else {
        setStatusMessage(`Alert ${deliveryId} cancelled.`);
        await loadPushData();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error cancelling alert.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Provider Status Safety Banner */}
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50/80 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Provider State: {providerStatus?.provider.toUpperCase() || 'DISABLED'} (Manual Preparation Only)
            </h3>
            <p className="text-xs leading-5 text-amber-800 dark:text-amber-300">
              {providerStatus?.networkCallsPermitted === false
                ? 'External push gateways (Firebase, OneSignal, APNs) are disabled by architectural policy. Outgoing alerts are prepared in the newsroom repository for editorial copy and manual dispatch.'
                : 'Automated real-time broadcast is strictly disabled. Alerts are created in Prepared status with audit history.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        {/* Story candidates column */}
        <section className={PANEL_CLASS}>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-red-500/10 p-3 text-red-600 dark:text-red-300">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Alert Candidates</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                Select a high-signal story and prepare the alert copy the desk can publish.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {candidates.length ? (
              candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(candidate.id);
                    setCustomHeadline(candidate.suggestedLine);
                    setCustomBody(`Read full coverage on Lokswami: ${candidate.title}`);
                    setStatusMessage('');
                    setErrorMessage('');
                  }}
                  className={cx(
                    SOFT_CARD_CLASS,
                    'w-full text-left transition-colors hover:border-red-300/40 hover:bg-red-50/50 dark:hover:border-red-500/20 dark:hover:bg-red-500/5',
                    selected?.id === candidate.id &&
                      'border-red-300/60 bg-red-50/70 dark:border-red-500/30 dark:bg-red-500/8'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {candidate.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {candidate.category} / {candidate.author}
                      </p>
                    </div>
                    <span
                      className={cx(
                        'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
                        candidate.priority === 'high'
                          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
                          : 'border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200'
                      )}
                    >
                      {candidate.priority === 'high' ? 'Priority' : 'Watch'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {candidate.suggestedLine}
                  </p>
                </button>
              ))
            ) : (
              <div className={SOFT_CARD_CLASS}>
                No article candidates are available yet. Publish or update a few stories and this desk
                will begin surfacing push-alert lines.
              </div>
            )}
          </div>
        </section>

        {/* Preparation & Preview column */}
        <section className={`${PANEL_CLASS} xl:sticky xl:top-4 xl:self-start space-y-4`}>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Push Alert Draft</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Build the alert copy here, then prepare it in the system for controlled manual distribution.
            </p>
          </div>

          <div className="space-y-4">
            <div className={SOFT_CARD_CLASS}>
              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Headline (3-120 chars)
              </label>
              <input
                type="text"
                value={customHeadline}
                onChange={(event) => {
                  setCustomHeadline(event.target.value);
                  setStatusMessage('');
                  setErrorMessage('');
                }}
                maxLength={120}
                placeholder="Write the alert headline."
                className="mt-2 w-full rounded-2xl border border-zinc-200/80 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-red-300 focus:ring-2 focus:ring-red-500/10 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100"
              />
              <div className="mt-1 text-right text-[11px] text-zinc-400">
                {customHeadline.length} / 120
              </div>
            </div>

            <div className={SOFT_CARD_CLASS}>
              <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Body / Summary (5-250 chars)
              </label>
              <textarea
                value={customBody}
                onChange={(event) => {
                  setCustomBody(event.target.value);
                  setStatusMessage('');
                  setErrorMessage('');
                }}
                maxLength={250}
                rows={3}
                placeholder="Write the alert summary body."
                className="mt-2 w-full rounded-2xl border border-zinc-200/80 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-red-300 focus:ring-2 focus:ring-red-500/10 dark:border-white/10 dark:bg-zinc-950/70 dark:text-zinc-100"
              />
              <div className="mt-1 text-right text-[11px] text-zinc-400">
                {customBody.length} / 250
              </div>
            </div>

            {/* Notification Preview Mockup */}
            <div className={SOFT_CARD_CLASS}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                Lock Screen Preview
              </p>
              <div className="mt-3 rounded-2xl border border-zinc-200/80 bg-zinc-50 p-4 text-zinc-800 shadow-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">
                <div className="flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-red-600 text-[10px] font-bold text-white">
                    LS
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Lokswami News • now
                  </span>
                </div>
                <h4 className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">{previewTitle}</h4>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{previewBody}</p>
                {selected?.href && (
                  <p className="mt-2 text-[11px] text-zinc-400 font-mono">
                    Target: {selected.href}
                  </p>
                )}
              </div>
            </div>

            {/* Action Bar - PREPARE, COPY, VIEW (NO SEND BUTTON) */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handlePrepareAlert}
                disabled={isSubmitting || !selected}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-600 bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                Prepare Push Alert
              </button>
              <button
                type="button"
                onClick={copyPreview}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Copy className="h-4 w-4" />
                Copy Alert Copy
              </button>
              {selected ? (
                <a
                  href={selected.href}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition-colors hover:border-red-300/40 hover:text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:border-red-500/30 dark:hover:text-red-300"
                >
                  Open Story
                </a>
              ) : null}
            </div>

            {statusMessage && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                {statusMessage}
              </div>
            )}
            {errorMessage && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
                {errorMessage}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Prepared Alerts & Audit History Section */}
      <section className={PANEL_CLASS}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Prepared Alerts & Delivery Audit</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Audit log of all prepared notifications, manual dispatch readiness, and cancellation records.
            </p>
          </div>
          <button
            type="button"
            onClick={loadPushData}
            className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {preparedAlerts.length > 0 ? (
            preparedAlerts.map((alert) => (
              <div
                key={alert.deliveryId}
                className={cx(
                  SOFT_CARD_CLASS,
                  'flex flex-col gap-3 md:flex-row md:items-center md:justify-between'
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cx(
                        'rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
                        alert.status === 'prepared'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                          : alert.status === 'cancelled'
                          ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          : alert.status === 'succeeded'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                      )}
                    >
                      {alert.status}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      ID: {alert.deliveryId}
                    </span>
                    <span className="text-xs text-zinc-500">
                      • {new Date(alert.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {alert.payload.title}
                  </h4>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {alert.payload.body}
                  </p>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-3 pt-1">
                    <span>Target: {alert.payload.deepLink}</span>
                    <span>Audience: {alert.recipient.type}</span>
                    <span>Prepared by: {alert.audit.createdBy.email || alert.audit.createdBy.name}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {alert.status === 'prepared' && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleCancelAlert(alert.deliveryId)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel Alert
                    </button>
                  )}
                  {alert.status === 'cancelled' && (
                    <span className="text-xs text-zinc-400 italic">
                      Cancelled ({alert.audit.cancelReason || 'No reason provided'})
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className={SOFT_CARD_CLASS}>
              No prepared push alerts yet. Select a story above to prepare a push alert.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
