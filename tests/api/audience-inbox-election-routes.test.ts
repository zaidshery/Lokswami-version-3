import type { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const canManageContactInboxMock = vi.fn();
const canManageNewsroomSettingsMock = vi.fn();
const listStoredContactMessagesMock = vi.fn();
const getStoredContactMessageByIdMock = vi.fn();
const updateStoredContactMessageWorkflowMock = vi.fn();
const readElectionResultsDataMock = vi.fn();
const writeElectionResultsDataMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionMock,
}));
vi.mock('@/lib/auth/permissions', () => ({
  canManageContactInbox: canManageContactInboxMock,
  canManageNewsroomSettings: canManageNewsroomSettingsMock,
}));
vi.mock('@/lib/db/mongoose', () => ({ default: vi.fn() }));
vi.mock('@/lib/models/ContactMessage', () => ({ default: {} }));
vi.mock('@/lib/storage/contactMessagesFile', () => ({
  listStoredContactMessages: listStoredContactMessagesMock,
  getStoredContactMessageById: getStoredContactMessageByIdMock,
  updateStoredContactMessageWorkflow: updateStoredContactMessageWorkflowMock,
}));
vi.mock('@/lib/elections/storage', () => ({
  readElectionResultsData: readElectionResultsDataMock,
  writeElectionResultsData: writeElectionResultsDataMock,
}));

const originalMongoUri = process.env.MONGODB_URI;

function request(path: string, init?: RequestInit) {
  const url = new URL(`http://localhost${path}`);
  return {
    url: url.toString(),
    nextUrl: url,
    json: async () => (init?.body ? JSON.parse(String(init.body)) : {}),
    headers: new Headers(init?.headers),
  } as unknown as NextRequest;
}

const admin = {
  id: 'admin-1',
  username: 'desk-admin',
  email: 'desk@example.com',
  name: 'Desk Admin',
  role: 'admin',
};

describe('audience inbox and election route compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    getAdminSessionMock.mockResolvedValue(admin);
    canManageContactInboxMock.mockReturnValue(true);
    canManageNewsroomSettingsMock.mockReturnValue(true);
  });

  afterAll(() => {
    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }
  });

  it('preserves contact inbox authentication and authorization responses', async () => {
    const { GET } = await import('@/app/api/admin/contact-messages/route');
    getAdminSessionMock.mockResolvedValueOnce(null);
    const unauthorized = await GET(request('/api/admin/contact-messages'));
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ success: false, error: 'Unauthorized' });

    canManageContactInboxMock.mockReturnValueOnce(false);
    const forbidden = await GET(request('/api/admin/contact-messages'));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ success: false, error: 'Forbidden' });
    expect(listStoredContactMessagesMock).not.toHaveBeenCalled();
  });

  it('preserves contact inbox pagination, filters, and count envelope', async () => {
    listStoredContactMessagesMock.mockResolvedValue({
      data: [{ _id: 'contact-1', ticketId: 'LS-1', status: 'new' }],
      page: 2,
      limit: 10,
      total: 12,
      totalPages: 2,
      counts: { all: 12, new: 8, in_progress: 3, resolved: 1 },
    });

    const { GET } = await import('@/app/api/admin/contact-messages/route');
    const response = await GET(
      request('/api/admin/contact-messages?page=2&limit=10&status=new&q=reader')
    );

    expect(response.status).toBe(200);
    expect(listStoredContactMessagesMock).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      status: 'new',
      query: 'reader',
    });
    expect(await response.json()).toEqual({
      success: true,
      data: [{ _id: 'contact-1', ticketId: 'LS-1', status: 'new' }],
      pagination: { page: 2, limit: 10, total: 12, totalPages: 2 },
      counts: { all: 12, new: 8, in_progress: 3, resolved: 1 },
    });
  });

  it('preserves contact workflow validation and note author behavior', async () => {
    const { PATCH } = await import('@/app/api/admin/contact-messages/[id]/route');
    const invalid = await PATCH(
      request('/api/admin/contact-messages/contact-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'closed' }),
      })
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      success: false,
      error: 'Invalid workflow status',
    });

    updateStoredContactMessageWorkflowMock.mockResolvedValue({
      _id: 'contact-1',
      status: 'resolved',
      assignee: 'News Desk',
    });
    const updated = await PATCH(
      request('/api/admin/contact-messages/contact-1', {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'resolved',
          assignee: ' News Desk ',
          note: ' Followed up with reader. ',
        }),
      })
    );

    expect(updated.status).toBe(200);
    expect(updateStoredContactMessageWorkflowMock).toHaveBeenCalledWith('contact-1', {
      status: 'resolved',
      assignee: 'News Desk',
      note: 'Followed up with reader.',
      noteAuthor: 'desk-admin',
    });
    expect(await updated.json()).toEqual({
      success: true,
      data: { _id: 'contact-1', status: 'resolved', assignee: 'News Desk' },
    });
  });

  it('preserves public election cache policy for live and final results', async () => {
    const { GET } = await import('@/app/api/elections/results/route');
    readElectionResultsDataMock.mockResolvedValueOnce({ mode: 'live', states: [] });
    const live = await GET();
    expect(live.status).toBe(200);
    expect(live.headers.get('cache-control')).toBe(
      'public, s-maxage=30, stale-while-revalidate=600'
    );

    readElectionResultsDataMock.mockResolvedValueOnce({ mode: 'final', states: [] });
    const final = await GET();
    expect(final.headers.get('cache-control')).toBe(
      'public, s-maxage=300, stale-while-revalidate=600'
    );
  });

  it('preserves election management RBAC and raw response shape', async () => {
    const { GET, POST } = await import('@/app/api/admin/elections/results/route');
    canManageNewsroomSettingsMock.mockReturnValueOnce(false);
    const forbidden = await GET(request('/api/admin/elections/results'));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'Forbidden' });

    const saved = {
      mode: 'live',
      states: [{ id: 'mp', name: 'Madhya Pradesh' }],
      lastUpdated: '2026-09-11T04:00:00.000Z',
    };
    writeElectionResultsDataMock.mockResolvedValue(saved);
    const response = await POST(
      request('/api/admin/elections/results', {
        method: 'POST',
        body: JSON.stringify(saved),
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      lastUpdated: '2026-09-11T04:00:00.000Z',
    });
  });
});
