// @vitest-environment node
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { loadTrustedEpaperImage, renderBrandedEpaperImage } from '@/lib/server/epaperShareImage';

describe('branded e-paper clipping files', () => {
  it('embeds a logo and footer around the source crop without overlaying the article', async () => {
    const input = await sharp({ create: { width: 600, height: 1000, channels: 3, background: '#00ff00' } }).png().toBuffer();
    const output = await renderBrandedEpaperImage({ image: input, hotspot: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, label: 'Indore | 2026-09-05 | Page 2' });
    const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(1200);
    expect(info.height).toBeGreaterThan(700);
    const pixel = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
    expect(pixel(600, 200)).toEqual([0, 255, 0]);
    expect(pixel(10, 10)).toEqual([255, 255, 255]);
    const header = await sharp(output).extract({ left: 40, top: 15, width: 320, height: 90 }).stats();
    expect(header.channels.some((channel) => channel.min < 100)).toBe(true);
    const footer = await sharp(output).extract({ left: 0, top: info.height - 80, width: 1200, height: 80 }).stats();
    expect(footer.channels.some((channel) => channel.min < 100)).toBe(true);
  });
  it('rejects arbitrary URLs before fetching', async () => {
    await expect(loadTrustedEpaperImage('http://127.0.0.1/private')).rejects.toThrow('Unsupported');
    await expect(loadTrustedEpaperImage('/../../.env')).rejects.toThrow('Unsupported');
  });
});
