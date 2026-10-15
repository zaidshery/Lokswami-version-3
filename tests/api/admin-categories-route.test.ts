import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionFromReqMock = vi.fn();
const connectDBMock = vi.fn();

const findOneMock = vi.fn();
const findByIdMock = vi.fn();
const findByIdAndDeleteMock = vi.fn();
const isMongoAvailableMock = vi.fn();
const saveMock = vi.fn();
const CategoryMock = vi.fn().mockImplementation(() => ({
  save: saveMock,
}));

Object.assign(CategoryMock, {
  findById: findByIdMock,
  findByIdAndDelete: findByIdAndDeleteMock,
  findOne: findOneMock,
});

vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/db/mongoAvailability', () => ({
  isMongoAvailable: isMongoAvailableMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Category', () => ({
  default: CategoryMock,
}));

describe('/api/admin/categories POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONGODB_URI = 'mongodb://example.com/test';
    connectDBMock.mockResolvedValue(undefined);
    isMongoAvailableMock.mockResolvedValue(true);
  });

  it('prevents reporters from creating categories', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });

    const { POST } = await import('@/app/api/admin/categories/route');
    const response = await POST(
      new Request('http://localhost/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Investigations' }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      success: false,
      error: 'Forbidden',
    });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(findOneMock).not.toHaveBeenCalled();
    expect(CategoryMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});

describe('/api/admin/categories mutation access parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONGODB_URI = 'mongodb://example.com/test';
    isMongoAvailableMock.mockResolvedValue(true);
  });

  it('prevents unauthenticated callers from deleting categories', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(null);

    const { DELETE } = await import('@/app/api/admin/categories/[id]/route');
    const response = await DELETE(
      new Request('http://localhost/api/admin/categories/category-1', {
        method: 'DELETE',
      }) as unknown as NextRequest
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: 'Unauthorized' });
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
  });

  it('prevents reporters from deleting categories', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });

    const { DELETE } = await import('@/app/api/admin/categories/[id]/route');
    const response = await DELETE(
      new Request('http://localhost/api/admin/categories/category-1', {
        method: 'DELETE',
      }) as unknown as NextRequest
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: 'Forbidden' });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
  });

  it('rejects deletion of seeded system categories with 400', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    findByIdMock.mockResolvedValue({
      _id: 'cat-mp',
      name: 'Madhya Pradesh',
      slug: 'madhya-pradesh',
    });

    const { DELETE } = await import('@/app/api/admin/categories/[id]/route');
    const response = await DELETE(
      new Request('http://localhost/api/admin/categories/cat-mp', {
        method: 'DELETE',
      }) as unknown as NextRequest
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      error: 'System categories cannot be deleted',
    });
    expect(findByIdMock).toHaveBeenCalledWith('cat-mp');
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
  });

  it('allows authorized admin to delete genuine custom categories', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    findByIdMock.mockResolvedValue({
      _id: 'cat-custom',
      name: 'Investigations',
      slug: 'investigations',
    });
    findByIdAndDeleteMock.mockResolvedValue({
      _id: 'cat-custom',
      name: 'Investigations',
      slug: 'investigations',
    });

    const { DELETE } = await import('@/app/api/admin/categories/[id]/route');
    const response = await DELETE(
      new Request('http://localhost/api/admin/categories/cat-custom', {
        method: 'DELETE',
      }) as unknown as NextRequest
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(findByIdMock).toHaveBeenCalledWith('cat-custom');
    expect(findByIdAndDeleteMock).toHaveBeenCalledWith('cat-custom');
  });

  it('returns 404 when target category does not exist', async () => {
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    findByIdMock.mockResolvedValue(null);

    const { DELETE } = await import('@/app/api/admin/categories/[id]/route');
    const response = await DELETE(
      new Request('http://localhost/api/admin/categories/non-existent-id', {
        method: 'DELETE',
      }) as unknown as NextRequest
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: 'Not found' });
    expect(findByIdMock).toHaveBeenCalledWith('non-existent-id');
    expect(findByIdAndDeleteMock).not.toHaveBeenCalled();
  });
});
