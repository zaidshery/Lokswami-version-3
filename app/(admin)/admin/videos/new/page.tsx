'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  FileText,
  Image as ImageIcon,
  Loader2,
  Play,
  Radio,
  Send,
  Upload,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { isAdminRole } from '@/lib/auth/roles';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import {
  CmsEditorCanvas,
  CmsEditorColumns,
  CmsEditorMain,
  CmsEditorSidebar,
} from '@/components/admin/CmsEditorLayout';
import { AdminMediaImage } from '@/components/admin/AdminMediaImage';
import SwipeReadinessChecklist from '@/components/admin/SwipeReadinessChecklist';
import {
  buildYouTubeEmbedUrl,
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  isYouTubeLiveUrl,
} from '@/lib/utils/youtube';
import { uploadFileToSignedUrl, validateStoryVideoFile } from '@/lib/utils/storyVideoUploadClient';

const categories = NEWS_CATEGORIES.map((category) => category.nameEn);
const THUMBNAIL_MAX_SIZE = 10 * 1024 * 1024;
const THUMBNAIL_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

interface VideoFormData {
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  duration: string;
  category: string;
  isShort: boolean;
  shortsRank: string;
  slug: string;
  articleId: string;
  aspectRatio: '9:16' | '16:9' | '1:1' | 'unknown';
  captionUrl: string;
  transcript: string;
  instagramUrl: string;
  youtubeUrl: string;
}

type VideoCreateIntent = 'draft' | 'submit' | 'publish';

const initialFormData: VideoFormData = {
  title: '',
  description: '',
  thumbnail: '',
  videoUrl: '',
  duration: '',
  category: 'National',
  isShort: false,
  shortsRank: '0',
  slug: '',
  articleId: '',
  aspectRatio: '9:16',
  captionUrl: '',
  transcript: '',
  instagramUrl: '',
  youtubeUrl: '',
};

function isPdfUrl(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('data:application/pdf') || normalized.endsWith('.pdf');
}

function isAllowedThumbnailFile(file: File) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'application/pdf' ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.pdf')
  );
}

export default function CreateVideoPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [formData, setFormData] = useState<VideoFormData>(initialFormData);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [runningIntent, setRunningIntent] = useState<VideoCreateIntent | ''>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const detectedYouTubeId = useMemo(
    () => extractYouTubeVideoId(formData.videoUrl),
    [formData.videoUrl]
  );
  const isLiveStream = useMemo(
    () => isYouTubeLiveUrl(formData.videoUrl),
    [formData.videoUrl]
  );

  const previewThumbnailSrc = useMemo(() => {
    if (thumbnailPreview) return thumbnailPreview;
    if (formData.thumbnail) return formData.thumbnail;
    if (detectedYouTubeId) return getYouTubeThumbnail(formData.videoUrl);
    return '';
  }, [thumbnailPreview, formData.thumbnail, detectedYouTubeId, formData.videoUrl]);

  const hasPdfThumbnail = useMemo(() => {
    if (thumbnailFile) {
      return (
        thumbnailFile.type === 'application/pdf' ||
        thumbnailFile.name.toLowerCase().endsWith('.pdf')
      );
    }
    return isPdfUrl(formData.thumbnail);
  }, [thumbnailFile, formData.thumbnail]);

  const role = session?.user?.role;
  const canPublishNow = role === 'admin' || role === 'super_admin';
  const canUseDesk = isAdminRole(role);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]:
          type === 'checkbox'
            ? (e.target as HTMLInputElement).checked
            : value,
      };

      if (name === 'videoUrl') {
        const live = isYouTubeLiveUrl(value);
        if (live && !next.duration) {
          next.duration = '0';
        }
      }

      return next;
    });
  };

  const handleThumbnailFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAllowedThumbnailFile(file)) {
      setError('Thumbnail must be a JPG, JPEG, PNG, or PDF file');
      return;
    }

    if (file.size > THUMBNAIL_MAX_SIZE) {
      setError('Thumbnail file size must be less than 10MB');
      return;
    }

    setError('');
    setThumbnailFile(file);
    setFormData((prev) => ({ ...prev, thumbnail: '' }));

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setThumbnailPreview('');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setThumbnailPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadThumbnail = async (): Promise<string> => {
    if (!thumbnailFile) {
      return formData.thumbnail.trim();
    }

    setIsUploadingThumbnail(true);
    try {
      const body = new FormData();
      body.append('file', thumbnailFile);
      body.append('purpose', 'video-thumbnail');

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
        },
        body,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload thumbnail');
      }

      return String(data.data?.url || '');
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const uploadDirectVideo = async (): Promise<string> => {
    if (!videoFile) return formData.videoUrl.trim();
    const validationError = validateStoryVideoFile(videoFile);
    if (validationError) throw new Error(validationError);

    const initResponse = await fetch('/api/admin/uploads/story-video/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        fileName: videoFile.name,
        fileType: videoFile.type || 'video/mp4',
        fileSize: videoFile.size,
        storyId: formData.slug.trim() || 'swipe-news',
      }),
    });
    const initPayload = await initResponse.json();
    if (!initResponse.ok || !initPayload.success) {
      throw new Error(initPayload.error || 'Failed to initialize direct video upload');
    }

    await uploadFileToSignedUrl({
      file: videoFile,
      uploadUrl: String(initPayload.data.uploadUrl),
      uploadHeaders: initPayload.data.uploadHeaders || { 'Content-Type': 'video/mp4' },
      onProgress: setVideoUploadProgress,
    });

    const completeResponse = await fetch('/api/admin/uploads/story-video/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        mediaKey: initPayload.data.mediaKey,
        expectedSize: videoFile.size,
        expectedFileType: videoFile.type || 'video/mp4',
        expectedFileName: videoFile.name,
      }),
    });
    const completePayload = await completeResponse.json();
    if (!completeResponse.ok || !completePayload.success) {
      throw new Error(completePayload.error || 'Failed to verify direct video upload');
    }
    return String(completePayload.data.mediaUrl || initPayload.data.mediaUrl || '').trim();
  };

  const handleSubmit = async (intent: VideoCreateIntent) => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    setRunningIntent(intent);

    try {
      if (
        !formData.title.trim() ||
        !formData.description.trim() ||
        (!formData.videoUrl.trim() && !videoFile) ||
        !formData.category
      ) {
        setError('Please fill in all required fields');
        return;
      }

      const resolvedVideoUrl = await uploadDirectVideo();
      const youtubeId = extractYouTubeVideoId(resolvedVideoUrl);
      const isDirectMp4 = /^https:\/\/[^\s]+\.mp4(?:[?#].*)?$/i.test(resolvedVideoUrl);
      if (!youtubeId && !isDirectMp4) {
        setError('Please enter a valid YouTube URL or HTTPS MP4 playback URL');
        return;
      }

      if (
        intent === 'publish' &&
        formData.isShort &&
        (!formData.articleId.trim() || formData.aspectRatio !== '9:16')
      ) {
        setError('Publishing Swipe News requires a related article and 9:16 vertical media.');
        return;
      }

      const parsedDuration = Number.parseInt(formData.duration || '0', 10);
      const isLive = isYouTubeLiveUrl(resolvedVideoUrl);
      const duration = Number.isFinite(parsedDuration) && parsedDuration >= 0
        ? parsedDuration
        : isLive ? 0 : 60;

      const shortsRank = Number.parseInt(formData.shortsRank || '0', 10);
      if (!Number.isFinite(shortsRank)) {
        setError('Shorts rank must be a valid number');
        return;
      }

      let thumbnail = await uploadThumbnail();
      if (!thumbnail.trim()) {
        thumbnail = getYouTubeThumbnail(resolvedVideoUrl);
      }

      if (!thumbnail.trim()) {
        setError('Please provide a thumbnail (upload or URL)');
        return;
      }

      const response = await fetch('/api/admin/videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
          thumbnail: thumbnail.trim(),
          videoUrl: resolvedVideoUrl,
          duration,
          category: formData.category,
          isShort: formData.isShort,
          shortsRank: formData.isShort ? shortsRank : 0,
          slug: formData.slug.trim(),
          articleId: formData.articleId.trim(),
          posterUrl: thumbnail.trim(),
          playbackUrl: resolvedVideoUrl,
          aspectRatio: formData.aspectRatio,
          captionUrl: formData.captionUrl.trim(),
          transcript: formData.transcript.trim(),
          processingStatus: 'ready',
          instagramUrl: formData.instagramUrl.trim(),
          youtubeUrl: formData.youtubeUrl.trim(),
          intent,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create video');
      }

      setSuccess(
        intent === 'draft'
          ? 'Video draft saved successfully.'
          : intent === 'submit'
            ? 'Video submitted for review.'
            : 'Video published successfully.'
      );
      setFormData(initialFormData);
      setThumbnailFile(null);
      setThumbnailPreview('');

      setTimeout(() => {
        router.push('/admin/videos');
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create video');
    } finally {
      setIsLoading(false);
      setRunningIntent('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Link
        href="/admin/videos"
        className="mb-6 inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-5 w-5" />
        Back to Videos
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <CmsEditorCanvas>
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <h1 className="mb-2 text-3xl font-bold text-gray-900">Add New Video / Live Stream</h1>
            <p className="mb-6 text-gray-600">
              Create a new video, upload YouTube Live stream, or vertical Short for Lokswami Video Desk.
            </p>

            {error && (
              <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-700">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-6 flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-700">
                <CheckCircle className="h-5 w-5 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit(canPublishNow ? 'publish' : 'submit');
              }}
            >
              <CmsEditorColumns>
                <CmsEditorMain className="space-y-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      placeholder="Enter video or live stream title"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Video or live stream description"
                      rows={4}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-900">
                        Video URL (YouTube or HTTPS MP4)
                      </label>
                      <input
                        type="url"
                        name="videoUrl"
                        value={formData.videoUrl}
                        onChange={handleInputChange}
                        placeholder="https://youtube.com/shorts/... or https://cdn.example.com/video.mp4"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      />
                      <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 text-sm font-medium text-gray-700">
                        {videoFile ? videoFile.name : 'Or upload an MP4 directly to DigitalOcean Spaces'}
                        <input
                          type="file"
                          accept="video/mp4,.mp4"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            if (file) {
                              const validationError = validateStoryVideoFile(file);
                              if (validationError) {
                                setError(validationError);
                                return;
                              }
                            }
                            setError('');
                            setVideoFile(file);
                            setVideoUploadProgress(0);
                          }}
                        />
                      </label>
                      {videoUploadProgress > 0 ? (
                        <div className="mt-2" aria-live="polite">
                          <div className="h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-red-600" style={{ width: `${videoUploadProgress}%` }} /></div>
                          <p className="mt-1 text-xs text-gray-600">Video upload {videoUploadProgress}%</p>
                        </div>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {detectedYouTubeId ? (
                          isLiveStream ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                              <Radio className="h-3 w-3 animate-pulse" />
                              🔴 YouTube Live Stream Detected ({detectedYouTubeId})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                              <Play className="h-3 w-3" />
                              ▶️ YouTube Video Detected ({detectedYouTubeId})
                            </span>
                          )
                        ) : (
                          <p className="text-xs text-gray-500">
                            Supports YouTube Live streams (`youtube.com/live/...`), standard videos (`watch?v=...`, `youtu.be/...`), and Shorts (`youtube.com/shorts/...`).
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-900">
                        Thumbnail URL (optional)
                      </label>
                      <input
                        type="url"
                        name="thumbnail"
                        value={formData.thumbnail}
                        onChange={handleInputChange}
                        placeholder="https://example.com/thumbnail.jpg"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Leave empty to auto-extract YouTube thumbnail.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Upload Custom Thumbnail File (JPG/JPEG/PNG/PDF)
                    </label>
                    <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-4 py-5 transition-colors hover:border-primary-600 hover:bg-gray-50">
                      <span className="flex flex-col items-center gap-1 text-center">
                        <ImageIcon className="h-5 w-5 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">
                          Click to upload thumbnail file
                        </span>
                        <span className="text-xs text-gray-500">JPG/JPEG/PNG/PDF up to 10MB</span>
                      </span>
                      <input
                        type="file"
                        accept={THUMBNAIL_ACCEPT}
                        onChange={handleThumbnailFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-900">
                        Duration (seconds) {isLiveStream ? <span className="text-xs font-normal text-gray-500">(0 = Live Stream)</span> : <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="number"
                        name="duration"
                        value={formData.duration}
                        onChange={handleInputChange}
                        placeholder={isLiveStream ? "0" : "60"}
                        min="0"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                        required={!isLiveStream}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-900">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleInputChange}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-900">
                        Shorts Rank (high = first)
                      </label>
                      <input
                        type="number"
                        name="shortsRank"
                        value={formData.shortsRank}
                        onChange={handleInputChange}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                        disabled={!formData.isShort}
                      />
                    </div>
                  </div>
                </CmsEditorMain>

                <CmsEditorSidebar>
                  {!canUseDesk ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                      Your session is still loading role permissions. Publishing actions may stay hidden until it resolves.
                    </div>
                  ) : null}

                  {/* 📺 Live In-Editor Video Stream Preview */}
                  {detectedYouTubeId ? (
                    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 shadow-md">
                      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">
                        <span className="flex items-center gap-1.5">
                          {isLiveStream ? (
                            <span className="flex items-center gap-1 text-red-400">
                              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                              LIVE STREAM PREVIEW
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-zinc-200">
                              <Play className="h-3.5 w-3.5 text-red-500 fill-red-500" />
                              YOUTUBE VIDEO PREVIEW
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">{detectedYouTubeId}</span>
                      </div>
                      <div className="relative aspect-video w-full">
                        <iframe
                          src={buildYouTubeEmbedUrl(detectedYouTubeId, {
                            playsinline: true,
                            controls: true,
                            isLive: isLiveStream,
                          })}
                          title="CMS Live Video Preview"
                          className="h-full w-full border-0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  ) : previewThumbnailSrc ? (
                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                      {hasPdfThumbnail ? (
                        <div className="flex h-44 flex-col items-center justify-center gap-2 bg-gray-50 px-4 text-center">
                          <FileText className="h-8 w-8 text-red-600" />
                          <p className="text-sm font-semibold text-gray-800">PDF thumbnail selected</p>
                          <p className="text-xs text-gray-500">
                            {thumbnailFile ? thumbnailFile.name : 'PDF URL provided'}
                          </p>
                        </div>
                      ) : (
                        <AdminMediaImage
                          src={previewThumbnailSrc}
                          alt="Thumbnail preview"
                          className="h-48 w-full object-cover"
                        />
                      )}
                    </div>
                  ) : null}

                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <label className="flex cursor-pointer items-center justify-between gap-4">
                      <span className="text-sm font-medium text-gray-900">Use this video in Shorts mode</span>
                      <input
                        type="checkbox"
                        name="isShort"
                        checked={formData.isShort}
                        onChange={handleInputChange}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                      />
                    </label>
                  </div>

                  {formData.isShort ? (
                    <div className="space-y-4 rounded-lg border border-red-200 bg-red-50/50 p-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">Swipe News publishing</h3>
                        <p className="mt-1 text-xs leading-5 text-gray-600">
                          These fields power the public Swipe URL, quick-article button, captions, and social attribution. A related article and 9:16 media are required to publish.
                        </p>
                      </div>
                      <SwipeReadinessChecklist
                        slug={formData.slug}
                        articleId={formData.articleId}
                        posterReady={Boolean(thumbnailFile || formData.thumbnail.trim())}
                        mediaReady={Boolean(videoFile || formData.videoUrl.trim())}
                        aspectRatio={formData.aspectRatio}
                      />
                      <label className="block text-sm font-medium text-gray-900">
                        Swipe slug
                        <input name="slug" value={formData.slug} onChange={handleInputChange} placeholder="indore-breaking-news" className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                      </label>
                      <label className="block text-sm font-medium text-gray-900">
                        Related published article ID or slug
                        <input name="articleId" value={formData.articleId} onChange={handleInputChange} placeholder="article-id-or-slug" className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                        <span className="mt-1 block text-xs text-gray-600">This opens “पूरी खबर पढ़ें” on the public Swipe screen.</span>
                      </label>
                      <label className="block text-sm font-medium text-gray-900">
                        Media aspect ratio
                        <select name="aspectRatio" value={formData.aspectRatio} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
                          <option value="9:16">9:16 vertical — Swipe ready</option>
                          <option value="16:9">16:9 landscape — Videos library only</option>
                          <option value="1:1">1:1 square — Videos library only</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-gray-900">
                        Caption file URL
                        <input name="captionUrl" value={formData.captionUrl} onChange={handleInputChange} placeholder="https://cdn.example.com/captions.vtt" className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                      </label>
                      <label className="block text-sm font-medium text-gray-900">
                        Transcript
                        <textarea name="transcript" value={formData.transcript} onChange={handleInputChange} rows={4} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-gray-900">Instagram URL<input name="instagramUrl" value={formData.instagramUrl} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
                        <label className="block text-sm font-medium text-gray-900">YouTube URL<input name="youtubeUrl" value={formData.youtubeUrl} onChange={handleInputChange} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2" /></label>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                    Draft keeps the video private, submit sends it into review, and publish is only shown for desk roles with release authority.
                  </div>

                  <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <button
                      type="button"
                      disabled={isLoading || isUploadingThumbnail}
                      onClick={() => void handleSubmit('draft')}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runningIntent === 'draft' ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5" />
                          Save Draft
                        </>
                      )}
                    </button>

                    <button
                      type="submit"
                      disabled={isLoading || isUploadingThumbnail}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-spanish-red px-5 py-3 font-medium text-white transition-colors hover:bg-guardsman-red disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {runningIntent === 'submit' ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5" />
                          Submit For Review
                        </>
                      )}
                    </button>

                    {canPublishNow ? (
                      <button
                        type="button"
                        disabled={isLoading || isUploadingThumbnail}
                        onClick={() => void handleSubmit('publish')}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {runningIntent === 'publish' ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Publishing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-5 w-5" />
                            Publish Now
                          </>
                        )}
                      </button>
                    ) : null}

                    <Link
                      href="/admin/videos"
                      className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-5 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
                    >
                      Cancel
                    </Link>
                  </div>
                </CmsEditorSidebar>
              </CmsEditorColumns>
            </form>
          </div>
        </CmsEditorCanvas>
      </motion.div>
    </div>
  );
}
