import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/jwt';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

const connectDBMock = vi.fn();
vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

const userFindOneMock = vi.fn();
const userFindOneAndUpdateMock = vi.fn();

vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: userFindOneMock,
    findOneAndUpdate: userFindOneAndUpdateMock,
  },
}));

const findStoredUserByEmailMock = vi.fn();
const upsertStoredUserMock = vi.fn();

vi.mock('@/lib/storage/usersFile', () => ({
  findStoredUserByEmail: findStoredUserByEmailMock,
  upsertStoredUser: upsertStoredUserMock,
}));

describe('GAP-010: Final Password Consistency & Split-Brain Hardening', () => {
  const testEmail = 'reader@lokswami.in';
  const existingPassword = 'ValidOldPassword123!';
  let existingHash = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    existingHash = await hashPassword(existingPassword);

    authMock.mockResolvedValue({
      user: {
        id: 'user-123',
        name: 'Test Reader',
        email: testEmail,
        role: 'reader',
      },
    });
  });

  // 1. Mongo available: password change succeeds, Mongo updated, file-store synced
  it('1. Mongo available: password change succeeds, updates Mongo, and syncs to file store', async () => {
    connectDBMock.mockResolvedValue(true);
    const mockUserDoc = {
      _id: 'user-123',
      email: testEmail,
      name: 'Test Reader',
      passwordHash: existingHash,
    };

    userFindOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockUserDoc),
    });

    let capturedMongoUpdate: any = null;
    userFindOneAndUpdateMock.mockImplementation((_filter, update) => {
      capturedMongoUpdate = update;
      return {
        lean: () =>
          Promise.resolve({
            _id: 'user-123',
            name: 'Test Reader',
            email: testEmail,
            whatsappNumber: '9876543210',
            optInDailyEpaper: true,
            preferredLanguage: 'hi',
            preferredCategories: [],
            passwordHash: update.$set.passwordHash,
            passwordSetAt: update.$set.passwordSetAt,
          }),
      };
    });

    let capturedFileUpsert: any = null;
    upsertStoredUserMock.mockImplementation((data) => {
      capturedFileUpsert = data;
      return Promise.resolve(data);
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: existingPassword,
        newPassword: 'NewPassword123!',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify Mongo updated
    expect(capturedMongoUpdate).toBeDefined();
    expect(capturedMongoUpdate.$set.passwordHash).toBeDefined();
    expect(capturedMongoUpdate.$set.passwordHash).toMatch(/^\$2[aby]\$\d+\$/);
    expect(capturedMongoUpdate.$set.passwordSetAt).toBeInstanceOf(Date);

    // Verify file-store synced
    expect(capturedFileUpsert).toBeDefined();
    expect(capturedFileUpsert.passwordHash).toBe(capturedMongoUpdate.$set.passwordHash);
    expect(capturedFileUpsert.email).toBe(testEmail);
  });

  // 2. Wrong Mongo password: rejected with 400
  it('2. Wrong Mongo password: fails with 400 and does not update Mongo or file store', async () => {
    connectDBMock.mockResolvedValue(true);
    const mockUserDoc = {
      _id: 'user-123',
      email: testEmail,
      passwordHash: existingHash,
    };

    userFindOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockUserDoc),
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'WrongPassword!',
        newPassword: 'NewPassword123!',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Current password does not match.');

    expect(userFindOneAndUpdateMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });

  // 3. Mongo unavailable + password change: returns 503 fail-closed, Mongo write not attempted, file unchanged
  it('3. Mongo unavailable + password change: fails closed with 503, writes nothing to Mongo or file store', async () => {
    connectDBMock.mockRejectedValue(new Error('MongoNetworkError: failed to connect'));
    userFindOneMock.mockImplementation(() => {
      throw new Error('MongoNetworkError: failed to connect');
    });

    const fileStoreUser = {
      _id: 'user-file-123',
      name: 'Fallback Reader',
      email: testEmail,
      passwordHash: existingHash,
      passwordSetAt: '2026-08-01T00:00:00.000Z',
      isActive: true,
      whatsappNumber: '9876543210',
      preferredLanguage: 'hi' as const,
    };
    findStoredUserByEmailMock.mockResolvedValue(fileStoreUser);

    const { PATCH } = await import('@/app/api/user/profile/route');

    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: existingPassword,
        newPassword: 'BrandNewSecurePassword123!',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Password changes are temporarily unavailable. Please try again shortly.');

    // Invariant checks: Mongo write not attempted, file store not upserted
    expect(userFindOneAndUpdateMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
    expect(fileStoreUser.passwordHash).toBe(existingHash);
    expect(fileStoreUser.passwordSetAt).toBe('2026-08-01T00:00:00.000Z');
  });

  // 4. Exact split-brain regression:
  // Mongo contains OLD password, file store contains another password, Mongo read throws,
  // request attempts password change -> must NOT return success, file password must NOT change.
  it('4. Exact split-brain regression: prevents file-store password change when Mongo read fails', async () => {
    const divergedFilePassword = 'DivergedFallbackPassword456!';
    const divergedFileHash = await hashPassword(divergedFilePassword);

    const fileStoreUser = {
      _id: 'user-file-123',
      name: 'Fallback Reader',
      email: testEmail,
      passwordHash: divergedFileHash,
      passwordSetAt: '2026-07-01T00:00:00.000Z',
      isActive: true,
      whatsappNumber: '9876543210',
      preferredLanguage: 'hi' as const,
    };
    findStoredUserByEmailMock.mockResolvedValue(fileStoreUser);

    // Mongo read throws
    connectDBMock.mockRejectedValue(new Error('MongoNetworkError: read failure'));
    userFindOneMock.mockImplementation(() => {
      throw new Error('MongoNetworkError: read failure');
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    // Request attempts to change password
    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: divergedFilePassword,
        newPassword: 'BrandNewSplitBrainPassword789!',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);

    // Invariant: file store password must NOT change
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
    expect(fileStoreUser.passwordHash).toBe(divergedFileHash);
  });

  // 5. Non-password profile update during Mongo outage: still succeeds through file-store fallback
  it('5. Non-password profile update during Mongo outage: succeeds via file-store fallback without mutating credentials', async () => {
    connectDBMock.mockRejectedValue(new Error('MongoNetworkError: failed to connect'));
    userFindOneMock.mockImplementation(() => {
      throw new Error('MongoNetworkError: failed to connect');
    });
    userFindOneAndUpdateMock.mockImplementation(() => {
      throw new Error('MongoNetworkError: failed to connect');
    });

    const fileStoreUser = {
      _id: 'user-file-123',
      name: 'Original Name',
      email: testEmail,
      passwordHash: existingHash,
      passwordSetAt: '2026-08-01T00:00:00.000Z',
      whatsappNumber: '9876543210',
      optInDailyEpaper: true,
      preferredLanguage: 'hi' as const,
      preferredCategories: ['news'],
    };
    findStoredUserByEmailMock.mockResolvedValue(fileStoreUser);

    let capturedFileUpsert: any = null;
    upsertStoredUserMock.mockImplementation((data) => {
      capturedFileUpsert = data;
      return Promise.resolve(data);
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    // Update non-password profile fields
    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Name',
        whatsappNumber: '9123456780',
        preferredLanguage: 'en',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Name');
    expect(body.data.whatsappNumber).toBe('+919123456780');
    expect(body.data.preferredLanguage).toBe('en');

    // Invariant: passwordHash and passwordSetAt must remain untouched
    expect(capturedFileUpsert).toBeDefined();
    expect(capturedFileUpsert.name).toBe('Updated Name');
    expect(capturedFileUpsert.whatsappNumber).toBe('+919123456780');
    expect(capturedFileUpsert.preferredLanguage).toBe('en');
    expect(capturedFileUpsert.passwordHash).toBe(existingHash);
    expect(capturedFileUpsert.passwordSetAt).toBe('2026-08-01T00:00:00.000Z');
  });

  // 6. Prove there is no path where passwordHash is written only to file store and success is returned
  it('6. Proves password changes fail closed if Mongo write fails, preventing file-store-only password commits', async () => {
    connectDBMock.mockResolvedValue(true);
    const mockUserDoc = {
      _id: 'user-123',
      email: testEmail,
      passwordHash: existingHash,
    };

    // Mongo read succeeds
    userFindOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockUserDoc),
    });

    // But Mongo write fails (e.g., primary stepdown, network drop during write)
    userFindOneAndUpdateMock.mockImplementation(() => {
      throw new Error('MongoWriteException: primary stepped down');
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: existingPassword,
        newPassword: 'BrandNewSecurePassword123!',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Password changes are temporarily unavailable. Please try again shortly.');

    // Crucial: File store must NOT have received an upsert with the new password
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });
});
