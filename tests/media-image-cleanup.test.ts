import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { MediaImageService } from '@/lib/server/media/mediaImageService';
import type { SpacesAdapter } from '@/lib/server/media/spacesAdapter';

describe('optimized image compensation', () => {
  it('deletes every completed variant when a later upload fails', async () => {
    const uploaded: string[] = [];
    const deleted: string[] = [];
    const spaces = {
      uploadBuffer: vi.fn(async () => {
        if (uploaded.length === 2) throw new Error('provider failure');
        const publicId = `lokswami/images/variant-${uploaded.length}.webp`;
        uploaded.push(publicId);
        return { publicId, secureUrl: `https://cdn/${publicId}`, resourceType: 'image', bytes: 10 };
      }),
      deleteAssetByPublicId: vi.fn(async (key: string) => { deleted.push(key); }),
    } as unknown as SpacesAdapter;
    const buffer = await sharp({
      create: { width: 16, height: 9, channels: 4, background: '#ffffff' },
    }).png().toBuffer();

    await expect(new MediaImageService().uploadOptimizedArticleImage({
      buffer, filename: 'safe.png', folder: 'lokswami/images', focalPointX: 50, focalPointY: 50,
    }, spaces)).rejects.toThrow('provider failure');
    expect(deleted).toEqual(uploaded);
  });
});
