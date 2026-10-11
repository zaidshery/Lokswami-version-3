import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ token: vi.fn(), limiter: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.token }));
vi.mock('@/lib/auth/jwtSecret', () => ({ getJwtSecretOrNull: () => 'synthetic-secret' }));
vi.mock('@/lib/security/getRateLimiter', () => ({ checkRateLimit: mocks.limiter }));
vi.mock('@/lib/security/requestLogger', () => ({ logApiRequestFromMiddleware: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/server/publicArticles', () => ({ resolvePublicArticleToken: vi.fn() }));

import { middleware } from '@/middleware';

const run = (pathname: string) => middleware(new NextRequest(`https://example.test${pathname}`), { waitUntil: vi.fn() } as never);

describe('R04 protected middleware fails closed on unexpected auth errors', () => {
  beforeEach(() => {
    mocks.token.mockReset().mockResolvedValue({ userId: 'synthetic-admin', role: 'admin', isActive: true });
    mocks.limiter.mockReset().mockResolvedValue({ allowed: true, limit: 100, remaining: 99, reset: 1 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['/admin', '/admin/team', '/api/admin/team', '/main/account', '/main/saved/item', '/main/preferences'])('blocks %s when token decoding throws', async (pathname) => {
    mocks.token.mockRejectedValue(new Error('synthetic internal error containing sensitive details'));
    const response = await run(pathname);
    expect(response.status).toBe(503);
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: 'Authentication temporarily unavailable' });
  });

  it('blocks admin access when the limiter throws', async () => {
    mocks.limiter.mockRejectedValue(new Error('synthetic limiter failure'));
    expect((await run('/admin/team')).status).toBe(503);
  });

  it('retains authenticated success and unauthenticated redirect behaviour', async () => {
    expect((await run('/admin')).headers.get('x-middleware-next')).toBe('1');
    mocks.token.mockResolvedValue(null);
    const response = await run('/admin');
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/signin');
  });

  it('preserves public read availability when optional session decoding fails', async () => {
    mocks.token.mockRejectedValue(new Error('synthetic decode failure'));
    expect((await run('/api/articles/latest')).headers.get('x-middleware-next')).toBe('1');
  });
});
