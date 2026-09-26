import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  isMongoAvailableMock,
  getAdminSessionMock,
  logAuditActionMock,
  epaperProcessingRetryMock,
  runFailedLeadershipReportSchedulesMock,
  cleanupAssetsMock,
} = vi.hoisted(() => ({
  isMongoAvailableMock: vi.fn(),
  getAdminSessionMock: vi.fn(),
  logAuditActionMock: vi.fn(),
  epaperProcessingRetryMock: vi.fn(),
  runFailedLeadershipReportSchedulesMock: vi.fn(),
  cleanupAssetsMock: vi.fn(),
}));

vi.mock('@/lib/db/mongoAvailability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/mongoAvailability')>();
  return {
    ...actual,
    isMongoAvailable: isMongoAvailableMock,
  };
});

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

vi.mock('@/lib/security/auditLogger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/auditLogger')>();
  return {
    ...actual,
    logAuditAction: logAuditActionMock,
  };
});

vi.mock('@/lib/server/epaper/epaperProcessingService', () => ({
  epaperProcessingService: {
    retry: epaperProcessingRetryMock,
  },
}));

vi.mock('@/lib/admin/leadershipReportRunner', () => ({
  runFailedLeadershipReportSchedules: runFailedLeadershipReportSchedulesMock,
}));

vi.mock('@/lib/server/audio/ttsService', () => ({
  ttsService: {
    cleanupAssets: cleanupAssetsMock,
  },
  TtsValidationError: class TtsValidationError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  },
}));

import { GET as getHealth } from '@/app/api/health/route';
import { GET as getPublicHealth } from '@/app/api/v1/public/health/route';
import { POST as postBriefingRetry } from '@/app/api/admin/analytics/briefing-schedules/retry-failed/route';
import { POST as postEpaperRetry } from '@/app/api/admin/epapers/[id]/processing/retry/route';
import { POST as postTtsCleanup } from '@/app/api/admin/tts/cleanup/route';
import { POST as postTtsRetry } from '@/app/api/admin/tts/retry/route';
import {
  sanitizeDiagnosticsText,
  sanitizeDiagnosticsRecord,
} from '@/lib/admin/diagnosticsSanitizer';
import {
  buildOcrRuntimeSummary,
  buildUploadRuntimeSummary,
  getOperationalDiagnosticsSnapshot,
  sanitizeOperationalDiagnosticsSnapshot,
  type OperationalDiagnosticsSnapshot,
} from '@/lib/admin/operationalDiagnostics';
import { canViewPage } from '@/lib/auth/permissions';
import { EpaperValidationError } from '@/lib/server/epaper/epaperTypes';

function createPostRequest(url: string, body: Record<string, unknown> = {}): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const originalEnv = { ...process.env };

describe('Phase 3.10D Operations, Diagnostics & Recovery Safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    isMongoAvailableMock.mockResolvedValue(true);
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      name: 'Super Admin',
      email: 'super@lokswami.in',
      role: 'super_admin',
    });
    logAuditActionMock.mockResolvedValue({ id: 'audit-1' });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('Task 31: Admin Diagnostics Data Minimization', () => {
    it('sanitizes connection URIs, tokens, passwords, and synthetic secrets', () => {
      const sensitiveInput =
        'Error connecting to mongodb+srv://dbuser:mypassword123@cluster.lokswami.net/db?authSource=admin; ' +
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token; ' +
        'password=secret_db_password; ' +
        'secret key: TEST_STORAGE_SECRET_9876; ' +
        'TEST_CRON_SECRET_VALUE; ' +
        'Signed URL: https://sfo3.digitaloceanspaces.com/bucket/doc.pdf?X-Amz-Signature=abcdef123456&key=val';

      const sanitized = sanitizeDiagnosticsText(sensitiveInput);

      expect(sanitized).not.toContain('mongodb+srv://');
      expect(sanitized).not.toContain('mongodb://');
      expect(sanitized).not.toContain('mypassword123');
      expect(sanitized).not.toContain('secret_db_password');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(sanitized).not.toContain('TEST_STORAGE_SECRET');
      expect(sanitized).not.toContain('TEST_CRON_SECRET');
      expect(sanitized).not.toContain('X-Amz-Signature=abcdef123456');

      expect(sanitized).toContain('mongodb[REDACTED_URI]');
      expect(sanitized).toContain('Bearer [REDACTED]');
      expect(sanitized).toContain('[REDACTED_SIGNED_URL]');
    });

    it('sanitizes user home filesystem paths', () => {
      const windowsPath = 'Failed to read C:\\Users\\Administrator\\secrets\\key.json file';
      expect(sanitizeDiagnosticsText(windowsPath)).not.toContain('Administrator');
      expect(sanitizeDiagnosticsText(windowsPath)).toContain('[REDACTED_PATH]');
    });

    it('ensures snapshot sanitizer removes secrets from all nested snapshot fields', () => {
      const mockSnapshot: OperationalDiagnosticsSnapshot = {
        dataSource: 'hybrid',
        summary: {
          servicesAtRisk: 1,
          uploadAlerts: 0,
          reportingRisks: 1,
          blockedEditions: 0,
        },
        lanes: [
          {
            id: 'database',
            label: 'Database',
            status: 'critical',
            summary: 'mongodb://cluster.mongo:27017/lokswami auth failed',
            detail: 'password=supersecretpassword',
          },
        ],
        runtimeSignals: [
          {
            label: 'Storage Key',
            value: 'TEST_STORAGE_SECRET_KEY',
            tone: 'critical',
          },
        ],
        alerts: [
          {
            id: 'alert-1',
            tone: 'critical',
            title: 'Webhook delivery error',
            detail: 'Authorization: Bearer secret-token-failed',
          },
        ],
        reportEscalations: [
          {
            scheduleId: 'daily_briefing',
            label: 'Daily brief',
            severity: 'critical',
            recentFailureCount: 2,
            reason: 'TEST_CRON_SECRET failed',
            actionHref: '/admin/analytics',
            actionLabel: 'Inspect',
          },
        ],
        blockedEditions: [],
        lowQualityPages: [],
        recentFailures: [
          {
            id: 'fail-1',
            message: 'Failed to access mongodb+srv://admin:pass@host/db',
            action: 'audio_cleanup',
            sourceType: 'article',
            variant: 'hi_standard',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      const sanitized = sanitizeOperationalDiagnosticsSnapshot(mockSnapshot);
      const serialized = JSON.stringify(sanitized);

      expect(serialized).not.toContain('mongodb://');
      expect(serialized).not.toContain('mongodb+srv://');
      expect(serialized).not.toContain('supersecretpassword');
      expect(serialized).not.toContain('TEST_STORAGE_SECRET');
      expect(serialized).not.toContain('TEST_CRON_SECRET');
      expect(serialized).not.toContain('secret-token-failed');
    });
  });

  describe('Task 32: Public Health Contract & Error Minimization', () => {
    it('returns minimal safe JSON on /api/health when healthy', async () => {
      isMongoAvailableMock.mockResolvedValue(true);

      const res = await getHealth();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({
        status: 'ok',
        db: 'connected',
      });
      expect(json).not.toHaveProperty('reason');
      expect(json).not.toHaveProperty('message');
    });

    it('returns minimal safe HTTP 503 on /api/health when database is unavailable', async () => {
      isMongoAvailableMock.mockResolvedValue(false);

      const res = await getHealth();
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json).toEqual({
        status: 'error',
        db: 'unavailable',
      });
      // Crucial: no stack trace, no connection string, no internal error leak
      expect(json).not.toHaveProperty('reason');
      expect(json).not.toHaveProperty('message');
      expect(JSON.stringify(json)).not.toContain('mongodb');
    });

    it('returns minimal safe HTTP 503 on /api/health if isMongoAvailable throws an unexpected exception', async () => {
      isMongoAvailableMock.mockRejectedValue(new Error('Network timeout connecting to mongo.lokswami.internal'));

      const res = await getHealth();
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json).toEqual({
        status: 'error',
        db: 'unavailable',
      });
      expect(JSON.stringify(json)).not.toContain('mongo.lokswami.internal');
    });

    it('returns minimal safe HTTP 200 on /api/v1/public/health when healthy', async () => {
      isMongoAvailableMock.mockResolvedValue(true);

      const res = await getPublicHealth();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({
        success: true,
        status: 'ok',
        service: 'lokswami-public-api',
        dependencies: {
          mongo: 'available',
        },
      });
      expect(JSON.stringify(json)).not.toContain('mongodb://');
    });

    it('returns minimal safe HTTP 503 on /api/v1/public/health when database is unavailable', async () => {
      isMongoAvailableMock.mockResolvedValue(false);

      const res = await getPublicHealth();
      expect(res.status).toBe(503);

      const json = await res.json();
      expect(json).toEqual({
        success: false,
        status: 'error',
        service: 'lokswami-public-api',
        dependencies: {
          mongo: 'unavailable',
        },
      });
      expect(JSON.stringify(json)).not.toContain('cluster');
    });
  });

  describe('Task 33: Graceful Dependency Degradation', () => {
    it('handles missing DigitalOcean Spaces configuration without throwing', () => {
      delete process.env.DIGITALOCEAN_SPACES_ACCESS_KEY;
      delete process.env.DIGITALOCEAN_SPACES_SECRET_KEY;
      delete process.env.DIGITALOCEAN_SPACES_BUCKET;
      delete process.env.DIGITALOCEAN_SPACES_REGION;

      const summary = buildUploadRuntimeSummary();
      expect(summary.status).toBe('critical');
      expect(summary.summary).toContain('DigitalOcean Spaces upload configuration is missing');
    });

    it('handles remote OCR fallback enabled without provider gracefully', () => {
      process.env.NEXT_PUBLIC_EPAPER_LOCAL_OCR_ONLY = 'false';
      process.env.NEXT_PUBLIC_EPAPER_REMOTE_OCR_FALLBACK = 'true';
      delete process.env.OCR_CUSTOM_API_URL;
      delete process.env.OCR_CUSTOM_API_KEY;
      delete process.env.OCR_SPACE_API_KEY;

      const summary = buildOcrRuntimeSummary();
      expect(summary.status).toBe('critical');
      expect(summary.summary).toContain('no remote OCR provider is configured');
    });

    it('builds operational diagnostics snapshot without throwing even when Mongo is down', async () => {
      delete process.env.MONGODB_URI;
      isMongoAvailableMock.mockResolvedValue(false);

      const snapshot = await getOperationalDiagnosticsSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot.dataSource).toBe('file');
      expect(snapshot.summary.servicesAtRisk).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(snapshot.lanes)).toBe(true);
    });
  });

  describe('Task 34: Operations RBAC & Authorization', () => {
    it('enforces that only super_admin can view operations pages', () => {
      expect(canViewPage('super_admin', 'operations_center')).toBe(true);
      expect(canViewPage('admin', 'operations_center')).toBe(false);
      expect(canViewPage('copy_editor', 'operations_center')).toBe(false);
      expect(canViewPage('reporter', 'operations_center')).toBe(false);

      expect(canViewPage('super_admin', 'operations_diagnostics')).toBe(true);
      expect(canViewPage('admin', 'operations_diagnostics')).toBe(false);
      expect(canViewPage('copy_editor', 'operations_diagnostics')).toBe(false);
      expect(canViewPage('reporter', 'operations_diagnostics')).toBe(false);
    });

    it('denies non-super_admin from calling briefing retry endpoint', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'admin-1',
        name: 'Desk Admin',
        email: 'admin@lokswami.in',
        role: 'admin',
      });

      const req = createPostRequest('http://localhost:3000/api/admin/analytics/briefing-schedules/retry-failed');
      const res = await postBriefingRetry(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Forbidden');
    });

    it('denies copy_editor and reporter from calling briefing retry endpoint', async () => {
      for (const role of ['copy_editor', 'reporter'] as const) {
        getAdminSessionMock.mockResolvedValue({
          id: `${role}-1`,
          name: `${role} user`,
          email: `${role}@lokswami.in`,
          role,
        });

        const req = createPostRequest('http://localhost:3000/api/admin/analytics/briefing-schedules/retry-failed');
        const res = await postBriefingRetry(req);
        expect(res.status).toBe(403);
      }
    });

    it('denies non-super_admin from running TTS asset cleanup', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'admin-1',
        name: 'Desk Admin',
        email: 'admin@lokswami.in',
        role: 'admin',
      });

      const req = createPostRequest('http://localhost:3000/api/admin/tts/cleanup', { limit: 10 });
      const res = await postTtsCleanup(req);

      expect(res.status).toBe(403);
    });
  });

  describe('Task 35 & 36: Idempotency, Safety & Audit Trail on Recovery Mutations', () => {
    it('audits successful briefing retry execution', async () => {
      runFailedLeadershipReportSchedulesMock.mockResolvedValue({
        failedCount: 2,
        retryCount: 2,
        results: [
          { ok: true, schedule: { id: 'daily-brief' }, summary: 'Daily run succeeded' },
          { ok: true, schedule: { id: 'weekly-brief' }, summary: 'Weekly run succeeded' },
        ],
      });

      const req = createPostRequest('http://localhost:3000/api/admin/analytics/briefing-schedules/retry-failed');
      const res = await postBriefingRetry(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.retryCount).toBe(2);

      expect(logAuditActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'retry',
          resourceType: 'settings',
          userRole: 'super_admin',
          responseStatus: 'success',
        })
      );
    });

    it('audits successful epaper page processing retry', async () => {
      epaperProcessingRetryMock.mockResolvedValue({
        message: 'Page processing retry queued.',
        data: { jobId: 'job-123', pageNumbers: [1, 2] },
      });

      const req = createPostRequest('http://localhost:3000/api/admin/epapers/epaper-1/processing/retry', {
        pageNumbers: [1, 2],
      });
      const context = { params: Promise.resolve({ id: 'epaper-1' }) };

      const res = await postEpaperRetry(req, context);
      expect(res.status).toBe(200);

      expect(logAuditActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'retry',
          resourceType: 'epaper',
          resourceId: 'epaper-1',
          userRole: 'super_admin',
          responseStatus: 'success',
        })
      );
    });

    it('rejects epaper retry when there are no failed pages to retry (revalidation & idempotency)', async () => {
      epaperProcessingRetryMock.mockRejectedValue(
        new EpaperValidationError('There are no missing or failed pages to retry.')
      );

      const req = createPostRequest('http://localhost:3000/api/admin/epapers/epaper-1/processing/retry');
      const context = { params: Promise.resolve({ id: 'epaper-1' }) };

      const res = await postEpaperRetry(req, context);
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('no missing or failed pages to retry');

      expect(logAuditActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'retry',
          resourceType: 'epaper',
          resourceId: 'epaper-1',
          responseStatus: 'error',
        })
      );
    });

    it('enforces that TTS retry permanently returns 405 Method Not Allowed', async () => {
      const res = await postTtsRetry();
      expect(res.status).toBe(405);
      const json = await res.json();
      expect(json.error).toContain('Auto-TTS retry is no longer supported');
    });

    it('audits TTS cleanup with safe metadata and no secrets', async () => {
      cleanupAssetsMock.mockResolvedValue({
        deletedAssets: 5,
        deletedFiles: 5,
        missingFiles: 0,
      });

      const req = createPostRequest('http://localhost:3000/api/admin/tts/cleanup', {
        dryRun: false,
        limit: 50,
      });

      const res = await postTtsCleanup(req);
      expect(res.status).toBe(200);

      expect(logAuditActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          resourceType: 'media',
          userRole: 'super_admin',
          responseStatus: 'success',
        })
      );
    });
  });
});
