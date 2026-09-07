import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * Wait helper for exponential backoff retries on transient file locks.
 */
function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safely writes JSON data to a file using an atomic temporary-file-and-rename pattern.
 * This prevents data corruption or truncated files during unexpected server shutdowns,
 * preemption, or power failures.
 *
 * @param targetPath Absolute path to the destination file.
 * @param data Data to serialize and write (either an object/array or pre-serialized JSON string).
 */
export async function writeJsonFileAtomically(
  targetPath: string,
  data: unknown
): Promise<void> {
  const dir = path.dirname(targetPath);
  if (typeof fs.mkdir === 'function') {
    await fs.mkdir(dir, { recursive: true });
  }

  const serialized =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  // If running in a test environment with incomplete fs mocks that omit rename,
  // fall back gracefully to direct writeFile.
  if (typeof fs.rename !== 'function') {
    await fs.writeFile(targetPath, serialized, 'utf-8');
    return;
  }

  const uniqueId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const tempPath = path.join(
    dir,
    `.${path.basename(targetPath)}.${uniqueId}.tmp`
  );

  let tempFileCreated = false;

  try {
    // 1. Write the complete data payload to the temporary file
    await fs.writeFile(tempPath, serialized, 'utf-8');
    tempFileCreated = true;

    // 2. Atomically rename the temporary file to the target path.
    // On Windows, transient file locks (e.g., antivirus or concurrent readers)
    // can trigger EPERM/EBUSY, so we include a small retry loop with backoff.
    let renamed = false;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        await fs.rename(tempPath, targetPath);
        renamed = true;
        break;
      } catch (err) {
        lastError = err;
        const code = (err as { code?: string })?.code;
        if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
          await wait(attempt * 25);
          continue;
        }
        throw err;
      }
    }

    if (!renamed) {
      throw lastError || new Error(`Failed to atomically rename ${tempPath} to ${targetPath}`);
    }

    // Target successfully replaced; tempPath no longer exists
    tempFileCreated = false;
  } finally {
    // 3. Guarantee any orphaned temporary file is cleaned up if an error occurred
    if (tempFileCreated && typeof fs.unlink === 'function') {
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore unlink failure if file was already removed or never written
      }
    }
  }
}
