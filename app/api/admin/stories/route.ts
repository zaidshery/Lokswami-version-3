import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import Story from '@/lib/models/Story';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import {
  createEmptyCopyEditorMeta,
  normalizeCopyEditorMeta,
  normalizeReporterMeta,
  validateCopyEditorMeta,
  validateReporterMeta,
} from '@/lib/content/newsroomMetadata';
import {
  derivePrimaryStoryMedia,
  normalizeStoryMediaAssets,
  validateStoryMediaAssets,
  type StoryMediaAsset,
} from '@/lib/content/storyMedia';
import {
  createEmptyStoryVideoProduction,
  normalizeLinkedArticleStatus,
  normalizeStoryVideoProduction,
} from '@/lib/content/newsroomPublishing';
import {
  canCreateContent,
  canReadContent,
  canTransitionContent,
} from '@/lib/auth/permissions';
import {
  createStoredStory,
  listAllStoredStories,
} from '@/lib/storage/storiesFile';
import { getStoryVideoMonthlyUsageSummary } from '@/lib/server/storyVideoUsage';
import {
  buildStoryActivityMessage,
  recordStoryActivity,
} from '@/lib/server/storyActivity';
import {
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MIN_BYTES,
  STORY_VIDEO_STORAGE_PROVIDER,
} from '@/lib/storage/storyVideoUpload';
import {
  resolveStoryWorkflow,
  toWorkflowActorRef,
} from '@/lib/workflow/story';
import { isWorkflowStatus } from '@/lib/workflow/types';
import { resolveStoryVersion } from '@/lib/server/storyEditorialService';

const FILE_STORE_UNBOUNDED_LIMIT = Number.MAX_SAFE_INTEGER;

type CreateIntent = 'draft' | 'submit' | 'publish';

type StoryLike = {
  _id?: string;
  id?: string;
  author?: string;
  isPublished?: boolean;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  priority?: number;
  views?: number;
  workflow?: unknown;
  title?: string;
  caption?: string;
  thumbnail?: string;
  mediaType?: 'image' | 'video';
  mediaUrl?: string;
  mediaKey?: string;
  mediaSizeBytes?: number;
  mediaMimeType?: string;
  storageProvider?: string;
  mediaAssets?: StoryMediaAsset[];
  linkUrl?: string;
  linkLabel?: string;
  category?: string;
  durationSeconds?: number;
  linkedArticleId?: string;
  linkedArticleStatus?: string;
  videoProduction?: unknown;
};

function parsePositiveInt(value: string | null, fallback: number, max = 200) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseListLimit(value: string | null, fallback: number, max = 200) {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'all') return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseBooleanParam(value: string | null): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toBoundedDuration(value: unknown, fallback = 6) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(2, Math.min(180, parsed));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '';
}

const DIRECT_PUBLICATION_FIELDS = ['isPublished', 'publishedAt', 'scheduledFor', 'workflow'] as const;

function normalizeCreateIntent(value: unknown): CreateIntent | null {
  if (value === undefined) return 'draft';

  if (value === 'draft' || value === 'submit' || value === 'publish') {
    return value;
  }

  return null;
}

function normalizeMediaSizeBytes(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeStoryInput(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const caption = typeof source.caption === 'string' ? source.caption.trim() : '';
  const thumbnail = typeof source.thumbnail === 'string' ? source.thumbnail.trim() : '';
  const mediaAssets = normalizeStoryMediaAssets(source.mediaAssets);
  const derivedPrimary = derivePrimaryStoryMedia(mediaAssets, thumbnail);
  const mediaType: 'image' | 'video' =
    source.mediaType === 'video' ? 'video' : 'image';
  const mediaUrl = typeof source.mediaUrl === 'string' ? source.mediaUrl.trim() : '';
  const mediaKey = typeof source.mediaKey === 'string' ? source.mediaKey.trim() : '';
  const mediaMimeType = typeof source.mediaMimeType === 'string' ? source.mediaMimeType.trim().toLowerCase() : '';
  const storageProvider =
    typeof source.storageProvider === 'string' ? source.storageProvider.trim() : '';
  const mediaSizeBytes = normalizeMediaSizeBytes(source.mediaSizeBytes);
  const linkUrl = typeof source.linkUrl === 'string' ? source.linkUrl.trim() : '';
  const linkLabel = typeof source.linkLabel === 'string' ? source.linkLabel.trim() : '';
  const category = typeof source.category === 'string' ? source.category.trim() : 'General';
  const author = typeof source.author === 'string' ? source.author.trim() : 'Desk';
  const priority = Number.parseInt(String(source.priority ?? 0), 10);
  const views = Number.parseInt(String(source.views ?? 0), 10);
  const durationSeconds = toBoundedDuration(source.durationSeconds, 6);
  const publishedAt = new Date();

  return {
    title,
    caption,
    thumbnail: derivedPrimary.thumbnail || thumbnail,
    mediaType: mediaAssets.length > 0 ? derivedPrimary.mediaType : mediaType,
    mediaUrl: mediaAssets.length > 0 ? derivedPrimary.mediaUrl : mediaUrl,
    mediaKey: mediaAssets.length > 0 ? derivedPrimary.mediaKey : mediaKey,
    mediaSizeBytes: mediaAssets.length > 0 ? derivedPrimary.mediaSizeBytes : mediaSizeBytes,
    mediaMimeType: mediaAssets.length > 0 ? derivedPrimary.mediaMimeType : mediaMimeType,
    storageProvider: mediaAssets.length > 0 ? derivedPrimary.storageProvider : storageProvider,
    mediaAssets,
    linkUrl,
    linkLabel,
    category: category || 'General',
    author: author || 'Desk',
    priority: Number.isFinite(priority) ? priority : 0,
    views: Number.isFinite(views) ? Math.max(0, views) : 0,
    durationSeconds,
    isPublished: false,
    publishedAt,
    reporterMeta: normalizeReporterMeta(source.reporterMeta),
    copyEditorMeta: normalizeCopyEditorMeta(source.copyEditorMeta),
  };
}

function getReporterDisplayName(
  user: NonNullable<Awaited<ReturnType<typeof getAdminSessionFromReq>>>,
  fallbackAuthor: string
) {
  const sessionName = user.name.trim();
  if (sessionName) return sessionName;
  const emailPrefix = user.email.trim().split('@')[0];
  return emailPrefix || fallbackAuthor || 'Desk';
}

function sanitizeCreateInputForUser(
  user: NonNullable<Awaited<ReturnType<typeof getAdminSessionFromReq>>>,
  input: ReturnType<typeof normalizeStoryInput>
) {
  if (user.role !== 'reporter') {
    return input;
  }

  return {
    ...input,
    author: getReporterDisplayName(user, input.author),
    linkUrl: '',
    linkLabel: '',
    priority: 0,
    views: 0,
    copyEditorMeta: createEmptyCopyEditorMeta(),
  };
}

function validateStoryInput(
  input: ReturnType<typeof normalizeStoryInput>,
  options: { requireMediaPackage?: boolean; allowLongCaption?: boolean } = {}
) {
  if (!input.title || !input.thumbnail) {
    return 'Title and thumbnail are required';
  }

  if (input.title.length > 140) {
    return 'Title is too long (max 140 characters)';
  }

  if (!options.allowLongCaption && input.caption.length > 300) {
    return 'Caption is too long (max 300 characters)';
  }

  if (input.mediaType === 'video' && !input.mediaUrl) {
    return 'Media URL is required for video stories';
  }

  const mediaAssetsError = validateStoryMediaAssets(input.mediaAssets, {
    requireCompletePackage: options.requireMediaPackage,
  });
  if (mediaAssetsError) {
    return mediaAssetsError;
  }

  if (
    input.storageProvider &&
    input.storageProvider !== STORY_VIDEO_STORAGE_PROVIDER
  ) {
    return 'Unsupported story video storage provider';
  }

  if (input.storageProvider === STORY_VIDEO_STORAGE_PROVIDER) {
    if (input.mediaType !== 'video') {
      return 'DigitalOcean Spaces media can only be attached to video stories';
    }

    if (!input.mediaKey) {
      return 'Uploaded story videos must include a storage key';
    }

    if (input.mediaSizeBytes < STORY_VIDEO_MIN_BYTES || input.mediaSizeBytes > STORY_VIDEO_MAX_BYTES) {
      return 'Uploaded video must be larger than 0 bytes and 1.9 GB or smaller';
    }

    if (input.mediaMimeType !== 'video/mp4') {
      return 'Uploaded story videos must be MP4 files';
    }
  }

  if (input.linkUrl.length > 500) {
    return 'Link URL is too long';
  }

  const reporterMetaError = validateReporterMeta(input.reporterMeta);
  if (reporterMetaError) {
    return reporterMetaError;
  }

  const copyEditorMetaError = validateCopyEditorMeta(input.copyEditorMeta);
  if (copyEditorMetaError) {
    return copyEditorMetaError;
  }

  return null;
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) return true;

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for stories route, using file store.', error);
    return true;
  }
}

function buildInitialWorkflow(
  intent: CreateIntent,
  user: NonNullable<Awaited<ReturnType<typeof getAdminSessionFromReq>>>
) {
  const actor = toWorkflowActorRef(user);
  const now = new Date();

  if (intent === 'draft') {
    return {
      status: 'draft' as const,
      priority: 'normal' as const,
      createdBy: actor,
    };
  }

  if (intent === 'submit') {
    return {
      status: 'submitted' as const,
      priority: 'normal' as const,
      createdBy: actor,
      submittedAt: now,
    };
  }

  return {
    status: 'published' as const,
    priority: 'normal' as const,
    createdBy: actor,
    publishedAt: now,
  };
}

function resolveStoryRecord(story: StoryLike, createdBy?: ReturnType<typeof toWorkflowActorRef>) {
  const workflow = resolveStoryWorkflow({
    workflow: story.workflow,
    isPublished: story.isPublished,
    publishedAt: story.publishedAt,
    updatedAt: story.updatedAt,
    createdBy,
  });

  return {
    ...story,
    version: resolveStoryVersion((story as { version?: unknown }).version),
    isPublished: workflow.status === 'published',
    linkedArticleId:
      typeof story.linkedArticleId === 'string' ? story.linkedArticleId.trim() : '',
    linkedArticleStatus: normalizeLinkedArticleStatus(story.linkedArticleStatus),
    videoProduction:
      story.videoProduction !== undefined
        ? normalizeStoryVideoProduction(story.videoProduction)
        : createEmptyStoryVideoProduction(),
    workflow,
  };
}

function buildStoryPermissionRecord(story: ReturnType<typeof resolveStoryRecord>) {
  return {
    workflow: story.workflow,
    legacyAuthorName: typeof story.author === 'string' ? story.author : '',
  };
}

function matchesFilters(
  story: ReturnType<typeof resolveStoryRecord>,
  user: NonNullable<Awaited<ReturnType<typeof getAdminSessionFromReq>>>,
  filters: {
    category: string | null;
    search: string;
    published?: boolean;
    workflowStatus: string;
  }
) {
  if (!canReadContent(user, buildStoryPermissionRecord(story), { allowViewerRead: true })) {
    return false;
  }

  if (filters.category && filters.category !== 'all' && story.category !== filters.category) {
    return false;
  }

  if (typeof filters.published === 'boolean' && story.isPublished !== filters.published) {
    return false;
  }

  if (filters.workflowStatus && story.workflow.status !== filters.workflowStatus) {
    return false;
  }

  if (!filters.search) return true;
  const needle = filters.search.toLowerCase();
  return (
    String(story.title || '').toLowerCase().includes(needle) ||
    String(story.caption || '').toLowerCase().includes(needle) ||
    String(story.category || '').toLowerCase().includes(needle)
  );
}

function sortStories(stories: ReturnType<typeof resolveStoryRecord>[], sort: string | null) {
  return [...stories].sort((left, right) => {
    if (sort === 'priority') {
      return (
        Number(right.priority || 0) - Number(left.priority || 0) ||
        new Date(String(right.updatedAt || right.publishedAt || 0)).getTime() -
          new Date(String(left.updatedAt || left.publishedAt || 0)).getTime()
      );
    }

    if (sort === 'trending') {
      return (
        Number(right.views || 0) - Number(left.views || 0) ||
        new Date(String(right.updatedAt || right.publishedAt || 0)).getTime() -
          new Date(String(left.updatedAt || left.publishedAt || 0)).getTime()
      );
    }

    return (
      new Date(String(right.updatedAt || right.publishedAt || 0)).getTime() -
      new Date(String(left.updatedAt || left.publishedAt || 0)).getTime()
    );
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const category = searchParams.get('category');
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort');
    const publishedParam = parseBooleanParam(searchParams.get('published'));
    const workflowStatus = String(searchParams.get('workflowStatus') || '').trim().toLowerCase();
    const effectiveWorkflowStatus = isWorkflowStatus(workflowStatus) ? workflowStatus : '';
    const limit = parseListLimit(searchParams.get('limit'), 20, 200);
    const page = parsePositiveInt(searchParams.get('page'), 1, 100000);
    const isUnbounded = limit === null;
    const effectivePage = isUnbounded ? 1 : page;
    const effectiveLimit = isUnbounded ? FILE_STORE_UNBOUNDED_LIMIT : limit;

    if (await shouldUseFileStore()) {
      const allStories = await listAllStoredStories();
      const filteredStories = sortStories(
        allStories
          .map((story) => resolveStoryRecord(story))
          .filter((story) =>
            matchesFilters(story, user, {
              category,
              search,
              published: publishedParam,
              workflowStatus: effectiveWorkflowStatus,
            })
          ),
        sort
      );
      const total = filteredStories.length;
      const stories = isUnbounded
        ? filteredStories
        : filteredStories.slice(
            (effectivePage - 1) * effectiveLimit,
            (effectivePage - 1) * effectiveLimit + effectiveLimit
          );

      return NextResponse.json({
        success: true,
        data: stories,
        pagination: {
          total,
          page: effectivePage,
          limit: isUnbounded ? total : effectiveLimit,
          pages: isUnbounded ? 1 : Math.ceil(total / effectiveLimit),
        },
      });
    }

    const query: Record<string, unknown> = {};
    if (category && category !== 'all') {
      query.category = category;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { caption: { $regex: safeSearch, $options: 'i' } },
        { category: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const allStories = (await Story.find(query)
      .sort({ updatedAt: -1, publishedAt: -1, _id: -1 })
      .lean()) as StoryLike[];

    const filteredStories = sortStories(
      allStories
        .map((story) => resolveStoryRecord(story))
        .filter((story) =>
          matchesFilters(story, user, {
            category,
            search,
            published: publishedParam,
            workflowStatus: effectiveWorkflowStatus,
          })
        ),
      sort
    );

    const total = filteredStories.length;
    const stories = isUnbounded
      ? filteredStories
      : filteredStories.slice(
          (effectivePage - 1) * effectiveLimit,
          (effectivePage - 1) * effectiveLimit + effectiveLimit
        );

    return NextResponse.json({
      success: true,
      data: stories,
      pagination: {
        total,
        page: effectivePage,
        limit: isUnbounded ? total : effectiveLimit,
        pages: isUnbounded ? 1 : Math.ceil(total / effectiveLimit),
      },
    });
  } catch (error) {
    console.error('Error fetching stories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stories' },
      { status: 500 }
    );
  }
}

async function POSTHandler(req: NextRequest) {
  try {
    // Read JSON body FIRST to avoid disturbed/locked body errors in Next.js 15
    const body = await req.json();

    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (!canCreateContent(user.role, 'story')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const bodyRecord =
      typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
    if (DIRECT_PUBLICATION_FIELDS.some((field) => field in bodyRecord)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Publication state can only be changed through workflow actions.',
        },
        { status: 400 }
      );
    }

    const intent = normalizeCreateIntent(bodyRecord.intent);
    if (!intent) {
      return NextResponse.json(
        { success: false, error: 'Invalid story intent' },
        { status: 400 }
      );
    }

    const rawInput = normalizeStoryInput(body);
    const input = sanitizeCreateInputForUser(user, rawInput);
    const validationError = validateStoryInput(input, {
      allowLongCaption: user.role === 'reporter',
    });
    const workflow = buildInitialWorkflow(intent, user);

    if (
      intent === 'publish' &&
      !canTransitionContent(
        user,
        {
          workflow: {
            status: 'approved',
          },
        },
        'publish'
      )
    ) {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to publish stories directly.' },
        { status: 403 }
      );
    }

    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    if (await shouldUseFileStore()) {
      const stored = await createStoredStory({
        ...input,
        isPublished: workflow.status === 'published',
        publishedAt: input.publishedAt.toISOString(),
        workflow: {
          ...workflow,
          submittedAt: workflow.submittedAt?.toISOString() || null,
          publishedAt: workflow.publishedAt?.toISOString() || null,
        },
      });

      try {
        await recordStoryActivity({
          storyId: stored._id,
          actor: user,
          action: 'created',
          toStatus: stored.workflow.status,
          message: buildStoryActivityMessage({
            action: 'created',
            toStatus: stored.workflow.status,
          }),
          metadata: {
            intent,
            priority: stored.workflow.priority,
            createdById: stored.workflow.createdBy?.id || '',
          },
        });
      } catch (activityError) {
        console.error('Failed to record story activity on create:', activityError);
      }

      let usage = null;
      try {
        usage = await getStoryVideoMonthlyUsageSummary();
      } catch (usageError) {
        console.error('Failed to get story video usage summary:', usageError);
      }

      return NextResponse.json(
        {
          success: true,
          data: resolveStoryRecord(stored),
          message: 'Story created successfully',
          usage,
        },
        { status: 201 }
      );
    }

    const story = new Story({
      ...input,
      version: 1,
      isPublished: workflow.status === 'published',
      updatedAt: new Date(),
      workflow,
    });
    const saved = await story.save();

    try {
      await recordStoryActivity({
        storyId: String(saved._id),
        actor: user,
        action: 'created',
        toStatus: workflow.status,
        message: buildStoryActivityMessage({
          action: 'created',
          toStatus: workflow.status,
        }),
        metadata: {
          intent,
          priority: workflow.priority,
          createdById: workflow.createdBy?.id || '',
        },
      });
    } catch (activityError) {
      console.error('Failed to record story activity on create:', activityError);
    }

    let usage = null;
    try {
      usage = await getStoryVideoMonthlyUsageSummary();
    } catch (usageError) {
      console.error('Failed to get story video usage summary:', usageError);
    }

    return NextResponse.json(
      {
        success: true,
        data: resolveStoryRecord(saved.toObject()),
        message: 'Story created successfully',
        usage,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating story:', error);
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to create story'
        : 'Failed to create story';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export const POST = withAdminMutation(POSTHandler);
