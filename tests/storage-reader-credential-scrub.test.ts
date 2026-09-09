import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as atomicStorage from '@/lib/storage/atomicStorage';
import {
  sanitizeStoredUserCredentials,
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
