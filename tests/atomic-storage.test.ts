import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';

describe('Atomic File Storage (Sprint 1)', () => {
  const testDir = path.resolve(process.cwd(), 'data', '__test_atomic__');
  const testFile = path.join(testDir, 'test-output.json');

  it('atomically writes JSON data and cleans up temporary files', async () => {
    const payload = { test: true, timestamp: Date.now(), items: [1, 2, 3] };
    await writeJsonFileAtomically(testFile, payload);

    // Verify target file exists and contains valid JSON
    const content = await fs.readFile(testFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(payload);

    // Verify no .tmp files linger in the directory
    const dirEntries = await fs.readdir(testDir);
    const tmpFiles = dirEntries.filter((file) => file.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('safely overwrites an existing file atomically', async () => {
    const initialPayload = { version: 1 };
    await writeJsonFileAtomically(testFile, initialPayload);

    const updatedPayload = { version: 2, status: 'updated' };
    await writeJsonFileAtomically(testFile, updatedPayload);

    const content = await fs.readFile(testFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(updatedPayload);

    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  });
});
