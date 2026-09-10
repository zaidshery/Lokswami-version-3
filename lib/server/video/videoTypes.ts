import type { ContentTransitionAction } from '@/lib/auth/permissions';
import type { AdminRole } from '@/lib/auth/roles';
import type { PublicVideoItem } from '@/lib/content/videoPublication';

export type VideoStore = 'mongo' | 'file';

export class InvalidVideoIdError extends Error {
  readonly status = 400;
  constructor(message = 'Invalid video ID') {
    super(message);
    this.name = 'InvalidVideoIdError';
  }
}

export class VideoNotFoundError extends Error {
  readonly status = 404;
  constructor(message = 'Video not found') {
    super(message);
    this.name = 'VideoNotFoundError';
  }
}

export class VideoValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'VideoValidationError';
    this.status = status;
  }
}

export class VideoForbiddenError extends Error {
  readonly status = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'VideoForbiddenError';
  }
}

export class MongoAssignmentUnavailableError extends Error {
  readonly status = 503;
  constructor(
    message = 'Staff assignment requires database connectivity. MongoDB is currently unreachable.'
  ) {
    super(message);
    this.name = 'MongoAssignmentUnavailableError';
  }
}

export type VideoLike = Record<string, unknown> & {
  _id?: string;
  id?: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  videoUrl?: string;
  duration?: number;
  category?: string;
  isShort?: boolean;
  isPublished?: boolean;
  shortsRank?: number;
  views?: number;
  createdAt?: string | Date;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  workflow?: Record<string, unknown> | null;
  slug?: string;
  articleId?: string;
  posterUrl?: string;
  mediaProvider?: string;
  playbackUrl?: string;
  hlsUrl?: string;
  aspectRatio?: string;
  captionUrl?: string;
  transcript?: string;
  processingStatus?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
};

export type WorkflowActionBody = {
  action?: ContentTransitionAction;
  assignedToId?: string;
  scheduledFor?: string;
  dueAt?: string;
  priority?: string;
  rejectionReason?: string;
  comment?: string;
};

export type AssigneeRef = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};

export type AdminVideoListQuery = {
  category?: string | null;
  type?: string | null;
  search?: string;
  sort?: string | null;
  published?: boolean;
  workflowStatus?: string;
  limit?: string | null;
  page?: string | null;
};

export type AdminVideoListResult = {
  videos: VideoLike[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
};

export type SwipeArticlePreview = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  author: string;
  city?: string;
  publishedAt: string;
  href: string;
};

export type PublicSwipeStory = {
  video: PublicVideoItem;
  article: SwipeArticlePreview | null;
};

export type PublicVideoFeedPageOptions = {
  limit?: number | string | null;
  cursorPublishedAt?: string | null;
  cursorId?: string | null;
};

export type PublicSwipeFeedOptions = {
  limit?: unknown;
  cursorPublishedAt?: string | null;
  cursorId?: string | null;
};
