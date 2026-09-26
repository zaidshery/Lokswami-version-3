import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import * as auditLoggerModule from '@/lib/security/auditLogger';
import {
  logAuditAction,
  logStaffSetupCompleted,
  getAuditLogs,
} from '@/lib/security/auditLogger';

// Mock mongoose connection & AuditLog
vi.mock('@/lib/db/mongoose', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/models/AuditLog', () => {
  function MockAuditLog(this: any, data: any) {
    Object.assign(this, data);
    this.save = vi.fn().mockResolvedValue(this);
  }
  MockAuditLog.find = vi.fn().mockReturnValue({
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  });
  MockAuditLog.aggregate = vi.fn().mockResolvedValue([]);
  return {
    default: MockAuditLog,
  };
});

// Mock external activity and storage helpers for audit center testing
vi.mock('@/lib/server/contentActivity', () => ({
  listGlobalContentActivity: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/storage/leadershipReportRunHistoryFile', () => ({
  listLeadershipReportRunHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/storage/leadershipReportAlertNotificationHistoryFile', () => ({
  listLeadershipReportAlertNotificationHistory: vi.fn().mockResolvedValue([]),
}));

// Mock staffCredentials
const setStaffPasswordWithTokenMock = vi.fn();
vi.mock('@/lib/auth/staffCredentials', () => ({
  findStaffUserBySetupToken: vi.fn(),
  setStaffPasswordWithToken: setStaffPasswordWithTokenMock,
}));

// Mock rate limiter
vi.mock('@/lib/security/getRateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue(new Headers()),
}));

import AuditLog from '@/lib/models/AuditLog';
import { getAdminAuditCenterData } from '@/lib/admin/adminAuditCenter';

describe('Phase 3.10C — Audit Log Integrity & Security Guarantees', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test-audit';
    process.env.ENABLE_AUDIT_LOG_IN_TESTS = 'true';
  });

  describe('Staff Setup Completion Audit Evidence', () => {
    it('POST /api/auth/staff-setup emits structured audit event upon successful password creation', async () => {
      const logSpy = vi.spyOn(auditLoggerModule, 'logStaffSetupCompleted');

      setStaffPasswordWithTokenMock.mockResolvedValue({
        success: true,
        userId: '507f1f77bcf86cd799439099',
        loginId: 'editor.test',
        email: 'editor@lokswami.local',
        role: 'copy_editor',
      });

      const { POST } = await import('@/app/api/auth/staff-setup/route');
      const req = new Request('http://localhost/api/auth/staff-setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Vitest-Test-Agent/1.0',
          'X-Forwarded-For': '198.51.100.25',
        },
        body: JSON.stringify({
          token: 'synthetic-setup-token-hex1234567890',
          password: 'super-secure-staff-password-123',
          confirmPassword: 'super-secure-staff-password-123',
        }),
      }) as unknown as NextRequest;

      const response = await POST(req);
      expect(response.status).toBe(200);

      expect(logSpy).toHaveBeenCalledTimes(1);
      const auditPayload = logSpy.mock.calls[0][0];

      expect(auditPayload.userId).toBe('507f1f77bcf86cd799439099');
      expect(auditPayload.userEmail).toBe('editor@lokswami.local');
      expect(auditPayload.userRole).toBe('copy_editor');
      expect(auditPayload.loginId).toBe('editor.test');

      // Verify ZERO credentials or token secrets leaked into audit parameters
      const stringifiedPayload = JSON.stringify(auditPayload);
      expect(stringifiedPayload).not.toContain('super-secure-staff-password-123');
      expect(stringifiedPayload).not.toContain('synthetic-setup-token-hex1234567890');
      expect(stringifiedPayload).not.toContain('password');
      expect(stringifiedPayload).not.toContain('confirmPassword');
      expect(stringifiedPayload).not.toContain('token');
      expect(stringifiedPayload).not.toContain('hash');
    });

    it('logStaffSetupCompleted writes action staff_setup_completed and resourceType user', async () => {
      const entry = await logStaffSetupCompleted({
        userId: '507f1f77bcf86cd799439011',
        userEmail: 'staff@lokswami.local',
        userRole: 'admin',
        loginId: 'staff.admin',
        ipAddress: '192.0.2.1',
        userAgent: 'TestBrowser',
      });

      expect(entry).not.toBeNull();
      expect(entry?.action).toBe('staff_setup_completed');
      expect(entry?.resourceType).toBe('user');
      expect(entry?.resourceId).toBe('507f1f77bcf86cd799439011');
      expect(entry?.userEmail).toBe('staff@lokswami.local');
      expect(entry?.userRole).toBe('admin');
      expect(entry?.endpoint).toBe('/api/auth/staff-setup');
      expect(entry?.method).toBe('POST');
    });
  });

  describe('Centralized Redaction of Secret-Shaped Fields', () => {
    it('redacts passwords, setup tokens, session IDs, API keys, and Mongo URIs from audit data', async () => {
      const entry = await logAuditAction({
        action: 'create',
        resourceType: 'other',
        userId: 'admin-1',
        userEmail: 'admin@lokswami.local',
        userRole: 'super_admin',
        method: 'POST',
        endpoint: '/api/admin/test?apiKey=top-secret-api-key&sig=signed-param',
        statusCode: 200,
        duration: 5,
        requestData: {
          password: 'synthetic-raw-password',
          passwordHash: '$2b$12$syntheticPasswordHashValue',
          setupToken: 'synthetic-token-48-chars-long',
          setupTokenHash: 'hash-of-setup-token',
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy',
          cookie: 'lokswami_session=jwt.session.cookie',
          mongoUri: 'mongodb+srv://user:secretpass@cluster.mongodb.net/prod',
          nested: {
            apiKey: 'sk_live_1234567890abcdef',
            privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...',
          },
          normalField: 'safe-value',
        },
        errorMessage: 'Connection error to mongodb://admin:dbpass@localhost:27017/lokswami with token: 12345abc',
        ipAddress: '127.0.0.1',
        userAgent: 'Vitest',
      });

      expect(entry).not.toBeNull();
      const sanitized = entry?.requestData as Record<string, unknown>;

      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.passwordHash).toBe('[REDACTED]');
      expect(sanitized.setupToken).toBe('[REDACTED]');
      expect(sanitized.setupTokenHash).toBe('[REDACTED]');
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized.mongoUri).toBe('[REDACTED]');
      expect((sanitized.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
      expect((sanitized.nested as Record<string, unknown>).privateKey).toBe('[REDACTED]');
      expect(sanitized.normalField).toBe('safe-value');

      // Error message URI & token sanitization
      expect(entry?.errorMessage).toContain('mongodb[REDACTED]');
      expect(entry?.errorMessage).toContain('token: [REDACTED]');
      expect(entry?.errorMessage).not.toContain('dbpass');
      expect(entry?.errorMessage).not.toContain('12345abc');
    });
  });

  describe('Append-Only Immutability Invariant', () => {
    it('verifies that no application API or route implements update or delete on AuditLog', () => {
      const apiDir = path.join(process.cwd(), 'app', 'api');
      const allFiles: string[] = [];

      function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            allFiles.push(fullPath);
          }
        }
      }

      walk(apiDir);

      for (const file of allFiles) {
        const content = fs.readFileSync(file, 'utf8');
        // If file references AuditLog, it must NOT call any mutating methods on it
        if (/AuditLog\b/.test(content)) {
          expect(content).not.toMatch(/AuditLog\.(updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate|deleteOne|deleteMany|findByIdAndDelete|findOneAndDelete)/);
        }
      }
    });

    it('verifies AuditLog schema has timestamps and indexed action/resourceType including staff_setup_completed', async () => {
      const actual = await vi.importActual<typeof import('@/lib/models/AuditLog')>('@/lib/models/AuditLog');
      const schemaPaths = actual.default.schema.paths;
      expect(schemaPaths.action).toBeDefined();
      // @ts-expect-error checking enum values
      expect(schemaPaths.action.enumValues).toContain('staff_setup_completed');
      expect(schemaPaths.resourceType).toBeDefined();
      expect(schemaPaths.userId).toBeDefined();
      expect(schemaPaths.timestamp).toBeDefined();
      expect(schemaPaths.createdAt).toBeDefined();
    });
  });

  describe('Query Limits & Pagination Bounds', () => {
    it('getAuditLogs clamps unbounded limit requests to 1,000 maximum', async () => {
      await getAuditLogs({ limit: 5000 });

      expect(AuditLog.find().limit).toHaveBeenCalledWith(1000);
    });

    it('getAuditLogs defaults to limit 50 when not specified', async () => {
      await getAuditLogs({});

      expect(AuditLog.find().limit).toHaveBeenCalledWith(50);
    });

    it('getAuditLogs passes offset to skip for safe pagination', async () => {
      await getAuditLogs({ limit: 25, offset: 75 });

      expect(AuditLog.find().limit).toHaveBeenCalledWith(25);
      expect(AuditLog.find().skip).toHaveBeenCalledWith(75);
    });

    it('getAdminAuditCenterData bounds limit to maximum 120 records', async () => {
      const data = await getAdminAuditCenterData({
        scope: 'all',
        contentFilter: 'all',
        limit: 9999,
      });

      expect(data).toBeDefined();
      expect(AuditLog.find().limit).toHaveBeenCalledWith(120);
    });
  });
});
