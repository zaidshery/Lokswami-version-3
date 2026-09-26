import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dns from 'dns';
import fs from 'fs/promises';
import path from 'path';
import type { NextRequest } from 'next/server';
import {
  isSafeIpAddress,
  parseIPv4,
  parseIPv6,
  safeWebhookFetch,
  validateSafeWebhookUrl,
} from '@/lib/security/safeUrlFetch';
import {
  updateLeadershipReportSchedule,
  SettingsConflictError,
  listLeadershipReportSchedules,
} from '@/lib/storage/leadershipReportSchedulesFile';

const { getAdminSessionMock } = vi.hoisted(() => ({
  getAdminSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));

import { hasValidCronSecret } from '@/app/api/admin/analytics/briefing-schedules/run-due/route';

function createRequest(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

describe('Admin Webhook Security & Trust Boundary (Phase 3.10B)', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  const schedulesFilePath = path.resolve(
    process.cwd(),
    'data/leadership-report-schedules.json'
  );

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    // Default safe DNS lookup mock returning public address
    vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => [
      { address: '93.184.216.34', family: 4 },
    ] as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    try {
      await fs.unlink(schedulesFilePath);
    } catch {}
  });

  describe('IP Address Classification (IPv4 & IPv6)', () => {
    it('accurately parses IPv4 addresses into 32-bit integers', () => {
      expect(parseIPv4('127.0.0.1')).toBe(2130706433);
      expect(parseIPv4('10.0.0.1')).toBe(167772161);
      expect(parseIPv4('invalid')).toBeNull();
      expect(parseIPv4('256.0.0.1')).toBeNull();
      expect(parseIPv4('010.0.0.1')).toBeNull(); // Leading zero octal ambiguity
    });

    it('accurately parses IPv6 addresses into eight 16-bit words', () => {
      expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
      expect(parseIPv6('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
      expect(parseIPv6('fc00::1')).toEqual([0xfc00, 0, 0, 0, 0, 0, 0, 1]);
      expect(parseIPv6('::ffff:192.168.1.1')).toEqual([
        0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x0101,
      ]);
      expect(parseIPv6('not-an-ip')).toBeNull();
    });

    it('rejects IPv4 loopback (127.0.0.0/8)', () => {
      expect(isSafeIpAddress('127.0.0.1')).toBe(false);
      expect(isSafeIpAddress('127.255.255.254')).toBe(false);
    });

    it('rejects RFC1918 private IPv4 addresses', () => {
      expect(isSafeIpAddress('10.0.0.1')).toBe(false);
      expect(isSafeIpAddress('10.254.1.10')).toBe(false);
      expect(isSafeIpAddress('172.16.0.1')).toBe(false);
      expect(isSafeIpAddress('172.31.255.255')).toBe(false);
      expect(isSafeIpAddress('192.168.1.1')).toBe(false);
      expect(isSafeIpAddress('192.168.254.254')).toBe(false);
    });

    it('rejects IPv4 link-local and cloud metadata (169.254.0.0/16)', () => {
      expect(isSafeIpAddress('169.254.169.254')).toBe(false);
      expect(isSafeIpAddress('169.254.1.1')).toBe(false);
    });

    it('rejects IPv4 multicast, broadcast, and CGNAT', () => {
      expect(isSafeIpAddress('0.0.0.0')).toBe(false);
      expect(isSafeIpAddress('224.0.0.1')).toBe(false);
      expect(isSafeIpAddress('240.0.0.1')).toBe(false);
      expect(isSafeIpAddress('255.255.255.255')).toBe(false);
      expect(isSafeIpAddress('100.64.0.1')).toBe(false);
    });

    it('rejects IPv6 loopback, unique-local, link-local, and multicast', () => {
      expect(isSafeIpAddress('::1')).toBe(false);
      expect(isSafeIpAddress('::')).toBe(false);
      expect(isSafeIpAddress('fc00::1')).toBe(false);
      expect(isSafeIpAddress('fd12:3456:789a::1')).toBe(false);
      expect(isSafeIpAddress('fe80::1')).toBe(false);
      expect(isSafeIpAddress('ff02::1')).toBe(false);
      expect(isSafeIpAddress('2001:db8::1')).toBe(false);
    });

    it('rejects IPv4-mapped IPv6 representations of private/loopback addresses', () => {
      expect(isSafeIpAddress('::ffff:127.0.0.1')).toBe(false);
      expect(isSafeIpAddress('::ffff:10.0.0.1')).toBe(false);
      expect(isSafeIpAddress('::ffff:192.168.1.1')).toBe(false);
      expect(isSafeIpAddress('::ffff:169.254.169.254')).toBe(false);
      expect(isSafeIpAddress('::ffff:7f00:1')).toBe(false);
    });

    it('accepts legitimate public IPv4 and IPv6 addresses', () => {
      expect(isSafeIpAddress('93.184.216.34')).toBe(true);
      expect(isSafeIpAddress('8.8.8.8')).toBe(true);
      expect(isSafeIpAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
    });
  });

  describe('URL Protocol & Format Validation', () => {
    it('accepts valid HTTPS public URLs', async () => {
      const result = await validateSafeWebhookUrl('https://hooks.slack.com/services/test');
      expect(result.safe).toBe(true);
      expect(result.url?.hostname).toBe('hooks.slack.com');
    });

    it('rejects non-HTTPS URLs in production', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const result = await validateSafeWebhookUrl('http://hooks.slack.com/services/test');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('must use HTTPS');
    });

    it('rejects dangerous protocols (ftp, file, javascript, data, ws)', async () => {
      const protocols = [
        'ftp://example.com/webhook',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/plain;base64,SGVsbG8=',
        'ws://example.com/socket',
        'wss://example.com/socket',
      ];

      for (const protoUrl of protocols) {
        const result = await validateSafeWebhookUrl(protoUrl, {
          allowHttpInDevelopment: true,
        });
        expect(result.safe).toBe(false);
      }
    });

    it('rejects URLs containing embedded userinfo / credentials', async () => {
      const credentialsUrls = [
        'https://user:password@hooks.slack.com/services/test',
        'https://token@discord.com/api/webhooks/test',
        'https://admin:@example.com/hook',
      ];

      for (const credUrl of credentialsUrls) {
        const result = await validateSafeWebhookUrl(credUrl);
        expect(result.safe).toBe(false);
        expect(result.error).toContain('embedded user credentials');
      }
    });

    it('rejects malformed URLs', async () => {
      const result = await validateSafeWebhookUrl('not-a-valid-url');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('Malformed or invalid');
    });

    it('rejects internal and local domain names', async () => {
      const localHosts = [
        'https://localhost/hook',
        'https://server.local/hook',
        'https://metadata.internal/hook',
        'https://app.lan/hook',
        'https://infra.corp/hook',
      ];

      for (const hostUrl of localHosts) {
        const result = await validateSafeWebhookUrl(hostUrl);
        expect(result.safe).toBe(false);
        expect(result.error).toContain('forbidden');
      }
    });
  });

  describe('DNS Resolution & SSRF Blocking', () => {
    it('rejects hostnames resolving to private IPv4 addresses', async () => {
      vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => [
        { address: '10.0.0.5', family: 4 },
      ] as any);

      const result = await validateSafeWebhookUrl('https://evil-internal.example.com/hook');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('resolved to forbidden address "10.0.0.5"');
    });

    it('rejects hostnames resolving to cloud metadata IP', async () => {
      vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => [
        { address: '169.254.169.254', family: 4 },
      ] as any);

      const result = await validateSafeWebhookUrl('https://cloud-meta.example.com/hook');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('resolved to forbidden address "169.254.169.254"');
    });

    it('rejects hostnames resolving to IPv6 loopback (::1)', async () => {
      vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => [
        { address: '::1', family: 6 },
      ] as any);

      const result = await validateSafeWebhookUrl('https://ipv6-loopback.example.com/hook');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('resolved to forbidden address "::1"');
    });

    it('fails closed if multiple DNS records contain even ONE unsafe address', async () => {
      vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => [
        { address: '93.184.216.34', family: 4 }, // Safe public
        { address: '127.0.0.1', family: 4 }, // Unsafe loopback
      ] as any);

      const result = await validateSafeWebhookUrl('https://dual-homed.example.com/hook');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('resolved to forbidden address "127.0.0.1"');
    });

    it('fails closed when DNS resolution encounters an error', async () => {
      vi.spyOn(dns.promises, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));

      const result = await validateSafeWebhookUrl('https://non-existent-domain-12345.com/hook');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('DNS resolution failed');
    });
  });

  describe('Outbound Request Safety (safeWebhookFetch)', () => {
    it('dispatches to validated destination without redirects', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('ok'),
      } as unknown as Response);

      const response = await safeWebhookFetch('https://hooks.slack.com/services/safe', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hello' }),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [, options] = vi.mocked(global.fetch).mock.calls[0];
      expect(options?.redirect).toBe('manual');
    });

    it('rejects following redirects to prevent SSRF bypass', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        statusText: 'Found',
        headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data/' }),
      } as unknown as Response);

      const response = await safeWebhookFetch('https://example.com/redirect-to-meta');
      expect(response.ok).toBe(false);
      expect(response.status).toBe(302);
      expect(response.error).toContain('Webhook redirects are forbidden');
    });

    it('enforces request timeout bounds', async () => {
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'AbortError';
            setTimeout(() => reject(err), 50);
          })
      );

      const response = await safeWebhookFetch('https://example.com/slow-hook', {
        timeoutMs: 10,
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(504);
      expect(response.error).toContain('timed out');
    });

    it('bounds response body reading to maximum 2048 bytes', async () => {
      const hugeBody = 'A'.repeat(10000);
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Error',
        headers: new Headers(),
        text: vi.fn().mockResolvedValue(hugeBody),
      } as unknown as Response);

      const response = await safeWebhookFetch('https://example.com/oversized-response');
      const text = await response.text();
      expect(text.length).toBeLessThanOrEqual(2048);
    });

    it('sanitizes and redacts credentials from error messages', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: vi
          .fn()
          .mockResolvedValue('Authorization failed for https://user:secret123@example.com/'),
      } as unknown as Response);

      const response = await safeWebhookFetch('https://example.com/auth-fail');
      const text = await response.text();
      expect(text).not.toContain('secret123');
      expect(text).toContain('***@');
    });
  });

  describe('Cron Authentication & Secret Transport Hardening', () => {
    const TEST_SECRET = 'TEST_CRON_SECRET_987654321';

    beforeEach(() => {
      process.env.LEADERSHIP_REPORT_CRON_SECRET = TEST_SECRET;
    });

    it('accepts valid Authorization: Bearer <secret> header', () => {
      const req = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules/run-due',
        {
          headers: {
            authorization: `Bearer ${TEST_SECRET}`,
          },
        }
      );
      expect(hasValidCronSecret(req)).toBe(true);
    });

    it('accepts valid X-Lokswami-Cron-Secret header', () => {
      const req = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules/run-due',
        {
          headers: {
            'x-lokswami-cron-secret': TEST_SECRET,
          },
        }
      );
      expect(hasValidCronSecret(req)).toBe(true);
    });

    it('rejects missing or empty cron credentials', () => {
      const req = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules/run-due'
      );
      expect(hasValidCronSecret(req)).toBe(false);
    });

    it('rejects incorrect secret in constant time', () => {
      const req = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules/run-due',
        {
          headers: {
            authorization: 'Bearer WRONG_SECRET_VALUE',
          },
        }
      );
      expect(hasValidCronSecret(req)).toBe(false);
    });

    it('rejects secrets of mismatched length safely without throwing', () => {
      const reqShort = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules/run-due',
        {
          headers: {
            authorization: 'Bearer short',
          },
        }
      );
      const reqLong = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules/run-due',
        {
          headers: {
            authorization: `Bearer ${TEST_SECRET}_extra_long_payload`,
          },
        }
      );
      expect(hasValidCronSecret(reqShort)).toBe(false);
      expect(hasValidCronSecret(reqLong)).toBe(false);
    });

    it('strictly rejects query-string ?secret= in production', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const req = createRequest(
        `http://localhost/api/admin/analytics/briefing-schedules/run-due?secret=${TEST_SECRET}`
      );
      expect(hasValidCronSecret(req)).toBe(false);
    });

    it('permits query-string ?secret= with deprecation warning in development', () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const req = createRequest(
        `http://localhost/api/admin/analytics/briefing-schedules/run-due?secret=${TEST_SECRET}`
      );
      expect(hasValidCronSecret(req)).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEPRECATION] Passing cron secret via ?secret=')
      );
      // Ensure the secret itself is NEVER printed to console
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining(TEST_SECRET));
    });
  });

  describe('Leadership Settings Optimistic Concurrency Control (CAS)', () => {
    it('successfully updates when expectedVersion matches and advances version', async () => {
      const initialSchedules = await listLeadershipReportSchedules();
      const target = initialSchedules[0];
      const initialVersion = target.version || 1;

      const updated = await updateLeadershipReportSchedule(
        target.id,
        { notes: 'Updated note by admin A' },
        { expectedVersion: initialVersion }
      );

      expect(updated.version).toBe(initialVersion + 1);
      expect(updated.notes).toBe('Updated note by admin A');
    });

    it('rejects stale writer with SettingsConflictError (HTTP 409)', async () => {
      const initialSchedules = await listLeadershipReportSchedules();
      const target = initialSchedules[0];
      const staleVersion = (target.version || 1) - 1;

      await expect(
        updateLeadershipReportSchedule(
          target.id,
          { notes: 'Stale update write' },
          { expectedVersion: staleVersion }
        )
      ).rejects.toThrow(SettingsConflictError);
    });

    it('rejects stale writer when expectedUpdatedAt does not match current', async () => {
      const initialSchedules = await listLeadershipReportSchedules();
      const target = initialSchedules[0];

      await expect(
        updateLeadershipReportSchedule(
          target.id,
          { notes: 'Stale update by timestamp' },
          { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' }
        )
      ).rejects.toThrow(SettingsConflictError);
    });

    it('serializes concurrent updates resulting in one winner and one 409 conflict', async () => {
      const initialSchedules = await listLeadershipReportSchedules();
      const target = initialSchedules[0];
      const initialVersion = target.version || 1;

      const [resA, resB] = await Promise.allSettled([
        updateLeadershipReportSchedule(
          target.id,
          { notes: 'Write by Admin A' },
          { expectedVersion: initialVersion }
        ),
        updateLeadershipReportSchedule(
          target.id,
          { notes: 'Write by Admin B' },
          { expectedVersion: initialVersion }
        ),
      ]);

      const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
      const rejected = [resA, resB].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        SettingsConflictError
      );

      // Verify canonical state was updated by winner
      const finalSchedules = await listLeadershipReportSchedules();
      const finalTarget = finalSchedules.find((s) => s.id === target.id)!;
      expect(finalTarget.version).toBe(initialVersion + 1);
    });

    it('validates webhook URLs at save time and rejects unsafe URLs', async () => {
      const initialSchedules = await listLeadershipReportSchedules();
      const target = initialSchedules[0];

      await expect(
        updateLeadershipReportSchedule(
          target.id,
          { webhookUrls: ['https://127.0.0.1/webhook'] },
          { expectedVersion: target.version }
        )
      ).rejects.toThrow(/Invalid webhook URL/);
    });
  });

  describe('Briefing Schedules & Settings Routes Concurrency Contract', () => {
    it('PATCH /api/admin/analytics/briefing-schedules rejects missing concurrency token with 400', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-admin-1',
        role: 'super_admin',
        email: 'owner@lokswami.com',
      });
      const { PATCH } = await import(
        '@/app/api/admin/analytics/briefing-schedules/route'
      );
      const req = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'daily_briefing',
            notes: 'Missing token',
          }),
        }
      );
      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Missing required concurrency token');
    });

    it('PATCH /api/admin/analytics/briefing-schedules returns 409 on stale version conflict', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-admin-1',
        role: 'super_admin',
        email: 'owner@lokswami.com',
      });
      const { PATCH } = await import(
        '@/app/api/admin/analytics/briefing-schedules/route'
      );
      const req = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'daily_briefing',
            notes: 'Stale writer',
            expectedVersion: 0,
          }),
        }
      );
      const res = await PATCH(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe('SETTINGS_VERSION_CONFLICT');
    });

    it('PATCH /api/admin/analytics/briefing-schedules returns 403 to non-super_admin', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'admin-1',
        role: 'admin',
        email: 'admin@lokswami.com',
      });
      const { PATCH } = await import(
        '@/app/api/admin/analytics/briefing-schedules/route'
      );
      const req = createRequest(
        'http://localhost/api/admin/analytics/briefing-schedules',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'daily_briefing',
            notes: 'Unauthorized writer',
            expectedVersion: 1,
          }),
        }
      );
      const res = await PATCH(req);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/admin/settings/leadership-reports supports optimistic concurrency and rejects stale writer', async () => {
      getAdminSessionMock.mockResolvedValue({
        id: 'super-admin-1',
        role: 'super_admin',
        email: 'owner@lokswami.com',
      });
      const { PATCH } = await import(
        '@/app/api/admin/settings/leadership-reports/route'
      );
      const req = createRequest(
        'http://localhost/api/admin/settings/leadership-reports',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'daily_briefing',
            notes: 'Stale writer to settings',
            expectedVersion: 0,
          }),
        }
      );
      const res = await PATCH(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe('SETTINGS_VERSION_CONFLICT');
    });
  });

  describe('Secret Boundary & Non-Exposure Regression', () => {
    it('ensures no administrative endpoint leaks configured secrets', async () => {
      const SYNTHETIC_CRON = 'SYNTHETIC_CRON_SECRET_XYZ_999';
      process.env.LEADERSHIP_REPORT_CRON_SECRET = SYNTHETIC_CRON;

      const schedules = await listLeadershipReportSchedules();
      const serialized = JSON.stringify(schedules);

      expect(serialized).not.toContain(SYNTHETIC_CRON);
      expect(serialized).not.toContain('MONGODB_URI');
      expect(serialized).not.toContain('RESEND_API_KEY');
    });

    it('ensures GET /api/admin/settings/leadership-reports does not serialize plaintext secrets', async () => {
      const SYNTHETIC_CRON = 'TEST_CRON_SECRET_12345';
      const SYNTHETIC_RESEND = 're_test_synthetic_key_98765';
      process.env.LEADERSHIP_REPORT_CRON_SECRET = SYNTHETIC_CRON;
      process.env.RESEND_API_KEY = SYNTHETIC_RESEND;

      getAdminSessionMock.mockResolvedValue({
        id: 'super-admin-1',
        role: 'super_admin',
        email: 'owner@lokswami.com',
      });

      const { GET } = await import(
        '@/app/api/admin/settings/leadership-reports/route'
      );
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      const serialized = JSON.stringify(body);

      expect(serialized).not.toContain(SYNTHETIC_CRON);
      expect(serialized).not.toContain(SYNTHETIC_RESEND);
      expect(body.data.runtime.cronSecretConfigured).toBe(true);
      expect(body.data.runtime.resendConfigured).toBe(true);
    });
  });
});
