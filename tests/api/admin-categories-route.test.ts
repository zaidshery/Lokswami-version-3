import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionFromReqMock = vi.fn();
const connectDBMock = vi.fn();

const findOneMock = vi.fn();
const findByIdAndDeleteMock = vi.fn();
const saveMock = vi.fn();
const CategoryMock = vi.fn().mockImplementation(() => ({
  save: saveMock,
}));

Object.assign(CategoryMock, {
  findByIdAndDelete: findByIdAndDeleteMock,
  findOne: findOneMock,
});

vi.mock('@/lib/auth/admin', () => ({
  getAdminSessionFromReq: getAdminSessionFromReqMock,
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
});
