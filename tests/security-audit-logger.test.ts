import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  buildAuditRequestContext,
  sanitizeAuditPayload,
} from '@/lib/security/auditLogger';

describe('Audit Logger', () => {
  it('redacts sensitive fields before storing audit payloads', () => {
    const payload = sanitizeAuditPayload({
      title: 'Public headline',
      password: 'secret-password',
      nested: {
        apiKey: 'private-key',
        safe: 'visible',
      },
      sessions: [
        {
          token: 'private-token',
          label: 'mobile',
        },
      ],
      cookie: 'session-cookie-value',
      clientCredential: 'private-client-credential',
      setupUrl: 'https://cms.example.test/setup-admin-account?token=private-setup-token',
    });

    expect(payload.title).toBe('Public headline');
    expect(payload.password).toBe('[REDACTED]');
    expect(payload.nested).toEqual({
      apiKey: '[REDACTED]',
      safe: 'visible',
    });
    expect(payload.sessions).toEqual([
      {
        token: '[REDACTED]',
        label: 'mobile',
      },
    ]);
    expect(payload.cookie).toBe('[REDACTED]');
    expect(payload.clientCredential).toBe('[REDACTED]');
    expect(payload.setupUrl).toBe('[REDACTED]');
  });

  it('truncates oversized strings and objects', () => {
    const payload = sanitizeAuditPayload({
      longText: 'a'.repeat(2500),
      ...Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`field${index}`, index])),
    });

    expect(String(payload.longText)).toContain('[truncated]');
    expect(payload.__truncatedKeys).toBe(11);
  });

  it('redacts secret-bearing query values from stored endpoints', () => {
    const request = new NextRequest(
      'https://cms.example.test/api/admin/jobs/run-due?secret=cron-value&token=token-value&limit=5'
    );

    const context = buildAuditRequestContext(request);
    const endpoint = new URL(context.endpoint, 'https://cms.example.test');

    expect(endpoint.searchParams.get('secret')).toBe('[REDACTED]');
    expect(endpoint.searchParams.get('token')).toBe('[REDACTED]');
    expect(endpoint.searchParams.get('limit')).toBe('5');
    expect(context.endpoint).not.toContain('cron-value');
    expect(context.endpoint).not.toContain('token-value');
  });
});
