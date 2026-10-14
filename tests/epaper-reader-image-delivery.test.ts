import { describe, expect, it } from 'vitest';
import { getEpaperReaderImage } from '@/lib/utils/epaperReaderImage';

describe('publication reader uses the existing image delivery seam', () => {
  it('keeps unknown geometry unchanged instead of inventing dimensions', () => {
    expect(getEpaperReaderImage('/one')).toEqual({ src: '/one' });
  });
  it('offers fitted responsive variants while retaining the original source URL', () => {
    const image = getEpaperReaderImage('/uploads/qa/page-16.jpg', 3000, 3208, { responsiveSpread: true });
    expect(image.src).toContain('/_next/image?');
    expect(image.src).toContain(encodeURIComponent('/uploads/qa/page-16.jpg'));
    expect(image.srcSet).toContain('640w');
    expect(image.sizes).toContain('(min-width: 1024px)');
    expect(image.src).toContain('q=80');
  });
  it('requests higher resolution and quality as controlled zoom increases', () => {
    const fit = getEpaperReaderImage('/uploads/qa/page.jpg', 3000, 3208, { spread: true });
    const zoom = getEpaperReaderImage('/uploads/qa/page.jpg', 3000, 3208, { spread: true, zoom: 4 });
    expect(fit.sizes).toBe('43vw'); expect(zoom.sizes).toBe('172vw');
    expect(zoom.src).toContain('q=90');
  });
});
