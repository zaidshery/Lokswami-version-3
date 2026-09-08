import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '@/lib/auth/jwt';

const connectDBMock = vi.fn();
vi.mock('@/lib/db/mongoose', () => ({
  default: connectDBMock,
}));

const userFindOneMock = vi.fn();
vi.mock('@/lib/models/User', () => ({
  default: {
    findOne: userFindOneMock,
  },
}));

const findStoredUserByIdentifierMock = vi.fn();
const upsertStoredUserMock = vi.fn();
vi.mock('@/lib/storage/usersFile', () => ({
  findStoredUserByIdentifier: findStoredUserByIdentifierMock,
  upsertStoredUser: upsertStoredUserMock,
}));

describe('GAP-010: Reader Credential Authorization & Reverse Split-Brain Prevention', () => {
  const testEmail = 'reader@lokswami.in';
  const oldPassword = 'OldPassword123!';
  const newPassword = 'NewPassword456!';
  let oldHash = '';
  let newHash = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    oldHash = await hashPassword(oldPassword);
    newHash = await hashPassword(newPassword);
  });

  // 1. Mongo user exists + correct Mongo password -> succeeds
  it('1. Mongo user exists + correct Mongo password: successfully authenticates', async () => {
    connectDBMock.mockResolvedValue(true);
    const saveMock = vi.fn().mockResolvedValue(true);
    const mockUserDoc = {
      _id: 'mongo-user-123',
      name: 'Mongo Reader',
      email: testEmail,
      passwordHash: newHash,
      isActive: true,
      whatsappNumber: '+919876543210',
      optInDailyEpaper: true,
      role: 'reader',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      savedArticles: ['art-1'],
      save: saveMock,
    };
    userFindOneMock.mockResolvedValue(mockUserDoc);

    const { authorizeReaderCredentials } = await import('@/lib/auth/readerCredentials');

    const result = await authorizeReaderCredentials({
      loginId: testEmail,
      password: newPassword,
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('mongo-user-123');
    expect(result?.email).toBe(testEmail);
    expect(saveMock).toHaveBeenCalled();
    expect(findStoredUserByIdentifierMock).not.toHaveBeenCalled();
  });

  // 2. Mongo user exists + wrong password + file store contains matching stale password -> MUST FAIL
  it('2. Mongo user exists + wrong password + file store contains matching stale password: MUST FAIL (no fall-through)', async () => {
    connectDBMock.mockResolvedValue(true);
    const mockUserDoc = {
      _id: 'mongo-user-123',
      name: 'Mongo Reader',
      email: testEmail,
      passwordHash: newHash, // Authoritative hash is NEW
      isActive: true,
      save: vi.fn(),
    };
    userFindOneMock.mockResolvedValue(mockUserDoc);

    // File store has stale OLD password
    const staleFileUser = {
      _id: 'file-user-123',
      name: 'File Reader',
      email: testEmail,
      passwordHash: oldHash,
      isActive: true,
      role: 'reader' as const,
    };
    findStoredUserByIdentifierMock.mockResolvedValue(staleFileUser);

    const { authorizeReaderCredentials } = await import('@/lib/auth/readerCredentials');

    // Attempting login with OLD password
    const result = await authorizeReaderCredentials({
      loginId: testEmail,
      password: oldPassword,
    });

    // Invariant: Must return null and NOT authenticate against the file store
    expect(result).toBeNull();
    expect(findStoredUserByIdentifierMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });

  // 3. Mongo user exists with NEW password + file store contains OLD password:
  // OLD password -> MUST FAIL
  // NEW password -> succeeds
  it('3. Diverged store test: OLD password fails, NEW password succeeds, file store never consulted', async () => {
    connectDBMock.mockResolvedValue(true);
    const saveMock = vi.fn().mockResolvedValue(true);
    const mockUserDoc = {
      _id: 'mongo-user-123',
      name: 'Mongo Reader',
      email: testEmail,
      passwordHash: newHash,
      isActive: true,
      whatsappNumber: '+919876543210',
      optInDailyEpaper: true,
      role: 'reader',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      savedArticles: [],
      save: saveMock,
    };
    userFindOneMock.mockResolvedValue(mockUserDoc);

    // File store has OLD password
    findStoredUserByIdentifierMock.mockResolvedValue({
      _id: 'file-user-123',
      name: 'File Reader',
      email: testEmail,
      passwordHash: oldHash,
      isActive: true,
      role: 'reader',
    });

    const { authorizeReaderCredentials } = await import('@/lib/auth/readerCredentials');

    // Case 3A: OLD password -> MUST FAIL
    const oldAttempt = await authorizeReaderCredentials({
      loginId: testEmail,
      password: oldPassword,
    });
    expect(oldAttempt).toBeNull();
    expect(findStoredUserByIdentifierMock).not.toHaveBeenCalled();

    // Case 3B: NEW password -> SUCCEEDS
    const newAttempt = await authorizeReaderCredentials({
      loginId: testEmail,
      password: newPassword,
    });
    expect(newAttempt).not.toBeNull();
    expect(newAttempt?.id).toBe('mongo-user-123');
    expect(saveMock).toHaveBeenCalled();
  });

  // 4. Mongo unavailable + valid file-store password -> MUST FAIL CLOSED, file-store authentication must not run
  it('4. Mongo unavailable + valid file-store password: MUST FAIL CLOSED (file-store auth must not run)', async () => {
    connectDBMock.mockRejectedValue(new Error('MongoNetworkError: unreachable'));
    userFindOneMock.mockImplementation(() => {
      throw new Error('MongoNetworkError: unreachable');
    });

    const fileUser = {
      _id: 'file-user-123',
      name: 'Fallback Reader',
      email: testEmail,
      passwordHash: oldHash,
      isActive: true,
      whatsappNumber: '+919876543210',
      optInDailyEpaper: true,
      role: 'reader' as const,
      createdAt: '2026-08-01T00:00:00.000Z',
      savedArticles: [],
    };
    findStoredUserByIdentifierMock.mockResolvedValue(fileUser);

    const { authorizeReaderCredentials } = await import('@/lib/auth/readerCredentials');

    const result = await authorizeReaderCredentials({
      loginId: testEmail,
      password: oldPassword,
    });

    // Invariant: Mongo outage must FAIL CLOSED. File-store passwords must never authenticate.
    expect(result).toBeNull();
    expect(findStoredUserByIdentifierMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });

  // 5. Mongo password update succeeds + file sync fails + Mongo later unavailable:
  // OLD file password MUST NOT authenticate
  it('5. Mongo password update succeeds + file sync fails + Mongo later unavailable: OLD file password MUST NOT authenticate', async () => {
    // File store retains stale OLD password due to earlier sync failure
    findStoredUserByIdentifierMock.mockResolvedValue({
      _id: 'file-user-123',
      name: 'Stale File Reader',
      email: testEmail,
      passwordHash: oldHash, // Stale!
      isActive: true,
      role: 'reader',
    });

    // Later, Mongo suffers an outage
    connectDBMock.mockRejectedValue(new Error('MongoServerSelectionError: cluster unavailable'));
    userFindOneMock.mockImplementation(() => {
      throw new Error('MongoServerSelectionError: cluster unavailable');
    });

    const { authorizeReaderCredentials } = await import('@/lib/auth/readerCredentials');

    // Someone tries logging in with the stale old password during the outage
    const staleAttempt = await authorizeReaderCredentials({
      loginId: testEmail,
      password: oldPassword,
    });

    // Invariant: Stale file password MUST NOT authenticate during Mongo outage
    expect(staleAttempt).toBeNull();
    expect(findStoredUserByIdentifierMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });

  // 6. Mongo unavailable login must not silently downgrade credential authority
  it('6. Mongo unavailable login must not silently downgrade credential authority to file storage', async () => {
    connectDBMock.mockRejectedValue(new Error('MongoTimeoutError: operation timed out'));
    userFindOneMock.mockImplementation(() => {
      throw new Error('MongoTimeoutError: operation timed out');
    });

    findStoredUserByIdentifierMock.mockResolvedValue({
      _id: 'file-user-123',
      name: 'Downgrade Target Reader',
      email: testEmail,
      passwordHash: newHash,
      isActive: true,
      role: 'reader',
    });

    const { authorizeReaderCredentials } = await import('@/lib/auth/readerCredentials');

    const result = await authorizeReaderCredentials({
      loginId: testEmail,
      password: newPassword,
    });

    // Invariant: Authority must remain strictly MongoDB; no silent downgrade to file store
    expect(result).toBeNull();
    expect(findStoredUserByIdentifierMock).not.toHaveBeenCalled();
    expect(upsertStoredUserMock).not.toHaveBeenCalled();
  });
});
