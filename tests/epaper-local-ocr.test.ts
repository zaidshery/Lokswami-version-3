// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { runIsolatedLocalOcr } from '@/lib/server/epaperLocalOcr';
vi.mock('server-only', () => ({}));

describe('packaged Hindi/English OCR worker', () => {
  it('recognizes a local image in an isolated process using packaged language assets', async () => {
    const image = await sharp(Buffer.from('<svg width="1200" height="400"><rect width="1200" height="400" fill="white"/><text x="60" y="170" font-size="72" font-family="sans-serif" fill="black">LOKSWAMI NEWS</text><text x="60" y="280" font-size="48" font-family="sans-serif" fill="black">Editorial review is required</text></svg>')).png().toBuffer();
    const suggestions = await runIsolatedLocalOcr(image);
    expect(suggestions.map((entry) => entry.text).join(' ')).toMatch(/LOKSWAMI/i);
    expect(suggestions[0].hotspot.w).toBeGreaterThan(0);
    expect(suggestions[0].hotspot.w).toBeLessThanOrEqual(1);
  }, 60_000);
  it('terminates an unresponsive worker at the caller deadline', async () => {
    await expect(runIsolatedLocalOcr(Buffer.from('invalid'), 1)).rejects.toThrow(/deadline|stopped/);
  });
});
