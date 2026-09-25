'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Image as ImageIcon,
  Loader2,
  Play,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/auth/clientToken';
import { isAdminRole, isReporterDeskRole } from '@/lib/auth/roles';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import {
  countStoryMediaAssets,
  createStoryMediaAsset,
  derivePrimaryStoryMedia,
  getTotalStoryVideoBytes,
  validateStoryMediaAssets,
  type StoryMediaAsset,
} from '@/lib/content/storyMedia';
import { useAppStore } from '@/lib/store/appStore';
import {
  formatStoryVideoSize,
  getStoryVideoDisplayName,
  uploadFileToSignedUrl,
  validateStoryVideoFile,
} from '@/lib/utils/storyVideoUploadClient';
import {
  CmsEditorCanvas,
  CmsEditorColumns,
  CmsEditorMain,
  CmsEditorSidebar,
} from '@/components/admin/CmsEditorLayout';
import { AdminMediaImage } from '@/components/admin/AdminMediaImage';

interface StoryFormData {
  title: string;
  caption: string;
  thumbnail: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  mediaKey: string;
  mediaSizeBytes: number;
  mediaMimeType: string;
  storageProvider: string;
  linkUrl: string;
  linkLabel: string;
  category: string;
  author: string;
  locationTag: string;
  sourceInfo: string;
  sourceConfidential: boolean;
  reporterNotes: string;
  durationSeconds: string;
  priority: string;
}

type StoryCreateIntent = 'draft' | 'submit' | 'publish';
type PreviewAssetState = {
  asset: StoryMediaAsset;
  title: string;
};

const categories = ['General', ...NEWS_CATEGORIES.map((category) => category.nameEn)];
const THUMBNAIL_MAX_SIZE = 5 * 1024 * 1024;
const SPACES_STORAGE_PROVIDER = 'do-spaces';
const THUMBNAIL_INPUT_ID = 'story-thumbnail-upload-input';
const VIDEO_INPUT_ID = 'story-video-upload-input';
const STORY_IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
const STORY_VIDEO_ACCEPT = 'video/mp4,.mp4';

function truncateMediaLabel(value: string, maxLength = 16) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trim()}...`;
}

function getMediaAssetLabel(asset: StoryMediaAsset) {
  const fallback =
    asset.kind === 'video'
      ? getStoryVideoDisplayName(asset.url)
      : `image-${asset.order + 1}`;

  return asset.originalFileName || fallback;
}

type StoryMediaTileProps = {
  asset: StoryMediaAsset;
  kindLabel: string;
  replaceLabel: string;
  removeLabel: string;
  replaceInputId: string;
  accept: string;
  onPreview: () => void;
  onReplace: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onRemove: () => void;
};

function StoryMediaTile({
  asset,
  kindLabel,
  replaceLabel,
  removeLabel,
  replaceInputId,
  accept,
  onPreview,
  onReplace,
  onRemove,
}: StoryMediaTileProps) {
  const label = getMediaAssetLabel(asset);
  const sizeLabel = formatStoryVideoSize(asset.sizeBytes);

  return (
    <div className="w-20 shrink-0 sm:w-24">
      <button
        type="button"
        onClick={onPreview}
        className="group relative block aspect-square w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
        title={label}
      >
        {asset.kind === 'image' ? (
          <AdminMediaImage
            src={asset.url}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <>
            <video
              src={asset.url}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full bg-black object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/15">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
                <Play className="h-4 w-4 fill-current" />
              </span>
            </div>
          </>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2 pb-2 pt-6 text-left">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-white/90">
            {kindLabel}
          </span>
          <span className="block truncate text-[10px] text-white/80">{sizeLabel}</span>
        </div>
      </button>

      <div className="mt-2 space-y-1">
        <p className="truncate text-[11px] font-medium text-gray-700" title={label}>
          {truncateMediaLabel(label)}
        </p>
        <div className="flex items-center gap-1">
          <label
            htmlFor={replaceInputId}
            className="flex-1 cursor-pointer rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-[10px] font-semibold text-gray-700 transition-colors hover:bg-gray-100"
          >
            {replaceLabel}
          </label>
          <input
            id={replaceInputId}
            type="file"
            accept={accept}
            className="hidden"
            onChange={onReplace}
          />
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
            aria-label={removeLabel}
            title={removeLabel}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function isAllowedImageFile(file: File) {
  const mime = file.type.trim().toLowerCase();
  return (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'image/webp'
  );
}

const REPORTER_COPY = {
  en: {
    back: 'Back to Stories',
    pageTitle: 'Create Story',
    pageSubtitle: 'Add a short title, body, photos or videos, then send it to the desk.',
    roleLoading: 'Your session is still loading role permissions. Publishing actions may stay hidden until it resolves.',
    sections: {
      media: 'Add Media',
      story: 'Story Details',
      source: 'Source & Notes',
      uploadSummary: 'Uploaded Files',
    },
    fields: {
      title: 'Story Title',
      caption: 'Body',
      category: 'Category',
      storyType: 'Story Type',
      thumbnailUrl: 'Thumbnail URL (optional if file upload used)',
      thumbnailUpload: 'Photo / Thumbnail',
      videoUpload: 'Story Video (MP4)',
      linkUrl: 'Link URL (optional)',
      linkLabel: 'Link Label',
      author: 'Author',
      duration: 'Duration (sec)',
      priority: 'Priority',
      locationTag: 'Location Tag',
      reporterNotes: 'Reporter Notes',
      sourceInfo: 'Source Info',
      sourceConfidential: 'Source is confidential and should remain internal',
    },
    placeholders: {
      title: 'Headline for visual story',
      caption: 'Write the story details for the copy editor',
      thumbnailUrl: 'https://example.com/story-thumbnail.jpg',
      linkUrl: '/main/article/123 or https://...',
      linkLabel: 'Read Full Story',
      locationTag: 'Bhopal, MP',
      reporterNotes: 'Editing notes, verification context, or publishing hints.',
      sourceInfo: 'Who supplied this story, clip, or visual?',
    },
    media: {
      thumbnailHelp: 'JPG, PNG, or WEBP up to 5MB',
      videoHelp: 'Uploads go directly to DigitalOcean Spaces. Allowed size: up to 1.9 GB per video with no total story upload limit.',
      selectPhoto: 'Select photo',
      selectVideo: 'Select MP4 video',
      uploadVideoInProgress: 'Uploading video...',
      phoneHint: 'Reporter uploads from phone or desktop work here.',
      uploadProgress: 'Upload progress',
      uploadedPhoto: 'Uploaded photo ready',
      uploadedVideo: 'Uploaded video ready',
      noFilesYet: 'Uploaded photo and video will appear here so the reporter can review, replace, or remove them.',
      imageCount: 'Images',
      videoCount: 'Videos',
      replace: 'Replace',
      remove: 'Delete',
      manualVideoUrl: 'Admins can still paste a manual video URL during the transition.',
    },
    helper: {
      sourceTitle: 'Source Information',
      sourceBody: 'Capture source and desk context before this story enters review.',
      draftNotice:
        'Draft keeps the story private, submit sends it into review, and publish is only shown for desk roles with release authority.',
    },
    actions: {
      saveDraft: 'Save Draft',
      savingDraft: 'Saving...',
      submit: 'Submit For Review',
      submitting: 'Submitting...',
      publish: 'Publish Now',
      publishing: 'Publishing...',
      cancel: 'Cancel',
    },
    status: {
      sessionRoleLoading: 'Your session is still loading role permissions. Publishing actions may stay hidden until it resolves.',
      videoReady: 'Video uploaded successfully. Save or submit the story to attach it.',
      draftSaved: 'Story draft saved successfully.',
      submitted: 'Story submitted for review.',
      published: 'Story published successfully.',
    },
    validation: {
      thumbnailImageOnly: 'Thumbnail must be an image file.',
      thumbnailTooLarge: 'Thumbnail image size must be less than 5MB.',
      titleRequired: 'Story title is required.',
      packageRequired: 'At least 1 image and 1 video are required. You can upload up to 5 images and 10 videos per story.',
      imageTypeInvalid: 'Photos must be JPG, PNG, or WEBP files.',
      imageLimitExceeded: 'You can upload up to 5 images per story.',
      videoLimitExceeded: 'You can upload up to 10 videos per story.',
      videoTotalSizeExceeded: 'There is no total video upload size limit per story.',
      waitForVideo: 'Please wait for all video uploads to finish.',
      thumbnailRequired: 'Please provide a story thumbnail.',
      durationInvalid: 'Duration must be between 2 and 180 seconds.',
      priorityInvalid: 'Priority must be a valid number.',
      videoRequired: 'Please upload a story video or provide a video URL.',
      createFailed: 'Failed to create story.',
      videoUploadFailed: 'Failed to upload video.',
      thumbnailUploadFailed: 'Failed to upload thumbnail.',
    },
  },
  hi: {
    back: 'स्टोरी सूची पर वापस जाएं',
    pageTitle: 'स्टोरी बनाएं',
    pageSubtitle: 'पहले मीडिया जोड़ें, फिर खबर लिखें और रिव्यू के लिए भेजें।',
    roleLoading: 'आपकी भूमिका की जानकारी लोड हो रही है। इसलिए Publish का विकल्प कुछ देर छिपा रह सकता है।',
    sections: {
      media: 'मीडिया जोड़ें',
      story: 'स्टोरी जानकारी',
      source: 'सोर्स और नोट्स',
      uploadSummary: 'अपलोड की गई फाइलें',
    },
    fields: {
      title: 'स्टोरी शीर्षक',
      caption: 'कैप्शन / स्क्रिप्ट',
      category: 'कैटेगरी',
      storyType: 'स्टोरी टाइप',
      thumbnailUrl: 'थंबनेल URL (यदि फाइल अपलोड न करें)',
      thumbnailUpload: 'फोटो / थंबनेल',
      videoUpload: 'स्टोरी वीडियो (MP4)',
      linkUrl: 'लिंक URL (वैकल्पिक)',
      linkLabel: 'लिंक लेबल',
      author: 'लेखक',
      duration: 'समय (सेकंड)',
      priority: 'प्राथमिकता',
      locationTag: 'लोकेशन',
      reporterNotes: 'रिपोर्टर नोट्स',
      sourceInfo: 'सोर्स जानकारी',
      sourceConfidential: 'यह सोर्स गोपनीय है और केवल अंदरूनी उपयोग के लिए है',
    },
    placeholders: {
      title: 'खबर का शीर्षक लिखें',
      caption: 'फुल स्क्रीन व्यू के लिए छोटी स्क्रिप्ट या संदर्भ लिखें',
      thumbnailUrl: 'https://example.com/story-thumbnail.jpg',
      linkUrl: '/main/article/123 या https://...',
      linkLabel: 'पूरी खबर पढ़ें',
      locationTag: 'भोपाल, म.प्र.',
      reporterNotes: 'एडिटिंग नोट्स, वेरिफिकेशन संदर्भ या पब्लिशिंग संकेत लिखें।',
      sourceInfo: 'यह खबर, वीडियो या फोटो किसने दिया है?',
    },
    media: {
      thumbnailHelp: 'JPG, PNG या WEBP, अधिकतम 5MB',
      videoHelp: 'वीडियो सीधे DigitalOcean Spaces पर जाएगा। हर वीडियो अधिकतम 1.9 GB तक हो सकता है और कुल स्टोरी अपलोड साइज पर कोई सीमा नहीं है।',
      selectPhoto: 'फोटो चुनें',
      selectVideo: 'MP4 वीडियो चुनें',
      uploadVideoInProgress: 'वीडियो अपलोड हो रहा है...',
      phoneHint: 'मोबाइल या डेस्कटॉप से रिपोर्टर यहीं वीडियो अपलोड कर सकते हैं।',
      uploadProgress: 'अपलोड प्रगति',
      uploadedPhoto: 'फोटो अपलोड हो गई',
      uploadedVideo: 'वीडियो अपलोड हो गई',
      noFilesYet: 'अपलोड की गई फोटो और वीडियो यहां दिखेंगी, ताकि रिपोर्टर उन्हें देख सके, बदल सके या हटा सके।',
      imageCount: 'फोटो',
      videoCount: 'वीडियो',
      replace: 'बदलिए',
      remove: 'हटाइए',
      manualVideoUrl: 'ट्रांजिशन के दौरान एडमिन अभी भी वीडियो URL पेस्ट कर सकते हैं।',
    },
    helper: {
      sourceTitle: 'सोर्स जानकारी',
      sourceBody: 'रिव्यू में भेजने से पहले सोर्स और डेस्क संदर्भ यहां दर्ज करें।',
      draftNotice:
        'ड्राफ्ट निजी रहता है, रिव्यू के लिए भेजने पर डेस्क में जाता है, और Publish केवल अधिकृत डेस्क रोल्स को दिखता है।',
    },
    actions: {
      saveDraft: 'ड्राफ्ट सेव करें',
      savingDraft: 'सेव हो रहा है...',
      submit: 'रिव्यू के लिए भेजें',
      submitting: 'भेजा जा रहा है...',
      publish: 'अभी प्रकाशित करें',
      publishing: 'प्रकाशित हो रहा है...',
      cancel: 'रद्द करें',
    },
    status: {
      sessionRoleLoading: 'आपकी भूमिका की जानकारी लोड हो रही है। इसलिए Publish का विकल्प कुछ देर छिपा रह सकता है।',
      videoReady: 'वीडियो अपलोड हो गई है। अब स्टोरी सेव करें या रिव्यू के लिए भेजें।',
      draftSaved: 'स्टोरी ड्राफ्ट सफलतापूर्वक सेव हो गया।',
      submitted: 'स्टोरी रिव्यू के लिए भेज दी गई।',
      published: 'स्टोरी सफलतापूर्वक प्रकाशित हो गई।',
    },
    validation: {
      thumbnailImageOnly: 'थंबनेल केवल इमेज फाइल होनी चाहिए।',
      thumbnailTooLarge: 'थंबनेल इमेज 5MB से कम होनी चाहिए।',
      titleRequired: 'स्टोरी शीर्षक जरूरी है।',
      packageRequired: 'कम से कम 1 फोटो और 1 वीडियो जरूरी है। एक स्टोरी में अधिकतम 5 फोटो और 10 वीडियो जोड़ सकते हैं।',
      imageTypeInvalid: 'फोटो केवल JPG, PNG या WEBP फाइल होनी चाहिए।',
      imageLimitExceeded: 'एक स्टोरी में अधिकतम 5 फोटो जोड़ सकते हैं।',
      videoLimitExceeded: 'एक स्टोरी में अधिकतम 10 वीडियो जोड़ सकते हैं।',
      videoTotalSizeExceeded: 'एक स्टोरी में कुल वीडियो अपलोड साइज पर कोई सीमा नहीं है।',
      waitForVideo: 'कृपया सभी वीडियो अपलोड पूरे होने तक इंतजार करें।',
      thumbnailRequired: 'कृपया एक थंबनेल जोड़ें।',
      durationInvalid: 'समय 2 से 180 सेकंड के बीच होना चाहिए।',
      priorityInvalid: 'प्राथमिकता एक सही नंबर होना चाहिए।',
      videoRequired: 'कृपया स्टोरी वीडियो अपलोड करें या वीडियो URL दें।',
      createFailed: 'स्टोरी बनाने में समस्या हुई।',
      videoUploadFailed: 'वीडियो अपलोड नहीं हो सकी।',
      thumbnailUploadFailed: 'थंबनेल अपलोड नहीं हो सका।',
    },
  },
} as const;

function createInitialFormData(author = 'Desk'): StoryFormData {
  return {
    title: '',
    caption: '',
    thumbnail: '',
    mediaType: 'image',
    mediaUrl: '',
    mediaKey: '',
    mediaSizeBytes: 0,
    mediaMimeType: '',
    storageProvider: '',
    linkUrl: '',
    linkLabel: '',
    category: 'General',
    author,
    locationTag: '',
    sourceInfo: '',
    sourceConfidential: false,
    reporterNotes: '',
    durationSeconds: '6',
    priority: '0',
  };
}

export default function CreateStoryPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const language = useAppStore((state) => state.language);
  const [formData, setFormData] = useState<StoryFormData>(() => createInitialFormData());
  const [mediaAssets, setMediaAssets] = useState<StoryMediaAsset[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [runningIntent, setRunningIntent] = useState<StoryCreateIntent | ''>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<PreviewAssetState | null>(null);

  const mediaCounts = useMemo(() => countStoryMediaAssets(mediaAssets), [mediaAssets]);
  const imageAssets = useMemo(
    () => mediaAssets.filter((asset) => asset.kind === 'image'),
    [mediaAssets]
  );
  const videoAssets = useMemo(
    () => mediaAssets.filter((asset) => asset.kind === 'video'),
    [mediaAssets]
  );
  const primaryMedia = useMemo(
    () => derivePrimaryStoryMedia(mediaAssets, formData.thumbnail.trim()),
    [formData.thumbnail, mediaAssets]
  );
  const previewThumbnail = useMemo(
    () => primaryMedia.thumbnail,
    [primaryMedia.thumbnail]
  );

  const role = session?.user?.role;
  const sessionName = session?.user?.name?.trim() || '';
  const canPublishNow = role === 'admin' || role === 'super_admin';
  const canUseDesk = isAdminRole(role);
  const isReporterFlow = isReporterDeskRole(role);
  const defaultAuthor = isReporterFlow && sessionName ? sessionName : 'Desk';
  const isHindi = isHydrated ? language === 'hi' : true;
  const t = REPORTER_COPY[isHindi ? 'hi' : 'en'];

  const getLocalizedMediaValidationMessage = (message: string) => {
    if (message.includes('up to 5 images')) return t.validation.imageLimitExceeded;
    if (message.includes('up to 10 videos')) return t.validation.videoLimitExceeded;
    if (message.includes('At least 1 image') || message.includes('At least 1 video')) {
      return t.validation.packageRequired;
    }
    return message;
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isReporterFlow || !sessionName) {
      return;
    }

    setFormData((current) => {
      const currentAuthor = current.author.trim();
      if (currentAuthor === sessionName) {
        return current;
      }

      if (currentAuthor && currentAuthor !== 'Desk') {
        return current;
      }

      return { ...current, author: sessionName };
    });
  }, [isReporterFlow, sessionName]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => {
      const nextValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

      if (name === 'mediaType' && nextValue !== 'video' && mediaAssets.length === 0) {
        setVideoUploadProgress(0);
        return {
          ...prev,
          mediaType: 'image',
          mediaUrl: '',
          mediaKey: '',
          mediaSizeBytes: 0,
          mediaMimeType: '',
          storageProvider: '',
        };
      }

      if (name === 'mediaUrl') {
        return {
          ...prev,
          mediaUrl: String(nextValue || '').trim(),
          mediaKey: '',
          mediaSizeBytes: 0,
          mediaMimeType: '',
          storageProvider: '',
        };
      }

      return {
        ...prev,
        [name]: nextValue,
      };
    });
  };

  const replaceMediaAsset = (assetId: string, nextAsset: StoryMediaAsset) => {
    setMediaAssets((current) =>
      current.map((asset) => (asset.id === assetId ? { ...nextAsset, id: asset.id, order: asset.order } : asset))
    );
    setPreviewAsset((current) =>
      current?.asset.id === assetId
        ? {
            asset: { ...nextAsset, id: assetId },
            title: nextAsset.kind === 'video' ? 'Story video preview' : 'Story photo preview',
          }
        : current
    );
  };

  const removeMediaAsset = (assetId: string) => {
    setMediaAssets((current) =>
      current
        .filter((asset) => asset.id !== assetId)
        .map((asset, index) => ({
          ...asset,
          order: index,
        }))
    );
    setPreviewAsset((current) => (current?.asset.id === assetId ? null : current));
  };

  const uploadImageFile = async (file: File, order: number) => {
    const body = new FormData();
    body.append('file', file);
    body.append('purpose', 'image');
    body.append('ownerType', 'story');

    const response = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
      },
      body,
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || t.validation.thumbnailUploadFailed);
    }

    return createStoryMediaAsset({
      assetId: String(data.data?.assetId || ''),
      kind: 'image',
      url: String(data.data?.url || ''),
      key: String(data.data?.publicId || ''),
      mimeType: file.type || 'image/jpeg',
      sizeBytes: file.size,
      storageProvider: String(data.data?.storageProvider || SPACES_STORAGE_PROVIDER),
      originalFileName: file.name,
      order,
    });
  };

  const handleThumbnailFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      if (!isAllowedImageFile(file)) {
        setError(t.validation.imageTypeInvalid);
        e.target.value = '';
        return;
      }

      if (file.size > THUMBNAIL_MAX_SIZE) {
        setError(t.validation.thumbnailTooLarge);
        e.target.value = '';
        return;
      }
    }

    setError('');
    setIsUploadingImages(true);

    try {
      const nextAssets: StoryMediaAsset[] = [];
      for (const file of files) {
        const uploaded = await uploadImageFile(file, imageAssets.length + nextAssets.length);
        nextAssets.push(uploaded);
      }

      setMediaAssets((current) => [...current, ...nextAssets]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.validation.thumbnailUploadFailed);
    } finally {
      setIsUploadingImages(false);
      e.target.value = '';
    }
  };

  const replaceImageAsset = async (
    assetId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAllowedImageFile(file)) {
      setError(t.validation.imageTypeInvalid);
      e.target.value = '';
      return;
    }

    if (file.size > THUMBNAIL_MAX_SIZE) {
      setError(t.validation.thumbnailTooLarge);
      e.target.value = '';
      return;
    }

    setError('');
    setIsUploadingImages(true);
    try {
      const assetIndex = imageAssets.findIndex((asset) => asset.id === assetId);
      const uploaded = await uploadImageFile(file, assetIndex >= 0 ? imageAssets[assetIndex].order : 0);
      replaceMediaAsset(assetId, uploaded);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.validation.thumbnailUploadFailed);
    } finally {
      setIsUploadingImages(false);
      e.target.value = '';
    }
  };

  const uploadStoryVideo = async (file: File, order: number) => {
    setIsUploadingVideo(true);
    setVideoUploadProgress(0);
    setError('');

    try {
      const initResponse = await fetch('/api/admin/uploads/story-video/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || 'video/mp4',
          fileSize: file.size,
        }),
      });
      const initPayload = (await initResponse.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          assetId?: string;
          mediaKey?: string;
          mediaUrl?: string;
          uploadUrl?: string;
          uploadHeaders?: Record<string, string>;
        };
      };

      if (!initResponse.ok || !initPayload.success || !initPayload.data?.uploadUrl || !initPayload.data.mediaKey || !initPayload.data.assetId) {
        throw new Error(initPayload.error || 'Failed to initialize video upload.');
      }

      await uploadFileToSignedUrl({
        file,
        uploadUrl: initPayload.data.uploadUrl,
        uploadHeaders: initPayload.data.uploadHeaders,
        onProgress: setVideoUploadProgress,
      });

      const completeResponse = await fetch('/api/admin/uploads/story-video/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          assetId: initPayload.data.assetId,
          expectedSize: file.size,
          expectedFileType: file.type || 'video/mp4',
          expectedFileName: file.name,
        }),
      });
      const completePayload = (await completeResponse.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          assetId?: string;
          mediaUrl?: string;
          mediaKey?: string;
          mediaSizeBytes?: number;
          mediaMimeType?: string;
          storageProvider?: string;
        };
      };

      if (!completeResponse.ok || !completePayload.success || !completePayload.data?.mediaUrl) {
        throw new Error(completePayload.error || 'Failed to verify uploaded video.');
      }

      const uploadedAsset = createStoryMediaAsset({
        assetId: String(completePayload.data?.assetId || ''),
        kind: 'video',
        url: String(completePayload.data?.mediaUrl || ''),
        key: String(completePayload.data?.mediaKey || ''),
        mimeType: String(completePayload.data?.mediaMimeType || 'video/mp4'),
        sizeBytes: Number(completePayload.data?.mediaSizeBytes || file.size),
        storageProvider: String(completePayload.data?.storageProvider || SPACES_STORAGE_PROVIDER),
        originalFileName: file.name,
        order,
      });
      setSuccess(t.status.videoReady);
      return uploadedAsset;
    } catch (uploadError) {
      setVideoUploadProgress(0);
      throw uploadError;
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files) {
      const validationError = validateStoryVideoFile(file);
      if (validationError) {
        setError(validationError);
        e.target.value = '';
        return;
      }
    }

    try {
      const nextAssets: StoryMediaAsset[] = [];
      for (const file of files) {
        const uploaded = await uploadStoryVideo(file, videoAssets.length + nextAssets.length);
        nextAssets.push(uploaded);
      }
      setMediaAssets((current) => [...current, ...nextAssets]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.validation.videoUploadFailed);
    } finally {
      e.target.value = '';
    }
  };

  const replaceVideoAsset = async (
    assetId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateStoryVideoFile(file);
    if (validationError) {
      setError(validationError);
      e.target.value = '';
      return;
    }

    try {
      const assetIndex = videoAssets.findIndex((asset) => asset.id === assetId);
      const uploaded = await uploadStoryVideo(file, assetIndex >= 0 ? videoAssets[assetIndex].order : 0);
      replaceMediaAsset(assetId, uploaded);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t.validation.videoUploadFailed);
    } finally {
      e.target.value = '';
    }
  };

  const handleSubmit = async (intent: StoryCreateIntent) => {
    setError('');
    setSuccess('');
    setIsLoading(true);
    setRunningIntent(intent);

    try {
      if (!formData.title.trim()) {
        setError(t.validation.titleRequired);
        return;
      }

      if (isUploadingVideo || isUploadingImages) {
        setError(t.validation.waitForVideo);
        return;
      }

      const mediaValidationError = validateStoryMediaAssets(mediaAssets);
      if (mediaValidationError) {
        setError(getLocalizedMediaValidationMessage(mediaValidationError));
        return;
      }

      const primaryMedia = derivePrimaryStoryMedia(mediaAssets, formData.thumbnail.trim());
      if (!primaryMedia.thumbnail) {
        setError(t.validation.thumbnailRequired);
        return;
      }

      const durationSeconds = Number.parseInt(formData.durationSeconds, 10);
      const priority = Number.parseInt(formData.priority, 10);

      if (!Number.isFinite(durationSeconds) || durationSeconds < 2 || durationSeconds > 180) {
        setError(t.validation.durationInvalid);
        return;
      }

      if (!Number.isFinite(priority)) {
        setError(t.validation.priorityInvalid);
        return;
      }

      if (primaryMedia.mediaType === 'video' && !primaryMedia.mediaUrl.trim()) {
        setError(t.validation.videoRequired);
        return;
      }

      const response = await fetch('/api/admin/stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          caption: formData.caption.trim(),
          thumbnail: primaryMedia.thumbnail.trim(),
          mediaType: primaryMedia.mediaType,
          mediaUrl: primaryMedia.mediaUrl.trim(),
          mediaKey: primaryMedia.mediaKey,
          mediaSizeBytes: primaryMedia.mediaSizeBytes,
          mediaMimeType: primaryMedia.mediaMimeType,
          storageProvider: primaryMedia.storageProvider,
          mediaAssets,
          linkUrl: formData.linkUrl.trim(),
          linkLabel: formData.linkLabel.trim(),
          category: formData.category,
          author: formData.author.trim() || defaultAuthor,
          reporterMeta: {
            locationTag: formData.locationTag,
            sourceInfo: formData.sourceInfo,
            sourceConfidential: formData.sourceConfidential,
            reporterNotes: formData.reporterNotes,
          },
          durationSeconds,
          priority,
          intent,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create story');
      }

      setSuccess(
        [
          intent === 'draft'
            ? t.status.draftSaved
            : intent === 'submit'
              ? t.status.submitted
              : t.status.published,
          data.usage?.alertTriggered ? data.usage.message : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
      setFormData(createInitialFormData(defaultAuthor));
      setMediaAssets([]);
      setVideoUploadProgress(0);

      setTimeout(() => {
        router.push('/admin/stories');
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.validation.createFailed);
    } finally {
      setIsLoading(false);
      setRunningIntent('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-36 sm:p-6 sm:pb-6">
      <Link
        href="/admin/stories"
        className="mb-4 inline-flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900 sm:mb-6 sm:text-base"
      >
        <ArrowLeft className="h-5 w-5" />
        {t.back}
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <CmsEditorCanvas>
        <div className="rounded-[24px] border border-gray-200 bg-white p-5 shadow-sm sm:rounded-xl sm:p-8">
          <h1 className="mb-2 text-2xl font-bold text-gray-900 sm:text-3xl">{t.pageTitle}</h1>
          <p className="mb-5 text-sm text-gray-600 sm:mb-6 sm:text-base">{t.pageSubtitle}</p>

          {error ? (
            <div className="mb-5 flex items-start gap-3 rounded-[18px] border border-red-200 bg-red-50 p-3 text-red-800 sm:mb-6 sm:rounded-lg sm:p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="mb-5 flex items-start gap-3 rounded-[18px] border border-green-200 bg-green-50 p-3 text-green-800 sm:mb-6 sm:rounded-lg sm:p-4">
              <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{success}</p>
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit('submit');
            }}
          >
            <CmsEditorColumns sidebarWidth="narrow" className="gap-4 sm:gap-8">
              <CmsEditorMain className="space-y-4 sm:space-y-6">
            <section className="space-y-4 rounded-[20px] border border-gray-200 bg-gray-50 p-4 sm:space-y-5 sm:rounded-xl sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t.sections.media}</h2>
                <p className="mt-1 text-sm text-gray-600">{t.sections.uploadSummary}</p>
              </div>

              {!isReporterFlow ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    {t.fields.thumbnailUrl}
                  </label>
                  <input
                    type="url"
                    name="thumbnail"
                    value={formData.thumbnail}
                    onChange={handleInputChange}
                    placeholder={t.placeholders.thumbnailUrl}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                  />
                </div>
              ) : null}

              <div className="rounded-[18px] border border-gray-200 bg-white p-3 sm:rounded-xl sm:p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-900">{t.sections.uploadSummary}</p>
                  {!isReporterFlow ? (
                    <p className="mt-1 text-xs text-gray-500">{t.media.noFilesYet}</p>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:gap-4">
                  <div className="rounded-[16px] border border-gray-200 p-3 sm:rounded-lg">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{t.fields.thumbnailUpload}</p>
                        {!isReporterFlow ? (
                          <p className="mt-1 text-xs text-gray-500">{t.media.thumbnailHelp}</p>
                        ) : null}
                      </div>
                      <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200">
                        {mediaCounts.images}
                      </span>
                    </div>

                    <input
                      id={THUMBNAIL_INPUT_ID}
                      type="file"
                      accept={STORY_IMAGE_ACCEPT}
                      multiple
                      onChange={(event) => void handleThumbnailFileChange(event)}
                      className="hidden"
                    />

                    <div className="flex flex-wrap gap-2.5 sm:gap-3">
                      <label
                          htmlFor={THUMBNAIL_INPUT_ID}
                          className="flex aspect-square w-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-center text-gray-600 transition-colors hover:border-primary-600 hover:bg-primary-50 sm:w-24"
                        >
                          <ImageIcon className="h-5 w-5" />
                          <span className="px-2 text-[11px] font-semibold leading-4">
                            {t.media.selectPhoto}
                          </span>
                      </label>

                      {imageAssets.map((asset) => (
                        <StoryMediaTile
                          key={asset.id}
                          asset={asset}
                          kindLabel={t.media.imageCount}
                          replaceLabel={t.media.replace}
                          removeLabel={t.media.remove}
                          replaceInputId={`replace-image-${asset.id}`}
                          accept="image/*"
                          onPreview={() =>
                            setPreviewAsset({
                              asset,
                              title: t.media.uploadedPhoto,
                            })
                          }
                          onReplace={(event) => void replaceImageAsset(asset.id, event)}
                          onRemove={() => removeMediaAsset(asset.id)}
                        />
                      ))}
                    </div>

                    {isUploadingImages ? (
                      <p className="mt-3 text-xs font-medium text-gray-600">
                        Uploading photos...
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-[16px] border border-gray-200 p-3 sm:rounded-lg">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{t.fields.videoUpload}</p>
                        {!isReporterFlow ? (
                          <p className="mt-1 text-xs text-gray-500">{t.media.videoHelp}</p>
                        ) : null}
                      </div>
                      <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-gray-200">
                        {mediaCounts.videos}
                      </span>
                    </div>

                    <input
                      id={VIDEO_INPUT_ID}
                      type="file"
                      accept={STORY_VIDEO_ACCEPT}
                      multiple
                      onChange={(event) => void handleVideoFileChange(event)}
                      className="hidden"
                    />

                    <div className="flex flex-wrap gap-2.5 sm:gap-3">
                      <label
                          htmlFor={VIDEO_INPUT_ID}
                          className="flex aspect-square w-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-center text-gray-600 transition-colors hover:border-primary-600 hover:bg-primary-50 sm:w-24"
                        >
                          <Upload className="h-5 w-5" />
                          <span className="px-2 text-[11px] font-semibold leading-4">
                            {t.media.selectVideo}
                          </span>
                      </label>

                      {videoAssets.map((asset) => (
                        <StoryMediaTile
                          key={asset.id}
                          asset={asset}
                          kindLabel={t.media.videoCount}
                          replaceLabel={t.media.replace}
                          removeLabel={t.media.remove}
                          replaceInputId={`replace-video-${asset.id}`}
                          accept="video/mp4,.mp4"
                          onPreview={() =>
                            setPreviewAsset({
                              asset,
                              title: t.media.uploadedVideo,
                            })
                          }
                          onReplace={(event) => void replaceVideoAsset(asset.id, event)}
                          onRemove={() => removeMediaAsset(asset.id)}
                        />
                      ))}
                    </div>

                    {isUploadingVideo ? (
                      <div className="mt-3 space-y-2">
                        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-spanish-red transition-[width] duration-200"
                            style={{ width: `${videoUploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-600">
                          {t.media.uploadProgress}: {videoUploadProgress}%
                        </p>
                      </div>
                    ) : null}

                    {!isReporterFlow && formData.mediaType === 'video' ? (
                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-medium text-gray-900">
                          Video URL <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="url"
                          name="mediaUrl"
                          value={formData.mediaUrl}
                          onChange={handleInputChange}
                          placeholder="https://example.com/story-video.mp4"
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                          required
                        />
                        <p className="mt-1 text-xs text-gray-500">{t.media.manualVideoUrl}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-[20px] border border-gray-200 bg-gray-50 p-4 sm:space-y-5 sm:rounded-xl sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t.sections.story}</h2>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  {t.fields.title} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder={t.placeholders.title}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">{t.fields.caption}</label>
                <textarea
                  name="caption"
                  value={formData.caption}
                  onChange={handleInputChange}
                  placeholder={t.placeholders.caption}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                />
              </div>

            {!isReporterFlow ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {!isReporterFlow ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    {t.fields.storyType}
                  </label>
                  <select
                    name="mediaType"
                    value={formData.mediaType}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                  >
                    <option value="image">{isHindi ? 'इमेज स्टोरी' : 'Image Story'}</option>
                    <option value="video">{isHindi ? 'वीडियो स्टोरी' : 'Video Story'}</option>
                  </select>
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  {t.fields.category}
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div> : null}
            </section>

            {!isReporterFlow ? (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Link URL (optional)
                    </label>
                    <input
                      type="text"
                      name="linkUrl"
                      value={formData.linkUrl}
                      onChange={handleInputChange}
                      placeholder="/main/article/123 or https://..."
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      Link Label
                    </label>
                    <input
                      type="text"
                      name="linkLabel"
                      value={formData.linkLabel}
                      onChange={handleInputChange}
                      placeholder="Read Full Story"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      {t.fields.author}
                    </label>
                    <input
                      type="text"
                      name="author"
                      value={formData.author}
                      onChange={handleInputChange}
                      placeholder={defaultAuthor}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-900">
                      {t.fields.duration}
                    </label>
                    <input
                      type="number"
                      name="durationSeconds"
                      value={formData.durationSeconds}
                      onChange={handleInputChange}
                      min="2"
                      max="180"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-900">{t.fields.priority}</label>
                    <input
                      type="number"
                      name="priority"
                      value={formData.priority}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                    />
                  </div>
                </div>
              </>
            ) : null}

            {!isReporterFlow ? <section className="space-y-4 rounded-[20px] border border-gray-200 bg-gray-50 p-4 sm:space-y-5 sm:rounded-xl sm:p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t.sections.source}</h2>
                <p className="mt-1 text-sm text-gray-600">{t.helper.sourceBody}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    {t.fields.locationTag}
                  </label>
                  <input
                    type="text"
                    name="locationTag"
                    value={formData.locationTag}
                    onChange={handleInputChange}
                    placeholder={t.placeholders.locationTag}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-900">
                  {t.fields.reporterNotes}
                </label>
                <textarea
                  name="reporterNotes"
                  value={formData.reporterNotes}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder={t.placeholders.reporterNotes}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                />
              </div>

              <div className="space-y-4 rounded-[18px] border border-gray-200 bg-white p-3 sm:rounded-lg sm:p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.helper.sourceTitle}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {t.helper.sourceBody}
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-900">
                    {t.fields.sourceInfo}
                  </label>
                  <textarea
                    name="sourceInfo"
                    value={formData.sourceInfo}
                    onChange={handleInputChange}
                    rows={3}
                    placeholder={t.placeholders.sourceInfo}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 transition-colors focus:border-primary-600 focus:outline-none"
                  />
                </div>
                <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="sourceConfidential"
                    checked={formData.sourceConfidential}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-gray-300 text-spanish-red focus:ring-spanish-red"
                  />
                  <span className="text-sm text-gray-700">
                    {t.fields.sourceConfidential}
                  </span>
                </label>
              </div>
            </section> : null}

              </CmsEditorMain>

              <CmsEditorSidebar>
                {!canUseDesk ? (
                  <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:rounded-lg sm:p-4">
                    {t.roleLoading}
                  </div>
                ) : null}

                <div className="rounded-[20px] border border-gray-200 bg-gray-50 p-4 sm:rounded-xl">
                  <p className="text-sm font-semibold text-gray-900">{t.sections.uploadSummary}</p>
                  {!isReporterFlow ? (
                    <p className="mt-1 text-xs text-gray-600">{t.media.noFilesYet}</p>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {t.media.imageCount}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">
                        {mediaCounts.images}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {t.media.videoCount}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">
                        {mediaCounts.videos}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Video Storage
                    </p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {formatStoryVideoSize(getTotalStoryVideoBytes(videoAssets))}
                    </p>
                  </div>

                  {previewThumbnail ? (
                    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <AdminMediaImage
                        src={previewThumbnail}
                        alt="Story thumbnail preview"
                        className="h-44 w-full object-cover"
                      />
                    </div>
                  ) : null}

                  {isUploadingImages ? (
                    <p className="mt-3 text-xs font-medium text-gray-600">Uploading photos...</p>
                  ) : null}

                  {isUploadingVideo ? (
                    <div className="mt-4 space-y-2">
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full bg-spanish-red transition-[width] duration-200"
                          style={{ width: `${videoUploadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-600">
                        {t.media.uploadProgress}: {videoUploadProgress}%
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[18px] border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 sm:rounded-lg sm:p-4">
              {t.helper.draftNotice}
                </div>

                <div className="flex flex-col gap-3 rounded-[18px] border border-gray-200 bg-gray-50 p-3 sm:rounded-lg sm:p-4">
            <button
                type="button"
                disabled={isLoading || isUploadingImages || isUploadingVideo}
                onClick={() => void handleSubmit('draft')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runningIntent === 'draft' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t.actions.savingDraft}
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5" />
                    {t.actions.saveDraft}
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={isLoading || isUploadingImages || isUploadingVideo}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-spanish-red px-5 py-3 font-medium text-white transition-colors hover:bg-guardsman-red disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runningIntent === 'submit' ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t.actions.submitting}
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    {t.actions.submit}
                  </>
                )}
              </button>

              {canPublishNow ? (
                <button
                  type="button"
                  disabled={isLoading || isUploadingImages || isUploadingVideo}
                  onClick={() => void handleSubmit('publish')}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {runningIntent === 'publish' ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {t.actions.publishing}
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      {t.actions.publish}
                    </>
                  )}
                </button>
              ) : null}

              <Link
                href="/admin/stories"
                className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-5 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                {t.actions.cancel}
              </Link>
                </div>
              </CmsEditorSidebar>
            </CmsEditorColumns>
          </form>
        </div>
        </CmsEditorCanvas>
      </motion.div>

      {previewAsset ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{previewAsset.title}</p>
                <p className="truncate text-xs text-gray-500" title={getMediaAssetLabel(previewAsset.asset)}>
                  {getMediaAssetLabel(previewAsset.asset)} - {formatStoryVideoSize(previewAsset.asset.sizeBytes)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl bg-gray-950">
              {previewAsset.asset.kind === 'image' ? (
                <AdminMediaImage
                  src={previewAsset.asset.url}
                  alt={getMediaAssetLabel(previewAsset.asset)}
                  className="max-h-[75vh] w-full object-contain"
                />
              ) : (
                <video
                  src={previewAsset.asset.url}
                  controls
                  autoPlay
                  preload="metadata"
                  className="max-h-[75vh] w-full bg-black"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

