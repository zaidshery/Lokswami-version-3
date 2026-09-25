import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '@/app/api/admin/stories/[id]/lock/route';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

const {
  getAdminSessionFromReqMock,
  getActiveStoryLockMock,
  acquireOrRenewStoryLockMock,
  releaseStoryLockMock,
  takeOverStoryLockMock,
} = vi.hoisted(() => ({
  getAdminSessionFromReqMock: vi.fn(),
  getActiveStoryLockMock: vi.fn(),
  acquireOrRenewStoryLockMock: vi.fn(),
  releaseStoryLockMock: vi.fn(),
  takeOverStoryLockMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/server/storyLockService', () => ({
  getActiveStoryLock: getActiveStoryLockMock,
  acquireOrRenewStoryLock: acquireOrRenewStoryLockMock,
  releaseStoryLock: releaseStoryLockMock,
  takeOverStoryLock: takeOverStoryLockMock,
}));

describe('/api/admin/stories/[id]/lock route (Phase 3.7C)', () => {
  const adminUser: AdminSessionIdentity = {
    id: 'admin-1',
    email: 'admin@example.com',
    username: 'admin',
    name: 'Admin User',
    role: 'admin',
  };

  const reporterUser: AdminSessionIdentity = {
    id: 'reporter-1',
    email: 'reporter@example.com',
    username: 'reporter',
    name: 'Reporter User',
    role: 'reporter',
  };

  const storyId = 'story-lock-route-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 Unauthorized when session is missing', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/admin/stories/${storyId}/lock`);
    const res = await GET(req, { params: Promise.resolve({ id: storyId }) });

    expect(res.status).toBe(401);
  });

  it('GET returns lock status when story is currently locked', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(reporterUser);
    getActiveStoryLockMock.mockResolvedValue({
      isLocked: true,
      lock: {
        userId: 'reporter-2',
        userName: 'Other Reporter',
        userRole: 'reporter',
        lockedAt: '2026-09-24T12:00:00.000Z',
        expiresAt: '2026-09-24T12:01:00.000Z',
        isCurrentUser: false,
      },
    });

    const req = new NextRequest(`http://localhost/api/admin/stories/${storyId}/lock`);
    const res = await GET(req, { params: Promise.resolve({ id: storyId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hasLock).toBe(true);
    expect(data.lock.isCurrentUser).toBe(false);
    expect(data.lock.userName).toBe('Other Reporter');
  });

  it('POST acquire returns 200 with lock details on success', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(reporterUser);
    acquireOrRenewStoryLockMock.mockResolvedValue({
      success: true,
      hasLock: true,
      lock: {
        userId: reporterUser.id,
        userName: reporterUser.name,
        userRole: reporterUser.role,
        lockedAt: '2026-09-24T12:00:00.000Z',
        expiresAt: '2026-09-24T12:01:00.000Z',
        isCurrentUser: true,
      },
    });

    const req = new NextRequest(`http://localhost/api/admin/stories/${storyId}/lock`, {
      method: 'POST',
      body: JSON.stringify({ action: 'acquire' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: storyId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.lock.userId).toBe(reporterUser.id);
  });

  it('POST acquire returns 409 STORY_EDIT_LEASE_CONFLICT when competing editor holds lock', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(reporterUser);
    acquireOrRenewStoryLockMock.mockResolvedValue({
      success: false,
      status: 409,
      code: 'STORY_EDIT_LEASE_CONFLICT',
      error: 'LOCKED_BY_OTHER',
      holder: {
        userId: 'admin-1',
        userName: 'Admin User',
        userRole: 'admin',
        lockedAt: '2026-09-24T12:00:00.000Z',
        expiresAt: '2026-09-24T12:01:00.000Z',
      },
    });

    const req = new NextRequest(`http://localhost/api/admin/stories/${storyId}/lock`, {
      method: 'POST',
      body: JSON.stringify({ action: 'acquire' }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: storyId }) });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.code).toBe('STORY_EDIT_LEASE_CONFLICT');
    expect(data.holder.userName).toBe('Admin User');
  });

  it('DELETE releases the lock', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(reporterUser);
    releaseStoryLockMock.mockResolvedValue({ success: true });

    const req = new NextRequest(`http://localhost/api/admin/stories/${storyId}/lock`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: storyId }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(releaseStoryLockMock).toHaveBeenCalledWith(storyId, reporterUser);
  });
});
