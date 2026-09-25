"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  Film,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import {
  canDeleteContent,
  type PermissionUser,
} from '@/lib/auth/permissions';
import { isAdminRole, isReporterDeskRole } from '@/lib/auth/roles';
import { AdminMediaImage } from '@/components/admin/AdminMediaImage';

interface MediaItem {
  _id: string;
  filename: string;
  url: string;
  type: string;
  uploadedBy?: string;
  createdAt?: string;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const PANEL_CLASS =
  'admin-shell-surface-strong rounded-[30px] p-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.22)] dark:shadow-[0_28px_90px_-52px_rgba(0,0,0,0.45)]';

const SOFT_CARD_CLASS =
  'admin-shell-surface-muted rounded-[24px] p-4 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.14)] dark:shadow-[0_18px_48px_-40px_rgba(0,0,0,0.35)]';

const METRIC_CARD_CLASS =
  'admin-shell-surface rounded-[26px] p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.16)] dark:shadow-[0_22px_70px_-46px_rgba(0,0,0,0.38)]';

const EMPTY_STATE_CLASS =
  'rounded-[24px] border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] p-6 text-sm leading-6 text-[color:var(--admin-shell-text-muted)]';

const META_CHIP_CLASS =
  'admin-shell-surface inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--admin-shell-text-muted)]';

const SECONDARY_BUTTON_CLASS =
  'admin-shell-toolbar-btn inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60';

const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200';

const DANGER_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20';

function formatKindLabel(type: string) {
  if (type.startsWith('image')) return 'Image';
  if (type.startsWith('video')) return 'Video';
  return 'File';
}

export default function MediaLibrary() {
  const { data: session } = useSession();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeDeleteId, setActiveDeleteId] = useState<string | null>(null);
  const adminRole = isAdminRole(session?.user?.role) ? session.user.role : null;

  const permissionUser = useMemo<PermissionUser | null>(() => {
    const sessionUser = session?.user;
    const email = sessionUser?.email?.trim() || '';
    const role = sessionUser?.role;

    if (!sessionUser || !email || !isAdminRole(role)) {
      return null;
    }

    return {
      id: sessionUser.userId || sessionUser.id || email,
      email,
      name: sessionUser.name?.trim() || email.split('@')[0] || 'Admin',
      role,
    };
  }, [session]);

  const isReporterView = isReporterDeskRole(adminRole);
  const canDeleteMedia = canDeleteContent(permissionUser);
  const libraryBadge = isReporterView ? 'Your Uploads' : 'Media Control';
  const libraryTitle = isReporterView ? 'My Media' : 'Media Library';
  const libraryDescription = isReporterView
    ? 'Upload and review the image assets you filed for your reporting work. Only media uploaded by you appears here.'
    : 'Upload, review, and clean shared image and video assets from one calmer library surface built for newsroom operations.';
  const uploadWorkspaceTitle = isReporterView ? 'Your Upload Desk' : 'Upload Workspace';
  const uploadWorkspaceDescription = isReporterView
    ? 'Image uploads only. MP4 story videos stay inside each story draft.'
    : 'Image uploads desk. MP4 story videos and standalone videos are handled via dedicated editors.';
  const refreshLabel = isReporterView ? 'Refresh My Uploads' : 'Refresh Library';
  const assetsLabel = isReporterView ? 'Your Assets' : 'Assets';
  const totalAssetsLabel = isReporterView ? 'Your Assets' : 'Total Assets';
  const imageAssetsLabel = isReporterView ? 'Your Images' : 'Image Assets';
  const videoAssetsLabel = isReporterView ? 'Your Videos' : 'Video Assets';
  const totalAssetsDescription = isReporterView
    ? 'Media you uploaded for your reporting workflow.'
    : 'Shared items currently available to newsroom workflows.';
  const imageAssetsDescription = isReporterView
    ? 'Photos and visual uploads filed from your desk.'
    : 'Thumbnails, story cards, and general visual assets.';
  const videoAssetsDescription = isReporterView
    ? 'Previously uploaded reporter video assets still stored in your library.'
    : 'Motion assets available for video and multimedia surfaces.';
  const uploadInputAccept = 'image/*';
  const uploadPromptLabel = 'Choose image to upload';

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/media', {
        headers: {
          ...getAuthHeader(),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load media');
      }
      setMedia(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMedia();
  }, [fetchMedia]);

  const selectedFileSummary = useMemo(() => {
    if (!file) return null;
    return {
      name: file.name,
      sizeMb: (file.size / (1024 * 1024)).toFixed(2),
      type: formatKindLabel(file.type),
    };
  }, [file]);

  const imageCount = useMemo(
    () => media.filter((item) => item.type.startsWith('image')).length,
    [media]
  );

  const videoCount = useMemo(
    () => media.filter((item) => item.type.startsWith('video')).length,
    [media]
  );

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;

    if (nextFile && !nextFile.type.startsWith('image/')) {
      setFile(null);
      setError('Media desk uploads are restricted to images. Attach MP4 video clips directly inside story drafts or create standalone videos in Videos desk.');
      setSuccess('');
      event.target.value = '';
      return;
    }

    setFile(nextFile);
    setError('');
    setSuccess('');
  };

  const upload = async () => {
    if (!file) {
      setError('Select a file before uploading.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('ownerType', 'library');
      if (isReporterView) {
        fd.append('purpose', 'image');
      }

      const uploadRes = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
        },
        body: fd,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || 'Upload failed');
      }

      setFile(null);
      setSuccess('Media uploaded successfully.');
      const input = document.getElementById('media-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await fetchMedia();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload media');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    setActiveDeleteId(id);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/admin/media/${id}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeader(),
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to delete media');
      }

      setSuccess('Media item deleted.');
      await fetchMedia();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete media');
    } finally {
      setActiveDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[36px] border border-[color:var(--admin-shell-border)] bg-[radial-gradient(circle_at_top_left,rgba(185,28,28,0.10),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.08),transparent_28%),var(--admin-bg-depth)] p-8 text-[color:var(--admin-shell-text)] shadow-[var(--admin-shell-shadow-strong)] lg:p-10">
        <div className="pointer-events-none absolute -right-10 top-0 h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl dark:bg-fuchsia-500/14" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/14" />
        <div className="relative grid gap-8 xl:grid-cols-[1.15fr,0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-red-600 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
              {libraryBadge}
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-[color:var(--admin-shell-text)] sm:text-5xl">
              {libraryTitle}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--admin-shell-text-muted)] sm:text-[15px]">
              {libraryDescription}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className={META_CHIP_CLASS}>
                <span>{assetsLabel}</span>
                <strong className="text-[color:var(--admin-shell-text)]">{media.length}</strong>
              </div>
              <div className={META_CHIP_CLASS}>
                <span>Images</span>
                <strong className="text-[color:var(--admin-shell-text)]">{imageCount}</strong>
              </div>
              {!isReporterView ? (
                <div className={META_CHIP_CLASS}>
                  <span>Videos</span>
                  <strong className="text-[color:var(--admin-shell-text)]">{videoCount}</strong>
                </div>
              ) : null}
            </div>
          </div>

          <div className={PANEL_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">
              {uploadWorkspaceTitle}
            </p>
            <div className="mt-4 space-y-4">
              <label
                htmlFor="media-file"
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-[color:var(--admin-shell-border-strong)] bg-[color:var(--admin-shell-surface-muted)] px-6 py-8 text-center transition-colors hover:border-[color:var(--admin-shell-border)] hover:bg-[color:var(--admin-shell-surface)]"
              >
                <Upload className="h-6 w-6 text-zinc-500 dark:text-zinc-300" />
                <div>
                  <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">
                    {uploadPromptLabel}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">
                    {uploadWorkspaceDescription}
                  </p>
                </div>
              </label>
              <input
                id="media-file"
                type="file"
                accept={uploadInputAccept}
                onChange={handleFile}
                className="sr-only"
              />

              {selectedFileSummary ? (
                <div className={SOFT_CARD_CLASS}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={META_CHIP_CLASS}>{selectedFileSummary.type}</span>
                    <span className="text-sm font-medium text-[color:var(--admin-shell-text)]">
                      {selectedFileSummary.name}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-[color:var(--admin-shell-text-muted)]">
                    {`Ready to upload · ${selectedFileSummary.sizeMb} MB`}
                  </p>
                </div>
              ) : (
                <div className={EMPTY_STATE_CLASS}>
                  {isReporterView
                    ? 'No file selected yet. Pick an image asset to start the upload flow.'
                    : 'No file selected yet. Pick an asset to start the upload flow.'}
                </div>
              )}

              {isReporterView ? (
                <div className={EMPTY_STATE_CLASS}>
                  Only your uploads are visible here. Asset cleanup stays with desk admins so published work is not removed by mistake.
                </div>
              ) : null}

              <div className="rounded-[20px] border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-[color:var(--admin-shell-text-muted)]">
                <span className="font-semibold text-[color:var(--admin-shell-text)]">Video Workflows: </span>
                Production MP4 masters and clips are attached directly inside{' '}
                <Link href="/admin/stories" className="font-medium text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
                  Stories
                </Link>{' '}
                or created as standalone clips in{' '}
                <Link href="/admin/videos/new" className="font-medium text-blue-600 underline hover:text-blue-500 dark:text-blue-400">
                  Videos Desk
                </Link>.
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void upload()}
                  disabled={loading || !file}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload Asset
                </button>
                <button
                  type="button"
                  onClick={() => void fetchMedia()}
                  disabled={loading}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
                  {refreshLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div role="alert" aria-live="assertive" className="flex items-start gap-2 rounded-[20px] border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div role="status" aria-live="polite" className="flex items-start gap-2 rounded-[20px] border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Upload className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      ) : null}

      <div className={cx('grid grid-cols-1 gap-4', isReporterView ? 'md:grid-cols-2' : 'md:grid-cols-3')}>
        <div className={METRIC_CARD_CLASS}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">
            {totalAssetsLabel}
          </p>
          <p className="mt-4 text-4xl font-black tracking-tight text-[color:var(--admin-shell-text)]">
            {media.length}
          </p>
          <p className="mt-3 text-sm text-[color:var(--admin-shell-text-muted)]">
            {totalAssetsDescription}
          </p>
        </div>
        <div className={METRIC_CARD_CLASS}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">
            {imageAssetsLabel}
          </p>
          <p className="mt-4 text-4xl font-black tracking-tight text-[color:var(--admin-shell-text)]">
            {imageCount}
          </p>
          <p className="mt-3 text-sm text-[color:var(--admin-shell-text-muted)]">
            {imageAssetsDescription}
          </p>
        </div>
        {!isReporterView ? (
          <div className={METRIC_CARD_CLASS}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">
              {videoAssetsLabel}
            </p>
            <p className="mt-4 text-4xl font-black tracking-tight text-[color:var(--admin-shell-text)]">
              {videoCount}
            </p>
            <p className="mt-3 text-sm text-[color:var(--admin-shell-text-muted)]">
              {videoAssetsDescription}
            </p>
          </div>
        ) : null}
      </div>

      {loading && media.length === 0 ? (
        <div className={cx(PANEL_CLASS, 'flex items-center justify-center py-16')}>
          <Loader2 className="h-6 w-6 animate-spin text-red-600 dark:text-red-300" />
        </div>
      ) : media.length === 0 ? (
        <div className={cx(PANEL_CLASS, 'py-16 text-center')}>
          <ImageIcon className="mx-auto mb-3 h-10 w-10 text-zinc-400" />
          <p className="text-sm text-[color:var(--admin-shell-text-muted)]">
            {isReporterView ? 'You have not uploaded any media yet.' : 'No media has been uploaded yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {media.map((item, index) => {
            const isImage = item.type.startsWith('image');
            const isVideo = item.type.startsWith('video');

            return (
              <motion.article
                key={item._id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className="admin-shell-surface-strong rounded-[30px] p-5 shadow-[0_22px_70px_-48px_rgba(15,23,42,0.18)] dark:shadow-[0_26px_76px_-46px_rgba(0,0,0,0.42)]"
              >
                <div className="relative overflow-hidden rounded-[22px] bg-zinc-100 dark:bg-zinc-900">
                  <div className="aspect-[4/3]">
                    {isImage ? (
                      <AdminMediaImage src={item.url} alt={item.filename} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        {isVideo ? (
                          <Film className="h-10 w-10 text-zinc-400 dark:text-zinc-500" />
                        ) : (
                          <ImageIcon className="h-10 w-10 text-zinc-400 dark:text-zinc-500" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="absolute left-3 top-3">
                    <span className={META_CHIP_CLASS}>{formatKindLabel(item.type)}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-[color:var(--admin-shell-text)]">
                      {item.filename}
                    </h2>
                    <p className="mt-2 break-all text-xs leading-5 text-[color:var(--admin-shell-text-muted)]">
                      {item.url}
                    </p>
                  </div>

                  {canDeleteMedia ? (
                    <button
                      type="button"
                      onClick={() => void remove(item._id)}
                      disabled={activeDeleteId === item._id}
                      className={DANGER_BUTTON_CLASS}
                      aria-label={`Delete ${item.filename}`}
                    >
                      {activeDeleteId === item._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
}
