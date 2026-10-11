import { NextRequest } from 'next/server';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
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

  it.each(['private search', 'निजी खोज', 'private?value&email=reader@example.test'])('redacts repeated and encoded search inputs: %s', (term) => {
    const input = new URLSearchParams({ q: term, query: term, category: 'politics', limit: '20', quality: 'high' });
    input.append('q', term);
    const sanitized = sanitizeRequestLogPath(`/api/v1/public/search?${input}&%71uery=${encodeURIComponent(term)}&Q=${encodeURIComponent(term)}`);
    const params = new URL(`https://example.test${sanitized}`).searchParams;
    expect(params.getAll('q')).toEqual(['[REDACTED]', '[REDACTED]']);
    expect(params.getAll('query')).toEqual(['[REDACTED]', '[REDACTED]']);
    expect(params.get('Q')).toBe('[REDACTED]');
    expect(params.get('category')).toBe('politics');
    expect(params.get('limit')).toBe('20');
    expect(params.get('quality')).toBe('high');
    expect(sanitized).not.toContain(encodeURIComponent(term));
  });

  it('persists redacted search values while preserving forensic fields and the disable switch', async () => {
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
      const entry = JSON.parse(content);
      expect(entry).toMatchObject({ method: 'GET', status: 429, userId: 'synthetic-user', userRole: 'admin', ip: '203.0.113.10', userAgent: 'Synthetic Agent' });
      const params = new URL(`https://example.test${entry.path}`).searchParams;
      expect(params.get('q')).toBe('[REDACTED]');
      expect(params.get('query')).toBe('[REDACTED]');
      expect(params.get('limit')).toBe('20');
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

  it('redacts sensitive query parameters', () => {
    expect(
      sanitizeRequestLogPath('/api/admin/articles?token=abc123&category=politics&api_key=secret')
    ).toBe('/api/admin/articles?token=%5BREDACTED%5D&category=politics&api_key=%5BREDACTED%5D');
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
      path: '/api/admin/articles?code=%5BREDACTED%5D&tab=all',
      status: 202,
      duration: 12,
      userId: 'admin-1',
      userEmail: 'admin@example.com',
      userRole: 'admin',
      ip: '203.0.113.10',
      userAgent: 'Vitest Agent',
    });

    expect(serializeRequestLogEntry(entry)).toBe(`${JSON.stringify(entry)}\n`);
  });
});
