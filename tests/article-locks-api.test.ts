import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionFromReqMock = vi.fn();
const connectDBMock = vi.fn().mockRejectedValue(new Error('Use file store in tests'));

vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

// We test against the file store fallback to verify end-to-end routing & atomic storage
describe('/api/admin/articles/[id]/lock API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeParams = (id = 'article-lock-test-1') => ({
    params: Promise.resolve({ id }),
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(null);

    const { GET, POST, DELETE } = await import(
      '@/app/api/admin/articles/[id]/lock/route'
    );

    const reqGet = new NextRequest('http://localhost/api/admin/articles/art-1/lock', {
      method: 'GET',
    });
    const resGet = await GET(reqGet, makeParams('art-1'));
    expect(resGet.status).toBe(401);

    const reqPost = new NextRequest('http://localhost/api/admin/articles/art-1/lock', {
      method: 'POST',
      body: JSON.stringify({ action: 'acquire' }),
    });
    const resPost = await POST(reqPost, makeParams('art-1'));
    expect(resPost.status).toBe(401);

    const reqDelete = new NextRequest('http://localhost/api/admin/articles/art-1/lock', {
      method: 'DELETE',
    });
    const resDelete = await DELETE(reqDelete, makeParams('art-1'));
    expect(resDelete.status).toBe(401);
  });

  it('acquires lock on unlocked article, and extends on heartbeat', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'reporter-1',
      name: 'Priya Sharma',
      role: 'reporter',
      email: 'priya@lokswami.in',
    });

    const { GET, POST, DELETE } = await import(
      '@/app/api/admin/articles/[id]/lock/route'
    );

    const articleId = 'article-flow-101';

    // 1. Initial GET before acquire
    const get1 = await GET(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`),
      makeParams(articleId)
    );
    expect(get1.status).toBe(200);
    const body1 = await get1.json();
    expect(body1.isLocked).toBe(false);
    expect(body1.lock).toBeNull();

    // 2. Acquire lock
    const postAcquire = await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'acquire' }),
      }),
      makeParams(articleId)
    );
    expect(postAcquire.status).toBe(200);
    const acquireBody = await postAcquire.json();
    expect(acquireBody.success).toBe(true);
    expect(acquireBody.hasLock).toBe(true);
    expect(acquireBody.lock.userName).toBe('Priya Sharma');
    expect(acquireBody.lock.isCurrentUser).toBe(true);

    // 3. Heartbeat by current owner extends lease
    const postHeartbeat = await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'heartbeat' }),
      }),
      makeParams(articleId)
    );
    expect(postHeartbeat.status).toBe(200);
    const heartbeatBody = await postHeartbeat.json();
    expect(heartbeatBody.hasLock).toBe(true);

    // 4. Release cleanly
    const delRes = await DELETE(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'DELETE',
      }),
      makeParams(articleId)
    );
    expect(delRes.status).toBe(200);

    // Verify unlocked
    const getAfter = await GET(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`),
      makeParams(articleId)
    );
    expect((await getAfter.json()).isLocked).toBe(false);
  });

  it('returns 423 Locked when a second editor attempts to acquire an active lock', async () => {
    const { POST, DELETE } = await import(
      '@/app/api/admin/articles/[id]/lock/route'
    );
    const articleId = 'article-collision-202';

    // User A acquires lock
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'user-a',
      name: 'User A',
      role: 'reporter',
      email: 'a@lokswami.in',
    });

    await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ action: 'acquire' }),
      }),
      makeParams(articleId)
    );

    // User B attempts to acquire same article
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'user-b',
      name: 'User B',
      role: 'copy_editor',
      email: 'b@lokswami.in',
    });

    const postCollision = await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ action: 'acquire' }),
      }),
      makeParams(articleId)
    );

    expect(postCollision.status).toBe(423);
    const collisionBody = await postCollision.json();
    expect(collisionBody.error).toBe('LOCKED_BY_OTHER');
    expect(collisionBody.holder.userId).toBe('user-a');
    expect(collisionBody.holder.userName).toBe('User A');

    // Clean up
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'admin-super',
      name: 'Super Admin',
      role: 'super_admin',
    });
    await DELETE(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'DELETE',
      }),
      makeParams(articleId)
    );
  });

  it('enforces take_over permissions: rejected for reporters, allowed for admins', async () => {
    const { POST, DELETE } = await import(
      '@/app/api/admin/articles/[id]/lock/route'
    );
    const articleId = 'article-takeover-303';

    // User A (Reporter) acquires lock
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'reporter-orig',
      name: 'Original Reporter',
      role: 'reporter',
      email: 'orig@lokswami.in',
    });

    await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ action: 'acquire' }),
      }),
      makeParams(articleId)
    );

    // Reporter B tries take_over -> 403 Forbidden
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'reporter-intruder',
      name: 'Intruder Reporter',
      role: 'reporter',
      email: 'intruder@lokswami.in',
    });

    const unauthorizedTakeOver = await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ action: 'take_over' }),
      }),
      makeParams(articleId)
    );
    expect(unauthorizedTakeOver.status).toBe(403);
    const errorBody = await unauthorizedTakeOver.json();
    expect(errorBody.error).toBe('FORBIDDEN');

    // Admin tries take_over -> 200 OK with control transferred
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'admin-desk',
      name: 'Senior Editor',
      role: 'admin',
      email: 'admin@lokswami.in',
    });

    const adminTakeOver = await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ action: 'take_over' }),
      }),
      makeParams(articleId)
    );
    expect(adminTakeOver.status).toBe(200);
    const takeOverBody = await adminTakeOver.json();
    expect(takeOverBody.success).toBe(true);
    expect(takeOverBody.hasLock).toBe(true);
    expect(takeOverBody.lock.userId).toBe('admin-desk');
    expect(takeOverBody.lock.userName).toBe('Senior Editor');

    // Cleanup
    await DELETE(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'DELETE',
      }),
      makeParams(articleId)
    );
  });

  it('automatically considers a lock inactive once 60 seconds have elapsed', async () => {
    const { GET, POST, DELETE } = await import(
      '@/app/api/admin/articles/[id]/lock/route'
    );
    const articleId = 'article-expire-404';

    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'user-timed',
      name: 'Timed User',
      role: 'reporter',
      email: 'timed@lokswami.in',
    });

    vi.useFakeTimers();
    const startTime = new Date('2026-09-04T12:00:00Z');
    vi.setSystemTime(startTime);

    // Acquire lock
    const postRes = await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ action: 'acquire' }),
      }),
      makeParams(articleId)
    );
    expect(postRes.status).toBe(200);

    // Immediately check status
    const getActive = await GET(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`),
      makeParams(articleId)
    );
    expect((await getActive.json()).isLocked).toBe(true);

    // Advance time by 61 seconds
    vi.setSystemTime(new Date(startTime.getTime() + 61_000));

    // Lock should now be expired
    const getExpired = await GET(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`),
      makeParams(articleId)
    );
    expect((await getExpired.json()).isLocked).toBe(false);

    // Another user can now acquire without 423
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'user-new',
      name: 'New Editor',
      role: 'reporter',
      email: 'new@lokswami.in',
    });

    const postNew = await POST(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'POST',
        body: JSON.stringify({ action: 'acquire' }),
      }),
      makeParams(articleId)
    );
    expect(postNew.status).toBe(200);
    expect((await postNew.json()).hasLock).toBe(true);

    // Clean up
    await DELETE(
      new NextRequest(`http://localhost/api/admin/articles/${articleId}/lock`, {
        method: 'DELETE',
      }),
      makeParams(articleId)
    );

    vi.useRealTimers();
  });
});
