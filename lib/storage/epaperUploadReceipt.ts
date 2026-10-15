import 'server-only';
import crypto from 'crypto';
import { getJwtSecretOrNull } from '@/lib/auth/jwtSecret';
import {
  EpaperValidationError,
} from '@/lib/server/epaper/epaperTypes';
import { assertValidEpaperAssetKey } from './epaperAssetUpload';

export interface EpaperUploadReceiptPayload {
  v: 1;
  purpose: 'epaper_pdf_upload';
  uploadId: string;
  epaperId: string;
  familyId?: string;
  revisionNumber?: number;
  actorId: string;
  mediaKey: string;
  expectedFileType: string;
  maxBytes: number;
  issuedAt: number;
  expiresAt: number;
}

function getReceiptSecret(): string {
  const secret = getJwtSecretOrNull();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET, NEXTAUTH_SECRET, or AUTH_SECRET must be configured for upload receipts.');
  }
  return 'lokswami-epaper-receipt-signing-secret-dev-fallback';
}

export function createEpaperUploadReceipt(params: {
  epaperId: string;
  familyId?: string;
  revisionNumber?: number;
  actorId: string;
  mediaKey: string;
  expectedFileType?: string;
  maxBytes?: number;
  expiresInSeconds?: number;
}): { receiptToken: string; expiresAt: number; uploadId: string } {
  const uploadId = crypto.randomUUID();
  const now = Date.now();
  const ttlMs = (params.expiresInSeconds || 10 * 60) * 1000;
  const expiresAt = now + ttlMs;

  const payload: EpaperUploadReceiptPayload = {
    v: 1,
    purpose: 'epaper_pdf_upload',
    uploadId,
    epaperId: params.epaperId,
    familyId: params.familyId,
    revisionNumber: params.revisionNumber,
    actorId: params.actorId,
    mediaKey: params.mediaKey,
    expectedFileType: params.expectedFileType || 'application/pdf',
    maxBytes: params.maxBytes || 25 * 1024 * 1024,
    issuedAt: now,
    expiresAt,
  };

  const secret = getReceiptSecret();
  const serialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(serialized).digest('base64url');
  const receiptToken = `${serialized}.${signature}`;

  return { receiptToken, expiresAt, uploadId };
}

export function verifyEpaperUploadReceipt(params: {
  receiptToken: unknown;
  actorId: string;
  expectedEpaperId: string;
  expectedMediaKey: string;
  expectedRevisionNumber?: number;
}): EpaperUploadReceiptPayload {
  if (typeof params.receiptToken !== 'string' || !params.receiptToken.trim()) {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_INVALID: Upload receipt is required.');
  }

  const parts = params.receiptToken.trim().split('.');
  if (parts.length !== 2) {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_INVALID: Malformed upload receipt token.');
  }

  const [payloadBase64, receivedSig] = parts;
  const secret = getReceiptSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');

  const receivedBuffer = Buffer.from(receivedSig);
  const expectedBuffer = Buffer.from(expectedSig);

  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_INVALID: Invalid upload receipt signature.');
  }

  let payload: EpaperUploadReceiptPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  } catch {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_INVALID: Failed to parse upload receipt.');
  }

  if (payload.v !== 1 || payload.purpose !== 'epaper_pdf_upload') {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_INVALID: Invalid upload receipt purpose or version.');
  }

  if (Date.now() > payload.expiresAt) {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_EXPIRED: Upload receipt has expired.');
  }

  if (payload.actorId !== params.actorId) {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_ACTOR_MISMATCH: Upload receipt was issued to a different administrator.');
  }

  if (payload.epaperId !== params.expectedEpaperId) {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_TARGET_MISMATCH: Upload receipt does not match target edition.');
  }

  if (
    params.expectedRevisionNumber !== undefined &&
    payload.revisionNumber !== undefined &&
    payload.revisionNumber !== params.expectedRevisionNumber
  ) {
    throw new EpaperValidationError('EPAPER_UPLOAD_RECEIPT_TARGET_MISMATCH: Upload receipt revision mismatch.');
  }

  if (payload.mediaKey !== params.expectedMediaKey) {
    throw new EpaperValidationError('EPAPER_UPLOAD_KEY_MISMATCH: Upload receipt object key does not match target media key.');
  }

  // Validate object key structure (no traversal, valid prefix)
  assertValidEpaperAssetKey('epaper_pdf', payload.mediaKey);

  return payload;
}
