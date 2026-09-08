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

describe('GAP-010: Reader Password Fallback Resilience', () => {
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

  it('verifies password change when MongoDB is available', async () => {
    connectDBMock.mockResolvedValue(true);
    const mockUserDoc = {
      _id: 'user-123',
      email: testEmail,
      passwordHash: existingHash,
    };
    userFindOneMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockUserDoc),
      then: (resolve: any, reject: any) => Promise.resolve(mockUserDoc).then(resolve, reject),
    });

    userFindOneAndUpdateMock.mockReturnValue({
      lean: () => Promise.resolve({
        _id: 'user-123',
        name: 'Test Reader',
        email: testEmail,
        preferredLanguage: 'hi',
      }),
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    // 1. Wrong old password fails with 400
    const wrongOldReq = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'WrongPassword!',
        newPassword: 'NewPassword123!',
      }),
    });

    const wrongOldRes = await PATCH(wrongOldReq);
    expect(wrongOldRes.status).toBe(400);
    const wrongOldBody = await wrongOldRes.json();
    expect(wrongOldBody.error).toBe('Current password does not match.');

    // 2. Correct old password succeeds with 200
    const correctReq = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: existingPassword,
        newPassword: 'NewPassword123!',
      }),
    });

    const correctRes = await PATCH(correctReq);
    expect(correctRes.status).toBe(200);
    const correctBody = await correctRes.json();
    expect(correctBody.success).toBe(true);
  });

  it('verifies password change when MongoDB is UNAVAILABLE (file-store fallback)', async () => {
    // Simulate MongoDB outage
    connectDBMock.mockRejectedValue(new Error('MongoNetworkError: failed to connect to server'));
    userFindOneMock.mockImplementation(() => {
      throw new Error('MongoNetworkError: failed to connect to server');
    });
    userFindOneAndUpdateMock.mockImplementation(() => {
      throw new Error('MongoNetworkError: failed to connect to server');
    });

    // File-store user exists with existing password hash and profile data
    const fileStoreUser = {
      _id: 'user-file-123',
      name: 'Fallback Reader',
      email: testEmail,
      image: '',
      role: 'reader' as const,
      whatsappNumber: '9876543210',
      passwordHash: existingHash,
      passwordSetAt: '2026-09-01T00:00:00.000Z',
      isActive: true,
      readCount: 5,
      savedArticles: ['art-1'],
      preferredLanguage: 'hi' as const,
      preferredCategories: ['politics'],
      optInDailyEpaper: true,
      pushEnabled: false,
      notificationsEnabled: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };

    findStoredUserByEmailMock.mockResolvedValue(fileStoreUser);
    let capturedFileUpsert: any = null;
    upsertStoredUserMock.mockImplementation((data) => {
      capturedFileUpsert = data;
      return Promise.resolve({
        ...fileStoreUser,
        ...data,
      });
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    // 1. Wrong old password should fail with 400 (not crash with 500)
    const wrongOldReq = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'WrongPassword!',
        newPassword: 'NewPassword123!',
      }),
    });

    const wrongOldRes = await PATCH(wrongOldReq);
    expect(wrongOldRes.status).toBe(400);
    const wrongOldBody = await wrongOldRes.json();
    expect(wrongOldBody.error).toBe('Current password does not match.');

    // 2. Valid password update succeeds via file store
    const validReq = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: existingPassword,
        newPassword: 'BrandNewSecurePassword123!',
        preferredLanguage: 'en',
      }),
    });

    const validRes = await PATCH(validReq);
    expect(validRes.status).toBe(200);
    const validBody = await validRes.json();
    expect(validBody.success).toBe(true);

    // Verify stored password remains hashed and other fields preserved
    expect(capturedFileUpsert).toBeDefined();
    expect(capturedFileUpsert.passwordHash).toMatch(/^\$2[aby]\$\d+\$/);
    expect(capturedFileUpsert.passwordHash).not.toBe('BrandNewSecurePassword123!');
    expect(capturedFileUpsert.name).toBe('Fallback Reader');
    expect(capturedFileUpsert.whatsappNumber).toBe('9876543210');
    expect(capturedFileUpsert.preferredLanguage).toBe('en');
  });

  it('P1-B: prevents fallback-verified credentials from authorizing overwrite of MongoDB password', async () => {
    const olderPassword = 'OlderFallbackPassword123!';
    const olderHash = await hashPassword(olderPassword);

    const newerPassword = 'NewerMongoPassword456!';
    const newerHash = await hashPassword(newerPassword);

    // 1. Mongo user exists with NEWER_PASSWORD
    const mongoUserDoc = {
      _id: 'user-123',
      email: testEmail,
      name: 'Mongo Reader',
      passwordHash: newerHash,
    };

    // 2. File-store user exists with OLDER_PASSWORD
    const fileStoreUser = {
      _id: 'user-file-123',
      name: 'Fallback Reader',
      email: testEmail,
      image: '',
      role: 'reader' as const,
      whatsappNumber: '9876543210',
      passwordHash: olderHash,
      passwordSetAt: '2026-08-01T00:00:00.000Z',
      isActive: true,
      readCount: 5,
      savedArticles: [],
      preferredLanguage: 'hi' as const,
      preferredCategories: [],
      optInDailyEpaper: true,
      pushEnabled: false,
      notificationsEnabled: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    findStoredUserByEmailMock.mockResolvedValue(fileStoreUser);

    let capturedFileUpsert: any = null;
    upsertStoredUserMock.mockImplementation((data) => {
      capturedFileUpsert = data;
      return Promise.resolve({
        ...fileStoreUser,
        ...data,
      });
    });

    // 3. Initial Mongo credential read fails (simulating transient outage during lookup)
    userFindOneMock.mockImplementation(() => {
      throw new Error('MongoNetworkError: transient failure on read');
    });

    // 5. Mongo write becomes available again (recovering before write path)
    let mongoFindOneAndUpdateCalled = false;
    userFindOneAndUpdateMock.mockImplementation(() => {
      mongoFindOneAndUpdateCalled = true;
      return {
        lean: () => Promise.resolve(mongoUserDoc),
      };
    });

    const { PATCH } = await import('@/app/api/user/profile/route');

    // 4. Request passes OLDER_PASSWORD, which matches only the fallback file store
    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: olderPassword,
        newPassword: 'BrandNewPassword789!',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);

    // 6. Request must NOT overwrite Mongo based only on fallback authorization!
    expect(mongoFindOneAndUpdateCalled).toBe(false);
    expect(mongoUserDoc.passwordHash).toBe(newerHash); // Mongo password remains NEWER_PASSWORD

    // File store update succeeded
    expect(capturedFileUpsert).toBeDefined();
    expect(capturedFileUpsert.passwordHash).not.toBe(olderHash);
    expect(capturedFileUpsert.passwordHash).toMatch(/^\$2[aby]\$\d+\$/);
  });
});
