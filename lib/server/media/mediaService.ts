import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { canDeleteContent } from '@/lib/auth/permissions';
import { isReporterDeskRole } from '@/lib/auth/roles';
import {
  mediaImageService,
  type MediaImageService,
} from './mediaImageService';
import {
  mediaRepository,
  type MediaRepository,
} from './mediaRepository';
import type {
  MediaRecord,
  MediaUploadPurpose,
  MediaUploadResult,
  MediaUploadRule,
} from './mediaTypes';
import {
  spacesAdapter,
  type SpacesAdapter,
} from './spacesAdapter';

export class MediaValidationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'MediaValidationError';
    this.status = status;
  }
}

function bytesFromMb(mb: number) {
  return mb * 1024 * 1024;
}

function isPdf(file: File) {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf');
}

function isImage(file: File) {
  const mime = file.type.trim().toLowerCase();
  const name = file.name.trim().toLowerCase();
  return (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    mime === 'image/webp' ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  );
}

function isImageOrPdf(file: File) {
  return isImage(file) || isPdf(file);
}

function getUploadRule(purpose: MediaUploadPurpose): MediaUploadRule {
  if (purpose === 'epaper-paper') {
    return {
      maxSizeBytes: bytesFromMb(25),
      errorType: 'E-paper file must be a PDF',
      errorSize: 'E-paper PDF size must be less than 25MB',
      folder: 'lokswami/epapers/papers',
      resourceType: 'raw',
      isAllowed: isPdf,
    };
  }

  if (purpose === 'epaper-thumbnail') {
    return {
      maxSizeBytes: bytesFromMb(10),
      errorType: 'Thumbnail must be JPG, JPEG, PNG, or WEBP',
      errorSize: 'Thumbnail size must be less than 10MB',
      folder: 'lokswami/epapers/thumbnails',
      resourceType: 'image',
      isAllowed: isImage,
    };
  }

  if (purpose === 'video-thumbnail') {
    return {
      maxSizeBytes: bytesFromMb(10),
      errorType: 'Video thumbnail must be JPG, JPEG, PNG, WEBP, or PDF',
      errorSize: 'Video thumbnail size must be less than 10MB',
      folder: 'lokswami/videos/thumbnails',
      resourceType: 'auto',
      isAllowed: isImageOrPdf,
    };
  }

  if (purpose === 'story-thumbnail') {
    return {
      maxSizeBytes: bytesFromMb(10),
      errorType: 'Story thumbnail must be JPG, JPEG, PNG, or WEBP',
      errorSize: 'Story thumbnail size must be less than 10MB',
      folder: 'lokswami/stories/thumbnails',
      resourceType: 'image',
      isAllowed: isImage,
    };
  }

  return {
    maxSizeBytes: bytesFromMb(5),
    errorType: 'Only JPG, JPEG, PNG, or WEBP image files are allowed',
    errorSize: 'Image size must be less than 5MB',
    folder: 'lokswami/images',
    resourceType: 'image',
    isAllowed: isImage,
  };
}

function canUseUploadPurpose(role: string | null | undefined, purpose: MediaUploadPurpose) {
  if (!isReporterDeskRole(role)) {
    return true;
  }

  return purpose === 'image' || purpose === 'story-thumbnail';
}

export class MediaService {
  constructor(
    private readonly repository: MediaRepository = mediaRepository,
    private readonly spaces: SpacesAdapter = spacesAdapter,
    private readonly imageService: MediaImageService = mediaImageService
  ) {}

  async listMedia(user: AdminSessionIdentity): Promise<MediaRecord[]> {
    return this.repository.listMedia(user);
  }

  async createMedia(
    data: { filename: string; url: string; size?: number; type?: string },
    user: AdminSessionIdentity
  ): Promise<MediaRecord> {
    if (!data.filename || !data.url) {
      throw new MediaValidationError('Missing fields', 400);
    }

    return this.repository.createMedia({
      ...data,
      uploadedBy: user.email || 'admin',
    });
  }

  async deleteMedia(id: string, user: AdminSessionIdentity): Promise<void> {
    if (!canDeleteContent(user)) {
      throw new MediaValidationError('Only admins can delete media assets.', 403);
    }

    const deleted = await this.repository.deleteMediaById(id);
    if (!deleted) {
      throw new MediaValidationError('Not found', 404);
    }
  }

  async processUpload(
    file: File,
    purpose: MediaUploadPurpose,
    userRole: string | null | undefined,
    options: {
      optimizeArticleImage?: boolean;
      focalPointX?: number;
      focalPointY?: number;
    } = {}
  ): Promise<MediaUploadResult> {
    if (!canUseUploadPurpose(userRole, purpose)) {
      throw new MediaValidationError(
        'Reporters can only upload image assets from this workspace.',
        403
      );
    }

    const rule = getUploadRule(purpose);
    if (!rule.isAllowed(file)) {
      throw new MediaValidationError(rule.errorType, 400);
    }

    if (file.size > rule.maxSizeBytes) {
      throw new MediaValidationError(rule.errorSize, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (purpose === 'image' && options.optimizeArticleImage) {
      const optimized = await this.imageService.uploadOptimizedArticleImage(
        {
          buffer,
          filename: file.name || 'article-image',
          folder: rule.folder,
          focalPointX: options.focalPointX ?? 50,
          focalPointY: options.focalPointY ?? 50,
        },
        this.spaces
      );

      return {
        url: optimized.primary.secureUrl,
        secureUrl: optimized.primary.secureUrl,
        publicId: optimized.primary.publicId,
        resourceType: optimized.primary.resourceType,
        storageProvider: 'do-spaces',
        filename: optimized.filename,
        size: optimized.primary.bytes,
        type: 'image/webp',
        width: optimized.width,
        height: optimized.height,
        format: 'webp',
        variants: optimized.variants,
      };
    }

    const uploaded = await this.spaces.uploadBuffer(buffer, {
      folder: rule.folder,
      resourceType: rule.resourceType,
      originalFilename: file.name || undefined,
    });

    return {
      url: uploaded.secureUrl,
      secureUrl: uploaded.secureUrl,
      publicId: uploaded.publicId,
      resourceType: uploaded.resourceType,
      storageProvider: 'do-spaces',
      filename: file.name,
      size: uploaded.bytes || file.size,
      type: file.type,
    };
  }
}

export const mediaService = new MediaService();
