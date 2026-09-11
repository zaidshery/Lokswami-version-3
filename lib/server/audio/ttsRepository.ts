import connectDB from '@/lib/db/mongoose';
import TtsAsset, { type ITtsAsset, type TtsAssetDocument } from '@/lib/models/TtsAsset';
import TtsAuditEvent from '@/lib/models/TtsAuditEvent';
import { getTtsConfig } from '@/lib/server/ttsAssets';

export class TtsRepository {
  async queryAssets(
    filters: Record<string, unknown>,
    limit: number
  ): Promise<{
    assets: ITtsAsset[];
    recentAudits: unknown[];
    totalAssets: number;
    statusCounts: { _id: unknown; count: number }[];
    variantCounts: { _id: unknown; count: number }[];
    recentFailures: ITtsAsset[];
  }> {
    await connectDB();

    const [assets, recentAudits, totalAssets, statusCounts, variantCounts, recentFailures] =
      await Promise.all([
        TtsAsset.find(filters)
          .sort({ updatedAt: -1, _id: -1 })
          .limit(limit)
          .lean(),
        TtsAuditEvent.find({})
          .sort({ createdAt: -1, _id: -1 })
          .limit(12)
          .lean(),
        TtsAsset.countDocuments(filters),
        TtsAsset.aggregate([
          { $match: filters },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        TtsAsset.aggregate([
          { $match: filters },
          { $group: { _id: '$variant', count: { $sum: 1 } } },
        ]),
        TtsAsset.find({ ...filters, status: 'failed' })
          .sort({ updatedAt: -1, _id: -1 })
          .limit(5)
          .lean(),
      ]);

    return {
      assets: assets as unknown as ITtsAsset[],
      recentAudits,
      totalAssets,
      statusCounts,
      variantCounts,
      recentFailures: recentFailures as unknown as ITtsAsset[],
    };
  }

  async getRetentionDays(): Promise<number> {
    await connectDB();
    const config = await getTtsConfig();
    return Math.max(1, Number(config.retentionDays || 90));
  }

  async findAssetsForCleanup(
    filters: Record<string, unknown>,
    limit: number
  ): Promise<TtsAssetDocument[]> {
    await connectDB();
    return TtsAsset.find(filters)
      .sort({ updatedAt: 1, _id: 1 })
      .limit(limit);
  }

  async deleteAssetDocument(asset: TtsAssetDocument): Promise<void> {
    await asset.deleteOne();
  }

  async findAssetsForRevalidation(
    query: Record<string, unknown>,
    limit: number
  ): Promise<TtsAssetDocument[]> {
    await connectDB();
    return TtsAsset.find(query)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit);
  }

  async getSettingsCounts(): Promise<{
    readyAssets: number;
    failedAssets: number;
    staleAssets: number;
  }> {
    await connectDB();
    const [failedAssets, staleAssets, readyAssets] = await Promise.all([
      TtsAsset.countDocuments({ status: 'failed' }),
      TtsAsset.countDocuments({ status: 'stale' }),
      TtsAsset.countDocuments({ status: 'ready', provider: 'manual' }),
    ]);

    return {
      readyAssets,
      failedAssets,
      staleAssets,
    };
  }

  async recordAuditEvent(eventData: Record<string, unknown>): Promise<void> {
    try {
      await connectDB();
      await TtsAuditEvent.create(eventData);
    } catch (error) {
      console.error('Failed to write TTS audit event in repository:', error);
    }
  }
}

export const ttsRepository = new TtsRepository();
