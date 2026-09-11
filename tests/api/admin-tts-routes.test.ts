import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionFromReqMock = vi.fn();
const listAssetsMock = vi.fn();
const cleanupAssetsMock = vi.fn();
const revalidateAssetsMock = vi.fn();
const getSettingsMock = vi.fn();
const recordConfigAttemptMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionFromReqMock,
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/server/audio/ttsService', () => {
  class MockTtsValidationError extends Error {
    readonly status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.name = 'TtsValidationError';
      this.status = status;
    }
  }

  return {
    TtsValidationError: MockTtsValidationError,
    ttsService: {
      listAssets: listAssetsMock,
      cleanupAssets: cleanupAssetsMock,
      revalidateAssets: revalidateAssetsMock,
      getSettings: getSettingsMock,
      recordConfigAttempt: recordConfigAttemptMock,
    },
  };
});

function createGetRequest(url: string) {
  return new Request(url, {
    method: 'GET',
  }) as unknown as NextRequest;
}

function createPostRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

function createPutRequest(url: string, body?: unknown) {
  return new Request(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('Admin TTS Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/tts/assets', () => {
    it('returns 401 when not logged in', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(null);
      const { GET } = await import('@/app/api/admin/tts/assets/route');
      const res = await GET(createGetRequest('http://localhost/api/admin/tts/assets'));
      expect(res.status).toBe(401);
    });

    it('delegates parsed query params to ttsService.listAssets', async () => {
      getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });
      listAssetsMock.mockResolvedValue({
        filters: { status: 'ready', limit: 20 },
        summary: { totalAssets: 1 },
        assets: [],
      });

      const { GET } = await import('@/app/api/admin/tts/assets/route');
      const res = await GET(
        createGetRequest('http://localhost/api/admin/tts/assets?status=ready&limit=20&sourceIds=art-1,art-2')
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(listAssetsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          limit: 20,
          sourceIds: ['art-1', 'art-2'],
        }),
        expect.objectContaining({ id: 'admin-1' })
      );
    });
  });

  describe('POST /api/admin/tts/cleanup', () => {
    it('returns 401 when not logged in', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(null);
      const { POST } = await import('@/app/api/admin/tts/cleanup/route');
      const res = await POST(createPostRequest('http://localhost/api/admin/tts/cleanup'));
      expect(res.status).toBe(401);
    });

    it('delegates to ttsService.cleanupAssets', async () => {
      getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });
      cleanupAssetsMock.mockResolvedValue({
        deletedAssets: 2,
        deletedFiles: 2,
        dryRun: false,
      });

      const { POST } = await import('@/app/api/admin/tts/cleanup/route');
      const res = await POST(
        createPostRequest('http://localhost/api/admin/tts/cleanup', {
          status: 'stale',
          dryRun: false,
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(cleanupAssetsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'stale',
          dryRun: false,
        }),
        expect.objectContaining({ id: 'admin-1' })
      );
    });
  });

  describe('POST /api/admin/tts/revalidate', () => {
    it('returns 401 when not logged in', async () => {
      getAdminSessionFromReqMock.mockResolvedValue(null);
      const { POST } = await import('@/app/api/admin/tts/revalidate/route');
      const res = await POST(createPostRequest('http://localhost/api/admin/tts/revalidate'));
      expect(res.status).toBe(401);
    });

    it('delegates to ttsService.revalidateAssets', async () => {
      getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });
      revalidateAssetsMock.mockResolvedValue({
        processed: 5,
        ready: 5,
        stale: 0,
        unchanged: 5,
      });

      const { POST } = await import('@/app/api/admin/tts/revalidate/route');
      const res = await POST(
        createPostRequest('http://localhost/api/admin/tts/revalidate', {
          status: 'all',
          limit: 10,
        })
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(revalidateAssetsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'all',
          limit: 10,
        }),
        expect.objectContaining({ id: 'admin-1' })
      );
    });
  });

  describe('TTS Settings GET and PUT 405 Contract', () => {
    it('GET delegates to ttsService.getSettings', async () => {
      getAdminSessionFromReqMock.mockResolvedValue({ id: 'super-1', role: 'super_admin' });
      getSettingsMock.mockResolvedValue({
        mode: 'manual-upload-only',
        message: 'Auto-TTS (Gemini) has been removed.',
        storage: { mode: 'spaces', writable: true, digitalOceanSpacesConfigured: true },
        assets: { ready: 10, failed: 0, stale: 1 },
      });

      const { GET } = await import('@/app/api/admin/tts/settings/route');
      const res = await GET(createGetRequest('http://localhost/api/admin/tts/settings'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.mode).toBe('manual-upload-only');
    });

    it('PUT rejects auto-TTS configuration with 405 and records skipped audit event', async () => {
      getAdminSessionFromReqMock.mockResolvedValue({ id: 'admin-1', role: 'admin' });

      const { PUT } = await import('@/app/api/admin/tts/settings/route');
      const res = await PUT(
        createPutRequest('http://localhost/api/admin/tts/settings', {
          enabled: true,
          provider: 'gemini',
        })
      );
      const data = await res.json();

      expect(res.status).toBe(405);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Auto-TTS configuration has been removed');
      expect(recordConfigAttemptMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'admin-1' })
      );
    });
  });
});
