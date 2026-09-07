import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {
  acquireOrRenewStoredLock,
  getActiveStoredLock,
  listActiveStoredLocks,
  purgeExpiredStoredLocks,
  releaseStoredLock,
} from '@/lib/storage/articleLocksFile';

describe('articleLocksFile storage module', () => {
  const locksFile = path.join(process.cwd(), 'data', 'article-locks.json');
  let backupContent: string | null = null;

  beforeEach(async () => {
    try {
      backupContent = await fs.readFile(locksFile, 'utf-8');
    } catch {
      backupContent = null;
    }
    // Start tests with empty locks array
    await fs.writeFile(locksFile, '[]', 'utf-8');
  });

  afterEach(async () => {
    try {
      if (backupContent !== null) {
        await fs.writeFile(locksFile, backupContent, 'utf-8');
      } else {
        await fs.unlink(locksFile).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  });

  it('acquires a lock and persists it to data/article-locks.json', async () => {
    const lock = await acquireOrRenewStoredLock({
      articleId: 'art-101',
      userId: 'user-1',
      userName: 'Rahul Sharma',
      userRole: 'reporter',
      expiresInMs: 60_000,
    });

    expect(lock.articleId).toBe('art-101');
    expect(lock.userId).toBe('user-1');
    expect(lock.userName).toBe('Rahul Sharma');
    expect(new Date(lock.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Verify written to file
    const active = await getActiveStoredLock('art-101');
    expect(active).not.toBeNull();
    expect(active?.userId).toBe('user-1');
  });

  it('renews an existing lease without modifying lockedAt', async () => {
    const initial = await acquireOrRenewStoredLock({
      articleId: 'art-202',
      userId: 'user-2',
      userName: 'Pooja Verma',
      userRole: 'copy_editor',
      expiresInMs: 30_000,
    });

    const renewed = await acquireOrRenewStoredLock({
      articleId: 'art-202',
      userId: 'user-2',
      userName: 'Pooja Verma',
      userRole: 'copy_editor',
      expiresInMs: 60_000,
    });

    expect(renewed.lockedAt).toBe(initial.lockedAt);
    expect(new Date(renewed.expiresAt).getTime()).toBeGreaterThan(
      new Date(initial.expiresAt).getTime()
    );
  });

  it('releases lock cleanly when requested by current holder or force=true', async () => {
    await acquireOrRenewStoredLock({
      articleId: 'art-303',
      userId: 'user-3',
      userName: 'Vikas',
      userRole: 'reporter',
    });

    // Rejection: Another user tries to release without force
    const unauthorizedRelease = await releaseStoredLock('art-303', 'user-4', false);
    expect(unauthorizedRelease).toBe(false);

    // Verify still locked
    let active = await getActiveStoredLock('art-303');
    expect(active).not.toBeNull();

    // Success: Admin forces release
    const forceRelease = await releaseStoredLock('art-303', 'user-admin', true);
    expect(forceRelease).toBe(true);

    active = await getActiveStoredLock('art-303');
    expect(active).toBeNull();
  });

  it('treats expired locks as inactive and purges them on disk', async () => {
    // Manually write an expired lock and an active lock
    const expiredLock = {
      articleId: 'art-expired',
      userId: 'user-old',
      userName: 'Old Editor',
      userRole: 'reporter',
      lockedAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };

    const activeLock = {
      articleId: 'art-valid',
      userId: 'user-current',
      userName: 'Active Editor',
      userRole: 'admin',
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };

    await fs.writeFile(
      locksFile,
      JSON.stringify([expiredLock, activeLock], null, 2),
      'utf-8'
    );

    // getActiveStoredLock should return null for expired
    const expiredResult = await getActiveStoredLock('art-expired');
    expect(expiredResult).toBeNull();

    // listActiveStoredLocks should only return activeLock
    const activeList = await listActiveStoredLocks();
    expect(activeList).toHaveLength(1);
    expect(activeList[0].articleId).toBe('art-valid');

    // purgeExpiredStoredLocks should remove expired item from disk
    const purged = await purgeExpiredStoredLocks();
    expect(purged).toBe(1);

    const raw = JSON.parse(await fs.readFile(locksFile, 'utf-8'));
    expect(raw).toHaveLength(1);
    expect(raw[0].articleId).toBe('art-valid');
  });
});
