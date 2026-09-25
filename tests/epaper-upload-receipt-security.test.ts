import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  createEpaperUploadReceipt,
  verifyEpaperUploadReceipt,
} from '@/lib/storage/epaperUploadReceipt';
import { EpaperUploadService } from '@/lib/server/epaper/epaperUploadService';
import { EpaperValidationError, EpaperConflictError, type AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';

const actorA: AdminSessionIdentity = {
  id: 'admin-actor-a',
  name: 'Admin Alpha',
  email: 'alpha@lokswami.com',
  username: 'alpha',
  role: 'super_admin',
};

const actorB: AdminSessionIdentity = {
  id: 'admin-actor-b',
  name: 'Admin Bravo',
  email: 'bravo@lokswami.com',
  username: 'bravo',
  role: 'super_admin',
};

describe('Phase 3.9A — Upload Receipt Cryptographic Security Contract', () => {
  const epaperId1 = '507f1f77bcf86cd799439011';
  const epaperId2 = '507f1f77bcf86cd799439022';
  const canonicalKey1 = 'lokswami/epapers/indore/2026-09-25/pdf/20260925Z-abc-asset.pdf';
  const canonicalKey2 = 'lokswami/epapers/bhopal/2026-09-25/pdf/20260925Z-xyz-asset.pdf';

  it('generates a valid signed receipt that successfully verifies with identical parameters', () => {
    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      familyId: 'family-1',
      revisionNumber: 1,
      actorId: actorA.id,
      mediaKey: canonicalKey1,
      expectedFileType: 'application/pdf',
      maxBytes: 25 * 1024 * 1024,
    });

    const verified = verifyEpaperUploadReceipt({
      receiptToken,
      actorId: actorA.id,
      expectedEpaperId: epaperId1,
      expectedMediaKey: canonicalKey1,
      expectedRevisionNumber: 1,
    });

    expect(verified.epaperId).toBe(epaperId1);
    expect(verified.actorId).toBe(actorA.id);
    expect(verified.mediaKey).toBe(canonicalKey1);
    expect(verified.purpose).toBe('epaper_pdf_upload');
    expect(verified.v).toBe(1);
  });

  it('rejects foreign actor: Actor A initializes, Actor B attempts verify', () => {
    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      actorId: actorA.id,
      mediaKey: canonicalKey1,
    });

    expect(() =>
      verifyEpaperUploadReceipt({
        receiptToken,
        actorId: actorB.id,
        expectedEpaperId: epaperId1,
        expectedMediaKey: canonicalKey1,
      })
    ).toThrowError(/EPAPER_UPLOAD_RECEIPT_ACTOR_MISMATCH/);
  });

  it('rejects cross-edition attack: Receipt for Edition A used against Edition B', () => {
    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      actorId: actorA.id,
      mediaKey: canonicalKey1,
    });

    expect(() =>
      verifyEpaperUploadReceipt({
        receiptToken,
        actorId: actorA.id,
        expectedEpaperId: epaperId2,
        expectedMediaKey: canonicalKey1,
      })
    ).toThrowError(/EPAPER_UPLOAD_RECEIPT_TARGET_MISMATCH/);
  });

  it('rejects revision mismatch: Receipt for Revision 2 used against Revision 1', () => {
    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      revisionNumber: 2,
      actorId: actorA.id,
      mediaKey: canonicalKey1,
    });

    expect(() =>
      verifyEpaperUploadReceipt({
        receiptToken,
        actorId: actorA.id,
        expectedEpaperId: epaperId1,
        expectedMediaKey: canonicalKey1,
        expectedRevisionNumber: 1,
      })
    ).toThrowError(/EPAPER_UPLOAD_RECEIPT_TARGET_MISMATCH/);
  });

  it('rejects forged signature when payload is altered', () => {
    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      actorId: actorA.id,
      mediaKey: canonicalKey1,
    });

    const [payloadBase64, sig] = receiptToken.split('.');
    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    // Attacker modifies epaperId in payload
    decoded.epaperId = epaperId2;
    const forgedPayloadBase64 = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    const forgedToken = `${forgedPayloadBase64}.${sig}`;

    expect(() =>
      verifyEpaperUploadReceipt({
        receiptToken: forgedToken,
        actorId: actorA.id,
        expectedEpaperId: epaperId2,
        expectedMediaKey: canonicalKey1,
      })
    ).toThrowError(/EPAPER_UPLOAD_RECEIPT_INVALID/);
  });

  it('rejects forged signature when signature is altered', () => {
    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      actorId: actorA.id,
      mediaKey: canonicalKey1,
    });

    const [payloadBase64] = receiptToken.split('.');
    const forgedToken = `${payloadBase64}.invalidsignature1234567890`;

    expect(() =>
      verifyEpaperUploadReceipt({
        receiptToken: forgedToken,
        actorId: actorA.id,
        expectedEpaperId: epaperId1,
        expectedMediaKey: canonicalKey1,
      })
    ).toThrowError(/EPAPER_UPLOAD_RECEIPT_INVALID/);
  });

  it('rejects expired receipt', () => {
    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      actorId: actorA.id,
      mediaKey: canonicalKey1,
      expiresInSeconds: -10, // already expired
    });

    expect(() =>
      verifyEpaperUploadReceipt({
        receiptToken,
        actorId: actorA.id,
        expectedEpaperId: epaperId1,
        expectedMediaKey: canonicalKey1,
      })
    ).toThrowError(/EPAPER_UPLOAD_RECEIPT_EXPIRED/);
  });

  it('rejects key mismatch when client attempts to finalize with an altered object key', () => {
    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      actorId: actorA.id,
      mediaKey: canonicalKey1,
    });

    expect(() =>
      verifyEpaperUploadReceipt({
        receiptToken,
        actorId: actorA.id,
        expectedEpaperId: epaperId1,
        expectedMediaKey: canonicalKey2, // different key passed in finalize body
      })
    ).toThrowError(/EPAPER_UPLOAD_KEY_MISMATCH/);
  });

  it('rejects directory traversal in canonical key', () => {
    const traversalKey = 'lokswami/epapers/indore/2026-09-25/pdf/../../etc/passwd.pdf';

    expect(() =>
      createEpaperUploadReceipt({
        epaperId: epaperId1,
        actorId: actorA.id,
        mediaKey: traversalKey,
      })
    ).not.toThrow();

    const { receiptToken } = createEpaperUploadReceipt({
      epaperId: epaperId1,
      actorId: actorA.id,
      mediaKey: traversalKey,
    });

    expect(() =>
      verifyEpaperUploadReceipt({
        receiptToken,
        actorId: actorA.id,
        expectedEpaperId: epaperId1,
        expectedMediaKey: traversalKey,
      })
    ).toThrowError(/Uploaded e-paper asset key is invalid/);
  });
});

describe('epaperUploadService.finalize with actor receipts', () => {
  let mockRepo: any;
  let mockWorker: any;
  let service: EpaperUploadService;

  beforeEach(() => {
    mockRepo = {
      connect: vi.fn().mockResolvedValue(undefined),
      isValidId: vi.fn().mockReturnValue(true),
      findEditionById: vi.fn(),
      updateEdition: vi.fn(),
    };
    mockWorker = {
      isPageProcessingEnabled: vi.fn().mockReturnValue(true),
      queuePageProcessing: vi.fn().mockResolvedValue({ _id: 'job-123', status: 'queued' }),
    };
    service = new EpaperUploadService(mockRepo, mockWorker);
  });

  it('blocks finalize if upload receipt is missing or invalid', async () => {
    mockRepo.findEditionById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      status: 'draft',
      productionStatus: 'draft_upload',
      publicationType: 'epaper',
    });

    await expect(
      service.finalize(actorA, '507f1f77bcf86cd799439011', {
        mediaKey: 'lokswami/epapers/indore/2026-09-25/pdf/test.pdf',
        uploadReceipt: 'invalid-or-missing',
      })
    ).rejects.toThrowError(EpaperValidationError);
  });

  it('blocks cross-actor finalize: Actor A initialized, Actor B calls finalize', async () => {
    const epaperId = '507f1f77bcf86cd799439011';
    const mediaKey = 'lokswami/epapers/indore/2026-09-25/pdf/20260925Z-abc-test.pdf';

    const { receiptToken } = createEpaperUploadReceipt({
      epaperId,
      actorId: actorA.id,
      mediaKey,
    });

    mockRepo.findEditionById.mockResolvedValue({
      _id: epaperId,
      status: 'draft',
      productionStatus: 'draft_upload',
      publicationType: 'epaper',
    });

    // Actor B attempts to finalize with Actor A's receipt
    await expect(
      service.finalize(actorB, epaperId, {
        mediaKey,
        uploadReceipt: receiptToken,
      })
    ).rejects.toThrowError(/EPAPER_UPLOAD_RECEIPT_ACTOR_MISMATCH/);
  });
});
