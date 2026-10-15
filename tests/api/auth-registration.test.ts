import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const connectDBMock = vi.fn();
vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

const userFindOneMock = vi.fn();
const userCreateMock = vi.fn();
vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: userFindOneMock,
    create: userCreateMock,
  },
}));

const upsertStoredUserMock = vi.fn();
vi.mock('@/lib/storage/usersFile', () => ({
  upsertStoredUser: upsertStoredUserMock,
}));

describe('POST /api/auth/register (Mongo-Authoritative Registration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectDBMock.mockResolvedValue(true);
    userFindOneMock.mockResolvedValue(null);
    userCreateMock.mockImplementation(async (doc: Record<string, unknown>) => ({
      _id: 'mongo-user-uuid-123',
      ...doc,
    }));
    upsertStoredUserMock.mockImplementation(async (doc: Record<string, unknown>) => doc);
  });

  it('rejects registration without full name (400)', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: '',
        email: 'test@example.com',
        password: 'password123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/full name/i);
  });

  it('rejects registration with short password (400)', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Rahul Sharma',
        email: 'rahul@example.com',
        password: '123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/at least 6 characters/i);
  });

  it('rejects registration without email or WhatsApp number (400)', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Rahul Sharma',
        password: 'password123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/either a valid email address or whatsapp number/i);
  });

  // 1. Mongo available: registration succeeds, Mongo user created, file store sync attempted, returns 201
  it('1. Mongo available: registration succeeds, creates Mongo user, syncs file store, returns 201', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Test Subscriber',
        whatsappNumber: '9876543210',
        password: 'securePassword123',
        optInDailyEpaper: true,
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.user.id).toBe('mongo-user-uuid-123');
    expect(json.user.name).toBe('Test Subscriber');
    expect(json.user.whatsappNumber).toBe('+919876543210');

    expect(userCreateMock).toHaveBeenCalledTimes(1);
    expect(userCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Subscriber',
        whatsappNumber: '+919876543210',
        role: 'reader',
        isActive: true,
      })
    );

    expect(upsertStoredUserMock).toHaveBeenCalledTimes(1);
    const fileSyncPayload = upsertStoredUserMock.mock.calls[0][0];
    expect(fileSyncPayload).toMatchObject({
      _id: 'mongo-user-uuid-123',
      name: 'Test Subscriber',
      whatsappNumber: '+919876543210',
      role: 'reader',
    });
    // Security Invariant (Phase 1.5): File sync payload must NOT contain password credentials
    expect(fileSyncPayload.passwordHash).toBeUndefined();
    expect(fileSyncPayload.passwordSetAt).toBeUndefined();
  });

  // 2. Mongo unavailable: returns 503, User.create not called, file-store upsert NOT called
  it('2. Mongo unavailable: returns 503, does not call User.create, does not upsert file store', async () => {
    connectDBMock.mockRejectedValue(new Error('MongoNetworkError: connection refused'));

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Test Subscriber',
        email: 'reader@lokswami.in',
        password: 'securePassword123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Registration is temporarily unavailable. Please try again shortly.');

    expect(userCreateMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });

  // 3. Mongo create throws: returns 503, file store NOT used as registration fallback
  it('3. Mongo create throws: returns 503, file store NOT used as registration fallback', async () => {
    userCreateMock.mockRejectedValue(new Error('MongoWriteException: disk full'));

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Test Subscriber',
        email: 'reader@lokswami.in',
        password: 'securePassword123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Registration is temporarily unavailable. Please try again shortly.');

    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });

  // 4. Duplicate Mongo email: returns 409
  it('4. Duplicate Mongo email: returns 409 and does not create account', async () => {
    userFindOneMock.mockResolvedValue({
      _id: 'existing-mongo-id',
      email: 'reader@lokswami.in',
    });

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Duplicate Subscriber',
        email: 'reader@lokswami.in',
        password: 'securePassword123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toBe('An account with this email already exists.');

    expect(userCreateMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });

  // 5. Duplicate Mongo WhatsApp: returns 409
  it('5. Duplicate Mongo WhatsApp: returns 409 and does not create account', async () => {
    userFindOneMock.mockResolvedValue({
      _id: 'existing-mongo-id',
      whatsappNumber: '+919876543210',
    });

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Duplicate WhatsApp',
        whatsappNumber: '9876543210',
        password: 'securePassword123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toBe('An account with this WhatsApp number already exists.');

    expect(userCreateMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });

  // 6. Mongo registration succeeds + file-store sync fails:
  // still returns 201, Mongo account remains valid, no rollback to file-only behavior
  it('6. Mongo registration succeeds + file-store sync fails: still returns 201, Mongo account remains valid', async () => {
    upsertStoredUserMock.mockRejectedValue(new Error('EACCES: permission denied writing users.json'));

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Sync Fail Reader',
        email: 'syncfail@lokswami.in',
        password: 'securePassword123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.user.id).toBe('mongo-user-uuid-123');
    expect(json.user.email).toBe('syncfail@lokswami.in');

    expect(userCreateMock).toHaveBeenCalledTimes(1);
    expect(upsertStoredUserMock).toHaveBeenCalledTimes(1);
  });

  // 7. Regression proof: no code path allows Mongo failure -> file password -> 201
  it('7. Regression proof: no code path creates file-only credentials when Mongo fails', async () => {
    connectDBMock.mockRejectedValue(new Error('MongoServerSelectionError: server unavailable'));

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Fail Closed Reader',
        email: 'failclosed@lokswami.in',
        password: 'securePassword123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(503);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Registration is temporarily unavailable. Please try again shortly.');

    // Crucial invariant: under no circumstance is file store upserted with credentials
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
    expect(userCreateMock).not.toHaveBeenCalled();
  });

  // 8. Stale file-only record does not prevent valid Mongo registration
  it('8. Stale file-only record does not prevent valid Mongo registration', async () => {
    // Mongo user does not exist
    userFindOneMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Valid Reader',
        email: 'staleinfilesonly@lokswami.in',
        password: 'securePassword123',
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(userCreateMock).toHaveBeenCalledTimes(1);
  });
});
