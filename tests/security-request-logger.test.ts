import { NextRequest } from 'next/server';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRequestLogEntry,
  sanitizeRequestLogPath,
  serializeRequestLogEntry,
  logApiRequestFromMiddleware,
} from '@/lib/security/requestLogger';

describe('Request Logger', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['private search', 'निजी खोज', 'private?value&email=reader@example.test'])('removes all repeated and encoded query inputs: %s', (term) => {
    const input = new URLSearchParams({ q: term, query: term, category: 'politics', limit: '20', quality: 'high' });
    input.append('q', term);
    const sanitized = sanitizeRequestLogPath(`/api/v1/public/search?${input}&%71uery=${encodeURIComponent(term)}&Q=${encodeURIComponent(term)}`);
    expect(sanitized).toBe('/api/v1/public/search');
  });

  it('persists minimized request metadata and honors the disable switch', async () => {
    const logDir = await mkdtemp(path.join(os.tmpdir(), 'lokswami-search-log-test-'));
    vi.stubEnv('REQUEST_LOG_DIR', logDir);
    vi.stubEnv('DISABLE_REQUEST_LOG', '');
    const request = new NextRequest('https://example.test/api/v1/public/search?q=private-search&query=private-alternate&limit=20', {
      headers: { 'x-forwarded-for': '203.0.113.10', 'user-agent': 'Synthetic Agent' },
    });
    try {
      await logApiRequestFromMiddleware({ request, responseStatus: 429, startedAt: Date.now(), session: { userId: 'synthetic-user', role: 'admin' } });
      const files = await readdir(logDir);
      expect(files).toHaveLength(1);
      const file = path.join(logDir, files[0]);
      const content = await readFile(file, 'utf8');
      if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
      const entry = JSON.parse(content);
      expect(entry).toMatchObject({ method: 'GET', status: 429, userId: 'synthetic-user', userRole: 'admin', userEmail: null, ip: '', userAgent: '', path: '/api/v1/public/search' });
      expect(content).not.toContain('203.0.113.10');
      expect(content).not.toContain('Synthetic Agent');
      expect(content).not.toContain('private-search');
      expect(content).not.toContain('private-alternate');
      for (const disabled of ['true', '1']) {
        vi.stubEnv('DISABLE_REQUEST_LOG', disabled);
        await logApiRequestFromMiddleware({ request, responseStatus: 200, startedAt: Date.now() });
        expect(await readFile(file, 'utf8')).toBe(content);
      }
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });

  it('removes query and fragment data regardless of key classification', () => {
    expect(
      sanitizeRequestLogPath('/api/admin/articles?token=abc123&category=politics&api_key=secret#private-fragment')
    ).toBe('/api/admin/articles');
    expect(sanitizeRequestLogPath('/api/articles#private-fragment')).toBe('/api/articles');
    expect(sanitizeRequestLogPath('?email=reader@example.test')).toBe('/');
  });

  it('builds a compact JSONL request entry', () => {
    const request = new NextRequest('https://lokswami.test/api/admin/articles?code=oauth&tab=all', {
      method: 'POST',
      headers: {
        'user-agent': 'Vitest Agent',
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      },
    });

    const entry = buildRequestLogEntry({
      request,
      status: 202,
      duration: 12.4,
      timestamp: new Date('2026-04-29T10:30:00.000Z'),
      session: {
        userId: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      },
    });

    expect(entry).toMatchObject({
      timestamp: '2026-04-29T10:30:00.000Z',
      method: 'POST',
      path: '/api/admin/articles',
      status: 202,
      duration: 12,
      userId: 'admin-1',
      userEmail: null,
      userRole: 'admin',
      ip: '',
      userAgent: '',
    });

    expect(serializeRequestLogEntry(entry)).toBe(`${JSON.stringify(entry)}\n`);
  });

  it('minimizes manually constructed entries at serialization without mutating the caller', () => {
    const entry = buildRequestLogEntry({ request: new NextRequest('https://example.test/api/analytics/track'), status: 200, duration: 10 });
    Object.assign(entry, { path: '/api/analytics/track?email=private@example.test#fragment', ip: '203.0.113.10', userAgent: 'Private Agent', userEmail: 'private@example.test' });
    expect(JSON.parse(serializeRequestLogEntry(entry))).toMatchObject({ path: '/api/analytics/track', ip: '', userAgent: '', userEmail: null });
    expect(entry.ip).toBe('203.0.113.10');
  });
});
