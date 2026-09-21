import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { connectDBMock, getAdminSessionFromReqMock, getAllWorkflowDeskItemsMock, userFindMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn(),
  getAdminSessionFromReqMock: vi.fn(),
  getAllWorkflowDeskItemsMock: vi.fn(),
  userFindMock: vi.fn(),
}));

vi.mock('@/lib/db/mongoose', () => ({ default: connectDBMock }));
vi.mock('@/lib/auth/admin', () => ({ getAdminSessionFromReq: getAdminSessionFromReqMock }));
vi.mock('@/lib/admin/articleWorkflowOverview', () => ({
  getAllWorkflowDeskItems: getAllWorkflowDeskItemsMock,
}));
vi.mock('@/lib/models/User', () => ({
  default: { find: userFindMock },
}));

function request(contentTypes = 'article') {
  return new NextRequest(
    `http://localhost/api/admin/work-queue/assignee-suggestions?contentTypes=${contentTypes}`
  );
}

describe('GET /api/admin/work-queue/assignee-suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminSessionFromReqMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });
    connectDBMock.mockResolvedValue(undefined);
    getAllWorkflowDeskItemsMock.mockResolvedValue([]);
  });

  function mockMembers(members: unknown[]) {
    const lean = vi.fn().mockResolvedValue(members);
    const select = vi.fn(() => ({ lean }));
    userFindMock.mockReturnValue({ select });
  }

  it('returns 401 without a session and 403 for assignment-ineligible roles', async () => {
    const { GET } = await import('@/app/api/admin/work-queue/assignee-suggestions/route');

    getAdminSessionFromReqMock.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(401);

    getAdminSessionFromReqMock.mockResolvedValueOnce({
      id: 'reporter-1',
      email: 'reporter@example.com',
      name: 'Reporter',
      role: 'reporter',
    });
    expect((await GET(request())).status).toBe(403);
  });

  it('returns only active canonical newsroom staff without private email data or rankings', async () => {
    mockMembers([
      { _id: 'copy-1', name: 'Zara Copy', email: 'zara@example.com', role: 'copy_editor', isActive: true },
      { _id: 'reporter-1', name: 'Asha Reporter', email: 'asha@example.com', role: 'author', isActive: true },
      { _id: 'inactive-1', name: 'Inactive Admin', email: 'inactive@example.com', role: 'admin', isActive: false },
      { _id: 'reader-1', name: 'Reader', email: 'reader@example.com', role: 'reader', isActive: true },
    ]);

    const { GET } = await import('@/app/api/admin/work-queue/assignee-suggestions/route');
    const response = await GET(request('article,story'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([
      expect.objectContaining({ id: 'reporter-1', name: 'Asha Reporter', role: 'reporter', isActive: true }),
      expect.objectContaining({ id: 'copy-1', name: 'Zara Copy', role: 'copy_editor', isActive: true }),
    ]);
    expect(payload.data).toHaveLength(2);
    expect(payload.data.every((member: Record<string, unknown>) => !('email' in member))).toBe(true);
    expect(payload.data.every((member: Record<string, unknown>) => !('suitability' in member))).toBe(true);
  });

  it('calculates active and overdue assignment counts from the existing work queue data', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    mockMembers([
      { _id: 'copy-1', name: 'Copy Editor', email: 'copy@example.com', role: 'copy_editor', isActive: true },
    ]);
    getAllWorkflowDeskItemsMock.mockResolvedValue([
      { status: 'assigned', assignedToId: 'copy-1', assignedToEmail: 'copy@example.com', dueAt: '2026-09-19T12:00:00.000Z' },
      { status: 'in_review', assignedToId: 'copy-1', assignedToEmail: 'copy@example.com', dueAt: '2026-09-21T12:00:00.000Z' },
      { status: 'published', assignedToId: 'copy-1', assignedToEmail: 'copy@example.com', dueAt: '2026-09-18T12:00:00.000Z' },
    ]);

    const { GET } = await import('@/app/api/admin/work-queue/assignee-suggestions/route');
    const payload = await (await GET(request())).json();

    expect(payload.data[0]).toMatchObject({ activeWorkload: 2, overdueWorkload: 1 });
    vi.useRealTimers();
  });
});
