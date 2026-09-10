import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as atomicStorage from '@/lib/storage/atomicStorage';
import {
  readUsersFile,
  writeUsersFile,
  upsertStoredUser,
  findStoredUserByEmail,
  scrubLegacyReaderCredentialsFromFile,
  type StoredUser,
} from '@/lib/storage/usersFile';

describe('Storage Layer Reader Credential Scrub & Physical Disk Verification (Phase 1.5)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lokswami-scrub-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  // 1 & 2. Legacy reader credentials physically removed from disk through normal runtime storage path, unrelated fields preserved
  it('1 & 2. legacy reader credentials physically removed from disk through normal runtime storage path', async () => {
    const tempFilePath = path.join(tempDir, 'legacy-users.json');
    const legacyRecords = [
      {
        _id: 'legacy-uuid-123',
        name: 'Legacy Reader',
        email: 'legacy@example.com',
        image: '',
        role: 'reader',
        whatsappNumber: '+919876543210',
        passwordHash: '$2a$12$legacyBcryptHashOnDisk',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
        isActive: true,
        readCount: 7,
        savedArticles: ['art-101'],
        preferredLanguage: 'hi',
        preferredCategories: ['politics'],
        optInDailyEpaper: true,
        pushEnabled: false,
        notificationsEnabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    // Create the physical file on disk with legacy credentials
    await fs.writeFile(tempFilePath, JSON.stringify(legacyRecords, null, 2), 'utf-8');

    // Verify file ON DISK initially contains the credential material
    const initialRaw = await fs.readFile(tempFilePath, 'utf-8');
    expect(initialRaw).toContain('legacyBcryptHashOnDisk');
    expect(initialRaw).toContain('passwordHash');
    expect(initialRaw).toContain('passwordSetAt');

    // Invoke normal runtime storage read path
    const inMemoryResult = await readUsersFile(tempFilePath);

    // In-memory verification
    expect(inMemoryResult).toHaveLength(1);
    expect(inMemoryResult[0].passwordHash).toBeUndefined();
    expect(inMemoryResult[0].passwordSetAt).toBeUndefined();
    expect(inMemoryResult[0].name).toBe('Legacy Reader');
    expect(inMemoryResult[0].email).toBe('legacy@example.com');
    expect(inMemoryResult[0].readCount).toBe(7);

    // PHYSICAL DISK VERIFICATION: Read raw file directly from disk
    const diskRaw = await fs.readFile(tempFilePath, 'utf-8');
    const diskParsed = JSON.parse(diskRaw);

    expect(diskRaw).not.toContain('legacyBcryptHashOnDisk');
    expect(diskRaw).not.toContain('passwordHash');
    expect(diskRaw).not.toContain('passwordSetAt');

    expect(diskParsed[0].passwordHash).toBeUndefined();
    expect(diskParsed[0].passwordSetAt).toBeUndefined();
    expect(diskParsed[0]._id).toBe('legacy-uuid-123');
    expect(diskParsed[0].name).toBe('Legacy Reader');
    expect(diskParsed[0].email).toBe('legacy@example.com');
    expect(diskParsed[0].whatsappNumber).toBe('+919876543210');
    expect(diskParsed[0].preferredLanguage).toBe('hi');
    expect(diskParsed[0].readCount).toBe(7);
    expect(diskParsed[0].savedArticles).toEqual(['art-101']);
    expect(diskParsed[0].optInDailyEpaper).toBe(true);
  });

  // 3. Mixed roles: reader credentials removed from physical disk, non-reader credentials preserved on disk
  it('3. mixed roles: reader credentials removed, non-reader record unchanged on disk', async () => {
    const tempFilePath = path.join(tempDir, 'mixed-users.json');
    const mixedRecords = [
      {
        _id: 'reader-1',
        name: 'Reader One',
        email: 'reader@example.com',
        role: 'reader',
        passwordHash: '$2a$12$readerSecretHash',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
        isActive: true,
      },
      {
        _id: 'editor-1',
        name: 'News Editor',
        email: 'editor@example.com',
        role: 'copy_editor',
        passwordHash: '$2a$12$editorRequiredHash',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
        isActive: true,
      },
    ];

    await fs.writeFile(tempFilePath, JSON.stringify(mixedRecords, null, 2), 'utf-8');

    // Trigger normal storage read
    await readUsersFile(tempFilePath);

    // Read directly from physical disk
    const diskRaw = await fs.readFile(tempFilePath, 'utf-8');
    const diskParsed = JSON.parse(diskRaw);

    // Reader record on disk must not have credentials
    expect(diskParsed[0].passwordHash).toBeUndefined();
    expect(diskParsed[0].passwordSetAt).toBeUndefined();
    expect(diskParsed[0].name).toBe('Reader One');

    // Non-reader record on disk MUST retain its credentials
    expect(diskParsed[1].passwordHash).toBe('$2a$12$editorRequiredHash');
    expect(diskParsed[1].passwordSetAt).toBe('2026-01-01T00:00:00.000Z');
    expect(diskParsed[1].name).toBe('News Editor');
  });

  // 4. Already-clean file: no unnecessary rewrite
  it('4. already-clean file: no unnecessary rewrite is performed', async () => {
    const tempFilePath = path.join(tempDir, 'clean-users.json');
    const cleanRecords = [
      {
        _id: 'clean-reader-1',
        name: 'Clean Reader',
        email: 'clean@example.com',
        role: 'reader',
        isActive: true,
      },
    ];

    await fs.writeFile(tempFilePath, JSON.stringify(cleanRecords, null, 2), 'utf-8');

    const atomicSpy = vi.spyOn(atomicStorage, 'writeJsonFileAtomically');

    // Read already clean file
    const result = await readUsersFile(tempFilePath);

    expect(result).toHaveLength(1);
    // Invariant: No rewrite triggered when the file has no reader credential verifiers
    expect(atomicSpy).not.toHaveBeenCalled();
  });

  // 5. Reader upsert containing passwordHash/passwordSetAt: physical file omits them
  it('5. reader upsert containing passwordHash/passwordSetAt: physical file omits them on disk', async () => {
    const tempFilePath = path.join(tempDir, 'upsert-users.json');

    // Upsert a reader with caller mistakenly or maliciously supplying passwordHash and passwordSetAt
    await upsertStoredUser(
      {
        _id: 'upserted-reader-1',
        name: 'Upserted Reader',
        email: 'upserted@example.com',
        role: 'reader',
        passwordHash: '$2a$12$mistakenPasswordHashPassedByCaller',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
        optInDailyEpaper: true,
      } as any,
      tempFilePath
    );

    // Read directly from physical disk
    const diskRaw = await fs.readFile(tempFilePath, 'utf-8');
    const diskParsed = JSON.parse(diskRaw);

    expect(diskRaw).not.toContain('mistakenPasswordHashPassedByCaller');
    expect(diskRaw).not.toContain('passwordHash');
    expect(diskRaw).not.toContain('passwordSetAt');

    expect(diskParsed[0].passwordHash).toBeUndefined();
    expect(diskParsed[0].passwordSetAt).toBeUndefined();
    expect(diskParsed[0].name).toBe('Upserted Reader');
    expect(diskParsed[0].email).toBe('upserted@example.com');
  });

  // 6. Durable scrub write failure: sanitized credentials are not returned, failure logged deterministically
  it('6. durable scrub write failure: credentials are never returned to caller and failure is logged', async () => {
    const tempFilePath = path.join(tempDir, 'write-fail-users.json');
    const legacyRecords = [
      {
        _id: 'fail-test-1',
        name: 'Fail Test Reader',
        email: 'fail@example.com',
        role: 'reader',
        passwordHash: '$2a$12$unwritableLegacyHash',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    await fs.writeFile(tempFilePath, JSON.stringify(legacyRecords, null, 2), 'utf-8');

    // Force atomic write to reject (simulating read-only filesystem or I/O failure)
    vi.spyOn(atomicStorage, 'writeJsonFileAtomically').mockRejectedValueOnce(
      new Error('EROFS: read-only file system')
    );
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Invoke readUsersFile
    const result = await readUsersFile(tempFilePath);

    // Invariant: Even if physical disk write fails, returned in-memory records NEVER expose credentials
    expect(result).toHaveLength(1);
    expect(result[0].passwordHash).toBeUndefined();
    expect(result[0].passwordSetAt).toBeUndefined();
    expect(result[0].name).toBe('Fail Test Reader');

    // Security warning must be logged deterministically
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Security] Failed to durably scrub legacy reader credentials from disk:'),
      expect.any(Error)
    );
  });
});

describe('P1-B: Storage Concurrency & Mutation Serialization (C4)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lokswami-concurrency-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  // 1. scrub + upsert overlap: durable scrub does not overwrite concurrent newer profile update
  it('1. scrub + upsert overlap: durable scrub does not overwrite concurrent newer profile update', async () => {
    const tempFilePath = path.join(tempDir, 'scrub-upsert-overlap.json');
    const initialRecords: StoredUser[] = [
      {
        _id: 'user-a',
        name: 'User Alpha',
        email: 'alpha@example.com',
        image: '',
        role: 'reader',
        passwordHash: '$2a$12$legacySecretAlpha',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
        isActive: true,
        readCount: 1,
        savedArticles: [],
        preferredLanguage: 'hi',
        preferredCategories: [],
        optInDailyEpaper: false,
        pushEnabled: false,
        notificationsEnabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        _id: 'user-b',
        name: 'User Beta Original',
        email: 'beta@example.com',
        image: '',
        role: 'reader',
        isActive: true,
        readCount: 0,
        savedArticles: [],
        preferredLanguage: 'hi',
        preferredCategories: [],
        optInDailyEpaper: false,
        pushEnabled: false,
        notificationsEnabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    await fs.writeFile(tempFilePath, JSON.stringify(initialRecords, null, 2), 'utf-8');

    // Concurrent execution: A reads/scrubs while B updates profile
    const [readResult, updatedUser] = await Promise.all([
      readUsersFile(tempFilePath),
      upsertStoredUser(
        {
          email: 'beta@example.com',
          name: 'User Beta NEW Profile Update',
          savedArticles: ['article-999'],
        },
        tempFilePath
      ),
    ]);

    expect(readResult).toHaveLength(2);
    expect(updatedUser.name).toBe('User Beta NEW Profile Update');

    // Inspect physical file on disk directly
    const rawDisk = await fs.readFile(tempFilePath, 'utf-8');
    const parsedDisk: StoredUser[] = JSON.parse(rawDisk);

    // Invariant: Alpha's legacy credentials must be durably removed from disk
    const alphaDisk = parsedDisk.find((u) => u.email === 'alpha@example.com');
    expect(alphaDisk).toBeDefined();
    expect(alphaDisk?.passwordHash).toBeUndefined();
    expect(alphaDisk?.passwordSetAt).toBeUndefined();
    expect(rawDisk).not.toContain('legacySecretAlpha');

    // Invariant: Beta's newer profile update must be PRESERVED (no lost update!)
    const betaDisk = parsedDisk.find((u) => u.email === 'beta@example.com');
    expect(betaDisk).toBeDefined();
    expect(betaDisk?.name).toBe('User Beta NEW Profile Update');
    expect(betaDisk?.savedArticles).toEqual(['article-999']);
  });

  // 2. scrub + writeUsersFile overlap: no lost update
  it('2. scrub + writeUsersFile overlap: no lost update', async () => {
    const tempFilePath = path.join(tempDir, 'scrub-write-overlap.json');
    const initialRecords: StoredUser[] = [
      {
        _id: 'legacy-1',
        name: 'Legacy User',
        email: 'legacy@example.com',
        image: '',
        role: 'reader',
        passwordHash: '$2a$12$legacySecret',
        isActive: true,
        readCount: 0,
        savedArticles: [],
        preferredLanguage: 'hi',
        preferredCategories: [],
        optInDailyEpaper: false,
        pushEnabled: false,
        notificationsEnabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    await fs.writeFile(tempFilePath, JSON.stringify(initialRecords, null, 2), 'utf-8');

    const newUsersPayload: StoredUser[] = [
      {
        _id: 'new-editor',
        name: 'Staff Editor',
        email: 'editor@example.com',
        image: '',
        role: 'copy_editor',
        passwordHash: '$2a$12$staffHashedPassword',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
        isActive: true,
        readCount: 0,
        savedArticles: [],
        preferredLanguage: 'hi',
        preferredCategories: [],
        optInDailyEpaper: false,
        pushEnabled: false,
        notificationsEnabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    await Promise.all([
      readUsersFile(tempFilePath),
      writeUsersFile(newUsersPayload, tempFilePath),
    ]);

    const disk = JSON.parse(await fs.readFile(tempFilePath, 'utf-8'));
    // Staff editor payload must survive
    expect(disk.some((u: StoredUser) => u.email === 'editor@example.com')).toBe(true);
  });

  // 3. two concurrent upserts: both expected updates survive
  it('3. two concurrent upserts: both expected updates survive according to intended semantics', async () => {
    const tempFilePath = path.join(tempDir, 'concurrent-upserts.json');
    await fs.writeFile(tempFilePath, '[]', 'utf-8');

    await Promise.all([
      upsertStoredUser(
        { email: 'user1@example.com', name: 'User One', optInDailyEpaper: true },
        tempFilePath
      ),
      upsertStoredUser(
        { email: 'user2@example.com', name: 'User Two', optInDailyEpaper: false },
        tempFilePath
      ),
    ]);

    const disk: StoredUser[] = JSON.parse(await fs.readFile(tempFilePath, 'utf-8'));
    expect(disk).toHaveLength(2);
    expect(disk.find((u) => u.email === 'user1@example.com')?.name).toBe('User One');
    expect(disk.find((u) => u.email === 'user2@example.com')?.name).toBe('User Two');
  });

  // 4. reader sanitization still works
  it('4. reader sanitization still works: reader credential fields prohibited on disk and memory', async () => {
    const tempFilePath = path.join(tempDir, 'reader-sanitization.json');
    await fs.writeFile(tempFilePath, '[]', 'utf-8');

    const result = await upsertStoredUser(
      {
        email: 'reader@example.com',
        name: 'Sanitized Reader',
        role: 'reader',
        passwordHash: '$2a$12$forbiddenReaderHash',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
      } as any,
      tempFilePath
    );

    expect(result.passwordHash).toBeUndefined();
    expect(result.passwordSetAt).toBeUndefined();

    const raw = await fs.readFile(tempFilePath, 'utf-8');
    expect(raw).not.toContain('forbiddenReaderHash');
  });

  // 5. mixed-role preservation still works
  it('5. mixed-role preservation still works: staff passwords preserved, reader passwords omitted', async () => {
    const tempFilePath = path.join(tempDir, 'mixed-role.json');
    await fs.writeFile(tempFilePath, '[]', 'utf-8');

    await upsertStoredUser(
      {
        email: 'reporter@example.com',
        name: 'Staff Reporter',
        role: 'reporter',
        passwordHash: '$2a$12$staffValidHash',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
      },
      tempFilePath
    );

    await upsertStoredUser(
      {
        email: 'reader@example.com',
        name: 'Reader Record',
        role: 'reader',
        passwordHash: '$2a$12$readerShouldBeOmitted',
      } as any,
      tempFilePath
    );

    const disk: StoredUser[] = JSON.parse(await fs.readFile(tempFilePath, 'utf-8'));
    const reporter = disk.find((u) => u.email === 'reporter@example.com');
    const reader = disk.find((u) => u.email === 'reader@example.com');

    expect(reporter?.passwordHash).toBe('$2a$12$staffValidHash');
    expect(reader?.passwordHash).toBeUndefined();
  });

  // 6. clean files still avoid unnecessary scrub rewrite
  it('6. clean files still avoid unnecessary scrub rewrite', async () => {
    const tempFilePath = path.join(tempDir, 'clean-file.json');
    const cleanData: StoredUser[] = [
      {
        _id: 'clean-1',
        name: 'Clean User',
        email: 'clean@example.com',
        image: '',
        role: 'reader',
        isActive: true,
        readCount: 0,
        savedArticles: [],
        preferredLanguage: 'hi',
        preferredCategories: [],
        optInDailyEpaper: false,
        pushEnabled: false,
        notificationsEnabled: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    await fs.writeFile(tempFilePath, JSON.stringify(cleanData, null, 2), 'utf-8');

    const atomicSpy = vi.spyOn(atomicStorage, 'writeJsonFileAtomically');
    await readUsersFile(tempFilePath);
    expect(atomicSpy).not.toHaveBeenCalled();
  });

  // 7. write failure releases lock correctly
  it('7. write failure releases lock correctly so subsequent mutations succeed', async () => {
    const tempFilePath = path.join(tempDir, 'write-failure-releases-lock.json');
    await fs.writeFile(tempFilePath, '[]', 'utf-8');

    vi.spyOn(atomicStorage, 'writeJsonFileAtomically').mockRejectedValueOnce(
      new Error('Simulated atomic write failure')
    );

    // First mutation fails
    await expect(
      upsertStoredUser({ email: 'fail@example.com', name: 'Fail User' }, tempFilePath)
    ).rejects.toThrow('Simulated atomic write failure');

    // Subsequent mutation must acquire lock cleanly and succeed
    const successUser = await upsertStoredUser(
      { email: 'success@example.com', name: 'Success User' },
      tempFilePath
    );
    expect(successUser.email).toBe('success@example.com');

    const disk: StoredUser[] = JSON.parse(await fs.readFile(tempFilePath, 'utf-8'));
    expect(disk).toHaveLength(1);
    expect(disk[0].email).toBe('success@example.com');
  });

  // 8. no deadlock on nested storage helpers
  it('8. no deadlock on nested storage helpers: concurrent find, read, upsert, scrub finish cleanly', async () => {
    const tempFilePath = path.join(tempDir, 'no-deadlock.json');
    await fs.writeFile(tempFilePath, '[]', 'utf-8');

    await upsertStoredUser({ email: 'seed@example.com', name: 'Seed' }, tempFilePath);

    const results = await Promise.all([
      findStoredUserByEmail('seed@example.com', tempFilePath),
      readUsersFile(tempFilePath),
      upsertStoredUser({ email: 'seed@example.com', name: 'Seed Updated' }, tempFilePath),
      scrubLegacyReaderCredentialsFromFile(tempFilePath),
    ]);

    expect(results[0]?.email).toBe('seed@example.com');
    expect(results[1]).toHaveLength(1);
    expect(results[2].name).toBe('Seed Updated');
    expect(results[3]).toBe(0);
  });

  // 9. repeated concurrent operations terminate
  it('9. repeated concurrent operations terminate without lost updates', async () => {
    const tempFilePath = path.join(tempDir, 'repeated-concurrent.json');
    await fs.writeFile(tempFilePath, '[]', 'utf-8');

    const upsertPromises = Array.from({ length: 10 }, (_, i) =>
      upsertStoredUser(
        { email: `concurrent-${i}@example.com`, name: `User ${i}` },
        tempFilePath
      )
    );

    const upserted = await Promise.all(upsertPromises);
    expect(upserted).toHaveLength(10);

    const disk: StoredUser[] = JSON.parse(await fs.readFile(tempFilePath, 'utf-8'));
    expect(disk).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(disk.some((u) => u.email === `concurrent-${i}@example.com`)).toBe(true);
    }
  });

  it('10. recursively strips reader credential keys from spread and nested input', async () => {
    const tempFilePath = path.join(tempDir, 'nested-reader-secrets.json');
    await fs.writeFile(tempFilePath, '[]', 'utf-8');

    await upsertStoredUser(
      { email: 'nested@example.com', name: 'Nested Reader', role: 'reader' },
      tempFilePath
    );
    await upsertStoredUser(
      {
        email: 'nested@example.com',
        name: 'Nested Reader',
        role: 'reader',
        passwordHash: 'top-level-secret',
        passwordSetAt: '2026-01-01T00:00:00.000Z',
        legacy: {
          passwordHash: 'nested-secret',
          deeper: [{ passwordSetAt: 'nested-date', safe: 'retained' }],
        },
      } as unknown as Partial<StoredUser> & { email: string },
      tempFilePath
    );

    const raw = await fs.readFile(tempFilePath, 'utf-8');
    const [stored] = JSON.parse(raw);
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toContain('passwordSetAt');
    expect(stored.legacy.deeper[0].safe).toBe('retained');
  });
});
