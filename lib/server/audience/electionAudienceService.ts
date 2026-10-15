import {
  readElectionResultsData,
  writeElectionResultsData,
} from '@/lib/elections/storage';
import {
  electionAssetRepository,
  type ElectionAssetRepository,
} from './electionAssetRepository';

const VALID_STATE_IDS = new Set(['wb', 'kerala', 'tn', 'assam', 'puducherry']);

export class ElectionAudienceServiceError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ElectionAudienceServiceError';
  }
}

export class ElectionAudienceService {
  constructor(private readonly assets: ElectionAssetRepository = electionAssetRepository) {}

  readResults() {
    return readElectionResultsData();
  }

  writeResults(input: unknown) {
    return writeElectionResultsData(input);
  }

  async saveGraphic(stateId: string, file: File) {
    if (!VALID_STATE_IDS.has(stateId)) {
      throw new ElectionAudienceServiceError('Invalid state ID', 400);
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (error) {
      console.error('[election-upload] Failed to read file buffer:', error);
      throw new ElectionAudienceServiceError('Failed to read file', 500);
    }

    try {
      await this.assets.ensureDirectory();
    } catch (error) {
      console.error('[election-upload] Failed to create directory:', error);
      throw new ElectionAudienceServiceError('Storage error (dir)', 500);
    }

    try {
      await this.assets.write(stateId, buffer);
    } catch (error) {
      console.error('[election-upload] Failed to write file:', error);
      throw new ElectionAudienceServiceError('Storage error (write)', 500);
    }

    console.log(`[election-upload] Successfully updated ${stateId} graphic`);
    return {
      message: `Successfully updated ${stateId} election graphic.`,
      url: `/elections/${stateId}.jpg?t=${Date.now()}`,
    };
  }

  async deleteGraphic(stateId: unknown) {
    if (typeof stateId !== 'string' || !VALID_STATE_IDS.has(stateId)) {
      throw new ElectionAudienceServiceError('Invalid state ID', 400);
    }
    await this.assets.delete(stateId);
    return { message: `Deleted ${stateId} election graphic.` };
  }
}

export const electionAudienceService = new ElectionAudienceService();
