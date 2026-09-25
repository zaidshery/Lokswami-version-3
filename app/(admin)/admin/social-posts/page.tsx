'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Share2 } from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { canDispatchSocialPosts, canViewPage } from '@/lib/auth/permissions';
import { isAdminRole } from '@/lib/auth/roles';

type SocialPost = {
  _id: string;
  sourceStoryId: string;
  sourceArticleId?: string;
  platform: 'youtube' | 'facebook' | 'instagram';
  status: 'draft' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'failed';
  caption: string;
  hashtags: string;
  thumbnailUrl: string;
  videoUrl: string;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  externalUrl?: string;
  lastError?: string;
  updatedAt?: string;
  automationProvider?: 'manual' | 'n8n' | 'generic_webhook';
  automationDispatchedAt?: string | null;
  automationExecutionId?: string;
  automationExecutionUrl?: string;
};

type SocialDelivery = {
  _id: string;
  deliveryId: string;
  socialPostId: string;
  platform: 'youtube' | 'facebook' | 'instagram';
  status:
    | 'pending'
    | 'dispatching'
    | 'succeeded'
    | 'retryable_failed'
    | 'failed'
    | 'blocked'
    | 'cancelled';
  attempts: number;
  maxAttempts: number;
  reconciliationRequired: boolean;
  lastError?: { category: string; message: string; timestamp?: string } | null;
  dispatchedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string;
};

type AutomationMeta = {
  provider: 'manual' | 'n8n' | 'generic_webhook';
  enabled: boolean;
  label: string;
};

const PLATFORM_OPTIONS = ['all', 'youtube', 'facebook', 'instagram'] as const;
const STATUS_OPTIONS = [
  'all',
  'draft',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'failed',
] as const;

function formatStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusTone(status: SocialPost['status']) {
  switch (status) {
    case 'published':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'approved':
    case 'scheduled':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'publishing':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'draft':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700';
  }
}

function getDeliveryTone(status: SocialDelivery['status']) {
  switch (status) {
    case 'succeeded':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'dispatching':
      return 'border-purple-200 bg-purple-50 text-purple-700';
    case 'retryable_failed':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'blocked':
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'cancelled':
      return 'border-zinc-200 bg-zinc-50 text-zinc-700';
    case 'pending':
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700';
  }
}

export default function SocialPostsPage() {
  const { data: session } = useSession();
  const adminRole = isAdminRole(session?.user?.role) ? session.user.role : null;
  const canAccess = canViewPage(adminRole, 'social_posts');
  const canManage = adminRole === 'admin' || adminRole === 'super_admin';
  const canDispatch = canDispatchSocialPosts(adminRole);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, SocialDelivery>>({});
  const [platformFilter, setPlatformFilter] =
    useState<(typeof PLATFORM_OPTIONS)[number]>('all');
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [automationMeta, setAutomationMeta] = useState<AutomationMeta | null>(null);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (platformFilter !== 'all') params.set('platform', platformFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const [postsRes, deliveriesRes] = await Promise.all([
        fetch(`/api/admin/social-posts?${params.toString()}`, {
          headers: {
            ...getAuthHeader(),
          },
          cache: 'no-store',
        }),
        fetch('/api/admin/social-deliveries', {
          headers: {
            ...getAuthHeader(),
          },
          cache: 'no-store',
        }).catch(() => null),
      ]);

      const data = (await postsRes.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SocialPost[];
        meta?: {
          automation?: AutomationMeta;
        };
      };

      if (!postsRes.ok || !data.success || !Array.isArray(data.data)) {
        throw new Error(data.error || 'Failed to load social posts');
      }

      setPosts(data.data);
      setAutomationMeta(data.meta?.automation || null);

      if (deliveriesRes && deliveriesRes.ok) {
        const delData = (await deliveriesRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: SocialDelivery[];
        };
        if (delData.success && Array.isArray(delData.data)) {
          const map: Record<string, SocialDelivery> = {};
          for (const d of delData.data) {
            if (d.socialPostId && (!map[d.socialPostId] || new Date(d.updatedAt || 0) > new Date(map[d.socialPostId].updatedAt || 0))) {
              map[d.socialPostId] = d;
            }
          }
          setDeliveries(map);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load social posts');
    } finally {
      setIsLoading(false);
    }
  }, [platformFilter, statusFilter]);

  useEffect(() => {
    if (!canAccess) return;
    void fetchPosts();
  }, [canAccess, fetchPosts]);

  const filteredPosts = useMemo(() => posts, [posts]);

  const handleStatusUpdate = async (
    postId: string,
    status: SocialPost['status']
  ) => {
    setBusyId(postId);
    setError('');
    try {
      const response = await fetch(`/api/admin/social-posts/${postId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          status,
          ...(status === 'published' ? { publishedAt: new Date().toISOString() } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SocialPost;
      };
      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to update social post');
      }
      setPosts((current) => current.map((post) => (post._id === postId ? data.data! : post)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update social post');
    } finally {
      setBusyId('');
    }
  };

  const handleDispatch = async (postId: string) => {
    setBusyId(postId);
    setError('');
    try {
      const response = await fetch(`/api/admin/social-posts/${postId}/dispatch`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
        },
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SocialPost;
        delivery?: SocialDelivery;
        meta?: {
          automation?: AutomationMeta;
        };
      };

      if (!response.ok || !data.success || !data.data) {
        throw new Error(data.error || 'Failed to send social post to automation');
      }

      setPosts((current) => current.map((post) => (post._id === postId ? data.data! : post)));
      if (data.delivery) {
        setDeliveries((prev) => ({ ...prev, [postId]: data.delivery! }));
      }
      if (data.meta?.automation) {
        setAutomationMeta(data.meta.automation);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send social post to automation');
    } finally {
      setBusyId('');
    }
  };

  const handleRetryDelivery = async (deliveryId: string, postId: string) => {
    setBusyId(postId);
    setError('');
    try {
      const response = await fetch(`/api/admin/social-deliveries/${deliveryId}/retry`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
        },
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SocialPost;
        delivery?: SocialDelivery;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to retry delivery');
      }

      if (data.data) {
        setPosts((current) => current.map((post) => (post._id === postId ? data.data! : post)));
      }
      if (data.delivery) {
        setDeliveries((prev) => ({ ...prev, [postId]: data.delivery! }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry delivery');
    } finally {
      setBusyId('');
    }
  };

  const handleReconcileDelivery = async (
    deliveryId: string,
    postId: string,
    outcome: 'succeeded' | 'failed'
  ) => {
    setBusyId(postId);
    setError('');
    try {
      const response = await fetch(`/api/admin/social-deliveries/${deliveryId}/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ outcome }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: SocialDelivery;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to reconcile delivery');
      }

      if (data.data) {
        setDeliveries((prev) => ({ ...prev, [postId]: data.data! }));
      }
      await fetchPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reconcile delivery');
    } finally {
      setBusyId('');
    }
  };

  if (!canAccess) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        You do not have access to the social distribution outbox.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="admin-shell-surface-strong rounded-[30px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[color:var(--admin-shell-text)]">
              Social Distribution Outbox
            </h1>
            <p className="mt-2 text-sm text-[color:var(--admin-shell-text-muted)]">
              Review, approve, and track platform drafts created from approved stories and edited
              videos.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/stories"
              className="admin-shell-toolbar-btn inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
            >
              Story Desk
            </Link>
            <button
              type="button"
              onClick={() => void fetchPosts()}
              className="admin-shell-toolbar-btn inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="admin-shell-surface rounded-[28px] p-5">
        <div className="mb-4 rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-4 py-3 text-sm text-[color:var(--admin-shell-text-muted)]">
          <p className="font-semibold text-[color:var(--admin-shell-text)]">Automation</p>
          <p className="mt-1">
            {automationMeta?.enabled
              ? `${automationMeta.label} is connected. Approve a draft, then send it to automation for handoff to your publishing workflow.`
              : 'Automation is in manual mode. Configure n8n or a webhook to hand off approved drafts automatically.'}
          </p>
          <p className="mt-2 text-xs">
            Recommended free automation for this setup: self-hosted n8n using a webhook trigger.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={platformFilter}
            onChange={(event) =>
              setPlatformFilter(event.target.value as (typeof PLATFORM_OPTIONS)[number])
            }
            className="rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] px-4 py-3 text-sm text-[color:var(--admin-shell-text)]"
          >
            {PLATFORM_OPTIONS.map((platform) => (
              <option key={platform} value={platform}>
                {platform === 'all' ? 'All platforms' : formatStatusLabel(platform)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as (typeof STATUS_OPTIONS)[number])
            }
            className="rounded-2xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] px-4 py-3 text-sm text-[color:var(--admin-shell-text)]"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'All statuses' : formatStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="admin-shell-surface-strong rounded-[30px] p-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-red-600" />
          <p className="mt-3 text-sm text-[color:var(--admin-shell-text-muted)]">
            Loading social drafts...
          </p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="admin-shell-surface-strong rounded-[30px] p-10 text-center">
          <Share2 className="mx-auto h-10 w-10 text-zinc-400" />
          <p className="mt-3 text-lg font-semibold text-[color:var(--admin-shell-text)]">
            No social drafts yet
          </p>
          <p className="mt-2 text-sm text-[color:var(--admin-shell-text-muted)]">
            Generate drafts from the story desk once article and video production are ready.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPosts.map((post) => {
            const delivery = deliveries[post._id];
            return (
              <article
                key={post._id}
                className="admin-shell-surface-strong rounded-[30px] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-[color:var(--admin-shell-text)]">
                        {formatStatusLabel(post.platform)}
                      </h2>
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getStatusTone(
                          post.status
                        )}`}
                      >
                        {formatStatusLabel(post.status)}
                      </span>
                      {delivery ? (
                        <span
                          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getDeliveryTone(
                            delivery.status
                          )}`}
                        >
                          Delivery: {formatStatusLabel(delivery.status)}
                          {delivery.attempts > 0 ? ` (${delivery.attempts}/${delivery.maxAttempts})` : ''}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
                      {post.caption || 'No caption drafted yet.'}
                    </p>
                    {post.hashtags ? (
                      <p className="mt-2 text-xs text-[color:var(--admin-shell-text-muted)]">
                        {post.hashtags}
                      </p>
                    ) : null}

                    {delivery?.reconciliationRequired ? (
                      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <div className="flex-1">
                          <p className="font-semibold">Reconciliation Required</p>
                          <p className="mt-0.5">
                            Provider timeout occurred. Outcome is unknown downstream. Confirm status before retrying to prevent duplicate posts.
                          </p>
                          {canDispatch ? (
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleReconcileDelivery(delivery._id, post._id, 'succeeded')}
                                disabled={busyId === post._id}
                                className="rounded-xl border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                              >
                                Confirm Succeeded
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReconcileDelivery(delivery._id, post._id, 'failed')}
                                disabled={busyId === post._id}
                                className="rounded-xl border border-red-300 bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800"
                              >
                                Mark Failed
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--admin-shell-text-muted)]">
                      <span>Story {post.sourceStoryId}</span>
                      {post.sourceArticleId ? <span>Article {post.sourceArticleId}</span> : null}
                      {post.updatedAt ? <span>Updated {post.updatedAt}</span> : null}
                      {post.automationDispatchedAt ? (
                        <span>Automation sent {post.automationDispatchedAt}</span>
                      ) : null}
                      {post.automationExecutionUrl ? (
                        <a
                          href={post.automationExecutionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold underline"
                        >
                          Open automation run
                        </a>
                      ) : null}
                      {post.externalUrl ? (
                        <a
                          href={post.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold underline"
                        >
                          Open external post
                        </a>
                      ) : null}
                    </div>

                    {delivery?.lastError?.message || post.lastError ? (
                      <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                        Last error: {delivery?.lastError?.message || post.lastError}
                      </div>
                    ) : null}
                  </div>

                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate(post._id, 'approved')}
                        disabled={busyId === post._id}
                        className="admin-shell-toolbar-btn rounded-2xl px-3 py-2 text-xs font-semibold"
                      >
                        Approve
                      </button>
                      {canDispatch ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleDispatch(post._id)}
                            disabled={
                              busyId === post._id ||
                              !automationMeta?.enabled ||
                              (post.status !== 'approved' &&
                                post.status !== 'scheduled' &&
                                post.status !== 'failed')
                            }
                            className="admin-shell-toolbar-btn rounded-2xl px-3 py-2 text-xs font-semibold"
                          >
                            Send To Automation
                          </button>
                          {delivery && (delivery.status === 'retryable_failed' || delivery.status === 'failed') && delivery.attempts < delivery.maxAttempts && !delivery.reconciliationRequired ? (
                            <button
                              type="button"
                              onClick={() => void handleRetryDelivery(delivery._id, post._id)}
                              disabled={busyId === post._id}
                              className="rounded-2xl border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800"
                            >
                              Retry Dispatch
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate(post._id, 'published')}
                        disabled={busyId === post._id}
                        className="admin-shell-toolbar-btn rounded-2xl px-3 py-2 text-xs font-semibold"
                      >
                        Mark Published
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStatusUpdate(post._id, 'failed')}
                        disabled={busyId === post._id}
                        className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                      >
                        Mark Failed
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
