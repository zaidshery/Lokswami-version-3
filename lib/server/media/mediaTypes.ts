export type MediaUploadPurpose =
  | 'image'
  | 'story-thumbnail'
  | 'video-thumbnail'
  | 'epaper-thumbnail'
  | 'epaper-paper';

export type MediaAssetStatus =
  | 'pending'
  | 'verified'
  | 'attached'
  | 'cleanup_pending'
  | 'deleted'
  | 'failed';

export type MediaOwnerType = 'library' | 'article' | 'story' | 'video' | 'epaper';

export interface MediaReference {
  ownerType: MediaOwnerType;
  ownerId: string;
  field?: string;
  attachedAt: string | Date;
}

export interface MediaRecord {
  _id?: string;
  filename: string;
  url: string;
  size?: number;
  type?: string;
  uploadedBy?: string;
  createdById?: string;
  provider?: 'do-spaces' | 'legacy';
  objectKey?: string;
  status?: MediaAssetStatus;
  mediaKind?: 'image' | 'video' | 'document';
  ownerType?: MediaOwnerType;
  ownerId?: string;
  expectedSize?: number;
  referenceTrackingComplete?: boolean;
  references?: MediaReference[];
  variants?: MediaOptimizedVariantMap;
  cleanupError?: string;
  verifiedAt?: string | Date;
  deletedAt?: string | Date;
  updatedAt?: string | Date;
  createdAt?: string | Date;
}

export interface MediaUploadRule {
  maxSizeBytes: number;
  errorType: string;
  errorSize: string;
  folder: string;
  resourceType: 'image' | 'raw' | 'auto';
  isAllowed: (file: File) => boolean;
}

export interface MediaOptimizedVariantMap {
  landscape16x9?: string;
  standard4x3?: string;
  square1x1?: string;
  webp?: string;
  avif?: string;
  [key: string]: string | undefined;
}

export interface MediaUploadResult {
  assetId: string;
  url: string;
  secureUrl: string;
  publicId: string;
  resourceType: string;
  storageProvider: 'do-spaces';
  filename: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  format?: string;
  variants?: MediaOptimizedVariantMap;
}

export interface UploadBufferOptions {
  folder?: string;
  publicId?: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
  overwrite?: boolean;
  originalFilename?: string;
}

export interface BrowserUploadTargetOptions {
  key: string;
  contentType: string;
  expiresSeconds?: number;
}

export interface VerifyUploadedObjectOptions {
  key: string;
}
