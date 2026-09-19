import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const getAdminSessionFromReqMock = vi.fn();
const createEpaperAssetUploadTargetMock = vi.fn();
const parseEpaperAssetSizeMock = vi.fn();
const validateEpaperAssetSelectionMock = vi.fn();
const verifyEpaperAssetUploadMock = vi.fn();
const connectDBMock = vi.fn();
const epaperFindByIdMock = vi.fn();
const epaperArticleFindOneMock = vi.fn();
const buildEpaperStoryTtsTextMock = vi.fn();
const saveManualTtsAssetMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/EPaper', () => ({
  default: {
    findById: epaperFindByIdMock,
  },
}));

vi.mock('@/lib/models/EPaperArticle', () => ({
  default: {
    findOne: epaperArticleFindOneMock,
  },
}));

vi.mock('@/lib/server/ttsAssets', () => ({
  buildEpaperStoryTtsText: buildEpaperStoryTtsTextMock,
  saveManualTtsAsset: saveManualTtsAssetMock,
}));

vi.mock('@/lib/storage/epaperAssetUpload', () => ({
  EPAPER_ASSET_KINDS: [
    'epaper_pdf',
    'epaper_thumbnail',
    'epaper_page_image',
    'epaper_story_audio',
  ],
  createEpaperAssetUploadTarget: createEpaperAssetUploadTargetMock,
  parseEpaperAssetSize: parseEpaperAssetSizeMock,
  validateEpaperAssetSelection: validateEpaperAssetSelectionMock,
  verifyEpaperAssetUpload: verifyEpaperAssetUploadMock,
}));

function createJsonRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/uploads/epaper-asset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('e-paper direct upload admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminSessionFromReqMock.mockImplementation((...args) =>
      getAdminSessionMock(...args)
    );
    parseEpaperAssetSizeMock.mockImplementation((value: unknown) => Number(value || 0));
    validateEpaperAssetSelectionMock.mockReturnValue(null);
    connectDBMock.mockResolvedValue(undefined);
    buildEpaperStoryTtsTextMock.mockReturnValue('Readable story text');
  });

  it('initializes signed upload targets for valid e-paper assets', async () => {
    getAdminSessionMock.mockResolvedValue({ id: 'super-admin-1', role: 'super_admin' });
    createEpaperAssetUploadTargetMock.mockReturnValue({
      kind: 'epaper_pdf',
      mediaKey: 'lokswami/epapers/indore/2026-05-05/pdf/edition.pdf',
      mediaUrl: 'https://cdn.example.com/lokswami/epapers/indore/2026-05-05/pdf/edition.pdf',
      uploadUrl: 'https://origin.example.com/signed-put',
      uploadHeaders: { 'Content-Type': 'application/pdf' },
      expiresAt: '2026-05-05T12:00:00.000Z',
    });

    const { POST } = await import('@/app/api/admin/uploads/epaper-asset/init/route');
    const response = await POST(
      createJsonRequest({
        kind: 'epaper_pdf',
        fileName: 'edition.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        citySlug: 'indore',
        publishDate: '2026-05-05',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(createEpaperAssetUploadTargetMock).toHaveBeenCalledWith({
      kind: 'epaper_pdf',
      fileName: 'edition.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      publicationType: 'epaper',
      citySlug: 'indore',
      publishDate: '2026-05-05',
      pageNumber: 0,
      articleId: '',
    });
    expect(payload).toEqual({
      success: true,
      message: 'E-paper asset upload initialized successfully',
      data: {
        kind: 'epaper_pdf',
        mediaKey: 'lokswami/epapers/indore/2026-05-05/pdf/edition.pdf',
        mediaUrl: 'https://cdn.example.com/lokswami/epapers/indore/2026-05-05/pdf/edition.pdf',
        uploadUrl: 'https://origin.example.com/signed-put',
        uploadHeaders: { 'Content-Type': 'application/pdf' },
        expiresAt: '2026-05-05T12:00:00.000Z',
      },
    });
  });

  it('returns init validation failures before creating signed URLs', async () => {
    getAdminSessionMock.mockResolvedValue({ id: 'super-admin-1', role: 'super_admin' });
    validateEpaperAssetSelectionMock.mockReturnValue('E-paper PDF must be a PDF file.');

    const { POST } = await import('@/app/api/admin/uploads/epaper-asset/init/route');
    const response = await POST(
      createJsonRequest({
        kind: 'epaper_pdf',
        fileName: 'edition.txt',
        fileType: 'text/plain',
        fileSize: 1024,
        citySlug: 'indore',
        publishDate: '2026-05-05',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: 'E-paper PDF must be a PDF file.',
    });
    expect(createEpaperAssetUploadTargetMock).not.toHaveBeenCalled();
  });

  it('verifies completed non-audio assets before returning metadata', async () => {
    getAdminSessionMock.mockResolvedValue({ id: 'super-admin-1', role: 'super_admin' });
    verifyEpaperAssetUploadMock.mockResolvedValue({
      kind: 'epaper_thumbnail',
      mediaUrl: 'https://cdn.example.com/lokswami/epapers/indore/2026-05-05/thumbnail/cover.jpg',
      mediaKey: 'lokswami/epapers/indore/2026-05-05/thumbnail/cover.jpg',
      mediaSizeBytes: 2048,
      mediaMimeType: 'image/jpeg',
      storageProvider: 'do-spaces',
    });

    const { POST } = await import('@/app/api/admin/uploads/epaper-asset/complete/route');
    const response = await POST(
      createJsonRequest({
        kind: 'epaper_thumbnail',
        mediaKey: 'lokswami/epapers/indore/2026-05-05/thumbnail/cover.jpg',
        expectedSize: 2048,
        expectedFileType: 'image/jpeg',
        expectedFileName: 'cover.jpg',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(verifyEpaperAssetUploadMock).toHaveBeenCalledWith({
      kind: 'epaper_thumbnail',
      mediaKey: 'lokswami/epapers/indore/2026-05-05/thumbnail/cover.jpg',
      expectedSize: 2048,
      expectedFileType: 'image/jpeg',
      expectedFileName: 'cover.jpg',
    });
    expect(payload).toEqual({
      success: true,
      message: 'E-paper asset upload verified successfully',
      data: {
        asset: {
          kind: 'epaper_thumbnail',
          mediaUrl: 'https://cdn.example.com/lokswami/epapers/indore/2026-05-05/thumbnail/cover.jpg',
          mediaKey: 'lokswami/epapers/indore/2026-05-05/thumbnail/cover.jpg',
          mediaSizeBytes: 2048,
          mediaMimeType: 'image/jpeg',
          storageProvider: 'do-spaces',
        },
      },
    });
  });

  it('creates a ready manual TTS asset after audio upload verification', async () => {
    const epaperId = '665000000000000000000001';
    const articleId = '665000000000000000000002';
    getAdminSessionMock.mockResolvedValue({
      id: 'super-admin-1',
      role: 'super_admin',
      email: 'owner@example.com',
    });
    verifyEpaperAssetUploadMock.mockResolvedValue({
      kind: 'epaper_story_audio',
      mediaUrl: 'https://cdn.example.com/lokswami/tts/epaperArticle/665/manual/listen.mp3',
      mediaKey: 'lokswami/tts/epaperArticle/665/manual/listen.mp3',
      mediaSizeBytes: 4096,
      mediaMimeType: 'audio/mpeg',
      storageProvider: 'do-spaces',
    });
    epaperFindByIdMock.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: epaperId,
        title: 'Indore Daily',
        cityName: 'Indore',
        publishDate: new Date('2026-05-05T00:00:00.000Z'),
      }),
    });
    epaperArticleFindOneMock.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: articleId,
        epaperId,
        pageNumber: 1,
        title: 'Lead Story',
        excerpt: 'Short intro',
        contentHtml: '<p>Full story</p>',
      }),
    });
    saveManualTtsAssetMock.mockResolvedValue({
      _id: 'tts-1',
      status: 'ready',
      provider: 'manual',
      audioUrl: 'https://cdn.example.com/lokswami/tts/epaperArticle/665/manual/listen.mp3',
      voice: 'manual-upload',
      model: 'manual-upload',
      languageCode: 'manual',
      mimeType: 'audio/mpeg',
      generatedAt: new Date('2026-05-05T12:00:00.000Z'),
      updatedAt: new Date('2026-05-05T12:01:00.000Z'),
      lastVerifiedAt: new Date('2026-05-05T12:02:00.000Z'),
      chunkCount: 1,
      charCount: 19,
    });

    const { POST } = await import('@/app/api/admin/uploads/epaper-asset/complete/route');
    const response = await POST(
      createJsonRequest({
        kind: 'epaper_story_audio',
        mediaKey: 'lokswami/tts/epaperArticle/665/manual/listen.mp3',
        expectedSize: 4096,
        expectedFileType: 'audio/mpeg',
        expectedFileName: 'listen.mp3',
        epaperId,
        articleId,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(saveManualTtsAssetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'epaperArticle',
        sourceId: articleId,
        sourceParentId: epaperId,
        variant: 'epaper_story',
        title: 'Lead Story',
        text: 'Readable story text',
        audioUrl: 'https://cdn.example.com/lokswami/tts/epaperArticle/665/manual/listen.mp3',
        mimeType: 'audio/mpeg',
        mediaKey: 'lokswami/tts/epaperArticle/665/manual/listen.mp3',
      })
    );
    expect(payload.data.ttsAsset).toEqual(
      expect.objectContaining({
        id: 'tts-1',
        status: 'ready',
        provider: 'manual',
        audioUrl: 'https://cdn.example.com/lokswami/tts/epaperArticle/665/manual/listen.mp3',
      })
    );
  });

  it('keeps the legacy multipart upload route as a friendly no-body fallback', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'super-admin-1', role: 'super_admin' });
    const formDataMock = vi.fn(() => {
      throw new Error('body disturbed');
    });
    const request = { formData: formDataMock } as unknown as NextRequest;

    const { POST } = await import('@/app/api/admin/epapers/upload/route');
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(formDataMock).not.toHaveBeenCalled();
    expect(payload).toEqual({
      success: false,
      error:
        'Direct DigitalOcean upload is required for e-paper files. Please use the updated CMS upload screen.',
    });
  });

  it('rejects ordinary admins before initializing an e-paper upload', async () => {
    getAdminSessionMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const { POST } = await import('@/app/api/admin/uploads/epaper-asset/init/route');
    const response = await POST(
      createJsonRequest({
        kind: 'epaper_pdf',
        fileName: 'edition.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        citySlug: 'indore',
        publishDate: '2026-05-05',
      })
    );

    expect(response.status).toBe(403);
    expect(createEpaperAssetUploadTargetMock).not.toHaveBeenCalled();
  });
});
