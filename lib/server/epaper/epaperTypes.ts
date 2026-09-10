import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { EPaperPublicationType } from '@/lib/types/epaper';
import type { PublicEpaperFilterState } from '@/lib/utils/publicEpaperFilters';

export type { AdminSessionIdentity, EPaperPublicationType, PublicEpaperFilterState };

export type EpaperStore = 'mongo' | 'file';
export type EpaperRecord = Record<string, unknown>;

export type EpaperPageDTO = {
  pageNumber: number;
  imagePath: string;
  width: number | undefined;
  height: number | undefined;
  pageType: 'editorial' | 'advertisement' | 'classified' | 'photo' | 'blank';
  classificationNote: string;
  processingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  processingError: string;
  reviewStatus: 'pending' | 'needs_attention' | 'ready';
  reviewNote: string;
  reviewedAt: string | null;
  reviewedBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
};

export type PublicEpaperFeedItem = {
  _id: string;
  publicationType: EPaperPublicationType;
  citySlug: string;
  cityName: string;
  title: string;
  publishDate: string;
  thumbnailPath: string;
  pdfPath: string;
  status: 'published';
  pageCount: number;
  pagesWithImage: number;
  editionDate: string;
  publishedAt: string;
};

export type PublicEpaperFeedInput = {
  filters: PublicEpaperFilterState;
  limit?: unknown;
  cursorPublishedAt?: string | null;
  cursorId?: string | null;
};

export type PublicEpaperListInput = {
  filters: PublicEpaperFilterState;
  limit: number;
  page: number;
};

export type PublicEpaperMetadata = {
  id: string;
  citySlug: string;
  cityName: string;
  title: string;
  publishDate: string;
  thumbnailPath: string;
  pageCount: number;
};

export type PublicEpaperStoryMetadata = {
  releaseVersion?: number;
  pageImagePath?: string;
  hotspot?: import('@/lib/types/epaper').EPaperArticleHotspot;
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImagePath: string;
  pageNumber: number;
};

export class EpaperDomainError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly exposeMessage = true
  ) {
    super(message);
    this.name = 'EpaperDomainError';
  }
}

export class InvalidEpaperIdError extends EpaperDomainError {
  constructor(message = 'Invalid e-paper ID') {
    super(message, 400);
    this.name = 'InvalidEpaperIdError';
  }
}

export class EpaperNotFoundError extends EpaperDomainError {
  constructor(message = 'E-paper not found') {
    super(message, 404);
    this.name = 'EpaperNotFoundError';
  }
}

export class EpaperValidationError extends EpaperDomainError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'EpaperValidationError';
  }
}

export class EpaperForbiddenError extends EpaperDomainError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'EpaperForbiddenError';
  }
}

export class EpaperConflictError extends EpaperDomainError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'EpaperConflictError';
  }
}

export class EpaperStoreUnavailableError extends EpaperDomainError {
  constructor(message: string) {
    super(message, 503);
    this.name = 'EpaperStoreUnavailableError';
  }
}

export type ServiceResponse<T = unknown> = {
  status: number;
  payload: T;
  headers?: Record<string, string>;
};
