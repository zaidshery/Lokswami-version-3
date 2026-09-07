import { describe, expect, it } from 'vitest';
import { buildSwipePageMetadata } from '@/lib/seo/readerPageMetadata';

describe('Swipe story metadata', () => {
  it('uses the slug route as canonical and Open Graph URL', () => {
    const metadata = buildSwipePageMetadata({
      slug: 'indore-update',
      videoId: 'video-1',
      title: 'Indore update',
      description: 'Published Swipe summary',
      category: 'Regional',
      image: '/poster.jpg',
    });
    expect(String(metadata.alternates?.canonical)).toMatch(/\/main\/shorts\/indore-update$/);
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({ url: metadata.alternates?.canonical })
    );
  });
});
