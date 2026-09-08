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
});
