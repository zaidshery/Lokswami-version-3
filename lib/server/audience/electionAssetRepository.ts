import { promises as fs } from 'fs';
import path from 'path';

function electionsDir() {
  return path.join(process.cwd(), 'public', 'elections');
}

export class ElectionAssetRepository {
  async ensureDirectory() {
    await fs.mkdir(electionsDir(), { recursive: true });
  }

  async write(stateId: string, buffer: Buffer) {
    await fs.writeFile(path.join(electionsDir(), `${stateId}.jpg`), buffer);
  }

  async delete(stateId: string) {
    const filePath = path.join(electionsDir(), `${stateId}.jpg`);
    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
    } catch {
      // Historical behavior treats an already absent graphic as a successful delete.
    }
  }
}

export const electionAssetRepository = new ElectionAssetRepository();

