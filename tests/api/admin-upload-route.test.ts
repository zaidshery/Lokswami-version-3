import type { NextRequest } from 'next/server';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionFromReqMock = vi.fn();
const uploadBufferToSpacesMock = vi.fn();
const createMediaMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionFromReqMock,
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/utils/digitalOceanSpaces', () => ({
  uploadBufferToDigitalOceanSpaces: uploadBufferToSpacesMock,
}));

vi.mock('@/lib/server/media/mediaRepository', () => ({
  MediaRepository: class {},
  mediaRepository: {
    createMedia: createMediaMock,
  },
}));

function createRequest(formData: FormData) {
  return {
    formData: vi.fn(async () => formData),
    clone: function () {
      return this;
    },
  } as unknown as NextRequest;
}

function createFile(
  name: string,
  type: string,
  contents: string | Uint8Array = new Uint8Array([0xff, 0xd8, 0xff])
) {
  return new File([contents as BlobPart], name, { type });
}

describe('/api/admin/upload POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMediaMock.mockImplementation(async (data) => ({ ...data, _id: 'asset-1' }));
  });

  it('returns 401 for guests', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(null);

    const formData = new FormData();
    formData.set('file', createFile('image.jpg', 'image/jpeg'));

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(createRequest(formData));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expect(uploadBufferToSpacesMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported image file types before upload', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const formData = new FormData();
    formData.set('file', createFile('notes.txt', 'text/plain'));

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(createRequest(formData));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: 'Only JPG, JPEG, PNG, or WEBP image files are allowed',
    });
    expect(uploadBufferToSpacesMock).not.toHaveBeenCalled();
  });

  it('allows reporters to upload regular image assets', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'reporter-1', role: 'reporter' });
    uploadBufferToSpacesMock.mockResolvedValue({
      secureUrl: 'https://cdn.example.com/lokswami/images/image.jpg',
      publicId: 'lokswami/images/image.jpg',
      resourceType: 'image',
      bytes: 2048,
    });

    const formData = new FormData();
    formData.set('file', createFile('image.jpg', 'image/jpeg'));

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(createRequest(formData));
    const payload = await response.json();

    expect(payload, JSON.stringify(payload)).not.toHaveProperty('error');
    expect(response.status).toBe(201);
    expect(uploadBufferToSpacesMock).toHaveBeenCalledTimes(1);
    expect(payload.data.url).toBe('https://cdn.example.com/lokswami/images/image.jpg');
  });

  it('creates focal-point WebP, AVIF, and responsive crops for article images', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    uploadBufferToSpacesMock.mockImplementation(
      async (_buffer: Buffer, options: { originalFilename?: string }) => ({
        secureUrl: `https://cdn.example.com/${options.originalFilename}`,
        publicId: `lokswami/images/${options.originalFilename}`,
        resourceType: 'image',
        bytes: 1024,
      })
    );
    const png = await sharp({
      create: {
        width: 16,
        height: 9,
        channels: 4,
        background: { r: 36, g: 99, b: 235, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const pngBytes = new Uint8Array(png.byteLength);
    pngBytes.set(png);
    const formData = new FormData();
    formData.set('file', new File([pngBytes], 'desk-photo.png', { type: 'image/png' }));
    formData.set('purpose', 'image');
    formData.set('optimizeArticleImage', 'true');
    formData.set('focalPointX', '30');
    formData.set('focalPointY', '70');

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(createRequest(formData));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(uploadBufferToSpacesMock).toHaveBeenCalledTimes(5);
    expect(payload.data.type).toBe('image/webp');
    expect(payload.data.variants).toEqual({
      landscape16x9: 'https://cdn.example.com/desk-photo-16x9.webp',
      standard4x3: 'https://cdn.example.com/desk-photo-4x3.webp',
      square1x1: 'https://cdn.example.com/desk-photo-1x1.webp',
      webp: 'https://cdn.example.com/desk-photo-optimized.webp',
      avif: 'https://cdn.example.com/desk-photo-optimized.avif',
    });
  });

  it('reads upload form data directly without cloning the request body', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    uploadBufferToSpacesMock.mockResolvedValue({
      secureUrl: 'https://cdn.example.com/lokswami/images/image.jpg',
      publicId: 'lokswami/images/image.jpg',
      resourceType: 'image',
      bytes: 2048,
    });

    const formData = new FormData();
    formData.set('file', createFile('image.jpg', 'image/jpeg'));
    const originalFormData = vi.fn(async () => formData);
    const cloneFormData = vi.fn(async () => formData);
    const request = {
      formData: originalFormData,
      clone: vi.fn(() => ({ formData: cloneFormData })),
    } as unknown as NextRequest;

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(originalFormData).toHaveBeenCalledTimes(1);
    expect(request.clone).not.toHaveBeenCalled();
    expect(cloneFormData).not.toHaveBeenCalled();
  });

  it('falls back to a request clone for retriable body read errors', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    uploadBufferToSpacesMock.mockResolvedValue({
      secureUrl: 'https://cdn.example.com/lokswami/images/image.jpg',
      publicId: 'lokswami/images/image.jpg',
      resourceType: 'image',
      bytes: 2048,
    });

    const formData = new FormData();
    formData.set('file', createFile('image.jpg', 'image/jpeg'));
    const originalFormData = vi.fn(async () => {
      throw new Error('Response body object should not be disturbed or locked');
    });
    const cloneFormData = vi.fn(async () => formData);
    const request = {
      formData: originalFormData,
      clone: vi.fn(() => ({ formData: cloneFormData })),
    } as unknown as NextRequest;

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(originalFormData).toHaveBeenCalledTimes(1);
    expect(request.clone).toHaveBeenCalledTimes(1);
    expect(cloneFormData).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when upload form data cannot be read', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    const error = new Error('Response body object should not be disturbed or locked');
    const request = {
      formData: vi.fn(async () => {
        throw error;
      }),
      clone: vi.fn(() => ({
        formData: vi.fn(async () => {
          throw error;
        }),
      })),
    } as unknown as NextRequest;

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: 'Failed to process request body',
    });
    expect(uploadBufferToSpacesMock).not.toHaveBeenCalled();
  });

  it('blocks reporter uploads for desk-only purposes', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'reporter-1', role: 'reporter' });

    const formData = new FormData();
    formData.set('purpose', 'epaper-paper');
    formData.set(
      'file',
      createFile('edition.pdf', 'application/pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))
    );

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(createRequest(formData));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      success: false,
      error: 'Reporters can only upload image assets from this workspace.',
    });
    expect(uploadBufferToSpacesMock).not.toHaveBeenCalled();
  });

  it('rejects oversized e-paper PDFs', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const file = createFile('edition.pdf', 'application/pdf');
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: 26 * 1024 * 1024,
    });

    const formData = new FormData();
    formData.set('purpose', 'epaper-paper');
    formData.set('file', file);

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(createRequest(formData));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: 'E-paper PDF size must be less than 25MB',
    });
    expect(uploadBufferToSpacesMock).not.toHaveBeenCalled();
  });

  it('uploads valid e-paper PDFs with the raw DigitalOcean Spaces pipeline', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    uploadBufferToSpacesMock.mockResolvedValue({
      secureUrl: 'https://lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com/lokswami/epapers/papers/edition.pdf',
      publicId: 'lokswami/epapers/papers/edition.pdf',
      resourceType: 'raw',
      bytes: 1234,
    });

    const formData = new FormData();
    formData.set('purpose', 'epaper-paper');
    formData.set('file', createFile('edition.pdf', 'application/pdf', '%PDF-1.4'));

    const { POST } = await import('@/app/api/admin/upload/route');
    const response = await POST(createRequest(formData));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(uploadBufferToSpacesMock).toHaveBeenCalledTimes(1);

    const [buffer, options] = uploadBufferToSpacesMock.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(options).toEqual({
      folder: 'lokswami/epapers/papers',
      resourceType: 'raw',
      originalFilename: 'edition.pdf',
    });

    expect(payload).toEqual({
      success: true,
      message: 'File uploaded successfully',
      data: {
        assetId: 'asset-1',
        url: 'https://lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com/lokswami/epapers/papers/edition.pdf',
        secureUrl:
          'https://lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com/lokswami/epapers/papers/edition.pdf',
        publicId: 'lokswami/epapers/papers/edition.pdf',
        resourceType: 'raw',
        storageProvider: 'do-spaces',
        filename: 'edition.pdf',
        size: 1234,
        type: 'application/pdf',
      },
    });
  });
});
