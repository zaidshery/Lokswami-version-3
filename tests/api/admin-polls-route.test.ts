import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminSessionMock = vi.fn();
const connectDBMock = vi.fn();
const startSessionMock = vi.fn();

const pollFindMock = vi.fn();
const pollFindByIdMock = vi.fn();
const pollUpdateManyMock = vi.fn();
const pollCreateMock = vi.fn();

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
}));

vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

vi.mock('@/lib/models/Poll', () => ({
  default: {
    find: pollFindMock,
    findById: pollFindByIdMock,
    updateMany: pollUpdateManyMock,
    create: pollCreateMock,
  },
}));

function createTxSession() {
  return {
    withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
}

describe('/api/admin/polls routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectDBMock.mockResolvedValue({
      startSession: startSessionMock,
    });
  });

  it('rejects poll access when no admin session exists', async () => {
    getAdminSessionMock.mockResolvedValue(null);

    const { GET } = await import('@/app/api/admin/polls/route');
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      success: false,
      error: 'Unauthorized',
    });
  });

  it.each(['admin', 'copy_editor', 'reporter'] as const)(
    'forbids %s from creating polls',
    async (role) => {
    getAdminSessionMock.mockResolvedValue({
      id: `${role}-1`,
      email: `${role}@example.com`,
      name: role,
      role,
    });

    const { POST } = await import('@/app/api/admin/polls/route');
    const response = await POST(
      new Request('http://localhost/api/admin/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: 'Should this be live?',
          options: ['Yes', 'No'],
          status: 'inactive',
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      success: false,
      error: 'Forbidden',
    });
    expect(pollCreateMock).not.toHaveBeenCalled();
    }
  );

  it('validates poll creation payloads before touching the database', async () => {
    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });

    const { POST } = await import('@/app/api/admin/polls/route');
    const response = await POST(
      new Request('http://localhost/api/admin/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: 'Need more options?',
          options: ['Only one'],
          status: 'inactive',
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: 'Poll must have between 2 and 4 options.',
    });
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(pollCreateMock).not.toHaveBeenCalled();
  });

  it('deactivates existing live polls before creating a new active poll', async () => {
    const txSession = createTxSession();
    const createdPollId = new Types.ObjectId();

    getAdminSessionMock.mockResolvedValue({
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    });
    startSessionMock.mockResolvedValue(txSession);
    pollUpdateManyMock.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });
    pollCreateMock.mockResolvedValue([
      {
        _id: createdPollId,
        question: 'Make this the live poll?',
        options: [
          { text: 'Yes', votes: 0 },
          { text: 'No', votes: 0 },
        ],
        totalVotes: 0,
        status: 'active',
        expiresAt: null,
        linkedArticleId: null,
        createdAt: new Date('2026-04-15T08:00:00.000Z'),
        updatedAt: new Date('2026-04-15T08:00:00.000Z'),
      },
    ]);

    const { POST } = await import('@/app/api/admin/polls/route');
    const response = await POST(
      new Request('http://localhost/api/admin/polls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: 'Make this the live poll?',
          options: ['Yes', 'No'],
          status: 'active',
        }),
      }) as unknown as NextRequest
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(pollUpdateManyMock).toHaveBeenCalledWith(
      { status: 'active' },
      { $set: { status: 'inactive' } },
      { session: txSession }
    );
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual(
      expect.objectContaining({
        id: createdPollId.toString(),
        status: 'active',
      })
    );
  });
});

