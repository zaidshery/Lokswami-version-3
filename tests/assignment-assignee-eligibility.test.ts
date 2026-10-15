import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { connectDBMock, userFindOneMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(),
  userFindOneMock: vi.fn(),
}));

vi.mock('@/lib/db/mongoose', () => ({ default: connectDBMock }));
vi.mock('@/lib/models/User', () => ({
  default: { findOne: userFindOneMock },
}));

describe('workflow assignee eligibility', () => {
  const originalMongoUri = process.env.MONGODB_URI;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONGODB_URI = 'mongodb://assignment-test';
    connectDBMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;
  });

  function mockUser(value: unknown) {
    const lean = vi.fn().mockResolvedValue(value);
    const select = vi.fn(() => ({ lean }));
    userFindOneMock.mockReturnValue({ select });
  }

  it('resolves an active newsroom assignee and normalizes a legacy newsroom role', async () => {
    mockUser({
      _id: 'staff-1',
      name: 'Reporter One',
      email: 'reporter@example.com',
      role: 'author',
      isActive: true,
    });
    const { resolveAssignee } = await import('@/lib/server/content/newsroomArticleRepository');

    await expect(resolveAssignee('reporter@example.com')).resolves.toMatchObject({
      id: 'staff-1',
      role: 'reporter',
    });
    expect(userFindOneMock).toHaveBeenCalledWith({
      email: 'reporter@example.com',
      isActive: { $ne: false },
    });
  });

  it('rejects an inactive assignee even if a stale repository result is returned', async () => {
    mockUser({
      _id: 'inactive-1',
      name: 'Inactive Admin',
      email: 'inactive@example.com',
      role: 'admin',
      isActive: false,
    });
    const { resolveAssignee } = await import('@/lib/server/content/newsroomArticleRepository');

    await expect(resolveAssignee('inactive@example.com')).resolves.toBeNull();
  });

  it('rejects reader and unknown roles', async () => {
    const { resolveAssignee } = await import('@/lib/server/content/newsroomArticleRepository');
    mockUser({ _id: 'reader-1', email: 'reader@example.com', role: 'reader', isActive: true });
    await expect(resolveAssignee('reader@example.com')).resolves.toBeNull();

    mockUser({ _id: 'unknown-1', email: 'unknown@example.com', role: 'owner', isActive: true });
    await expect(resolveAssignee('unknown@example.com')).resolves.toBeNull();
  });
});
