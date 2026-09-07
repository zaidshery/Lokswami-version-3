import { describe, expect, it } from 'vitest';
import { buildSwipeReaderPath, buildVideoReaderPath } from '@/lib/utils/readerContentPaths';

describe('reader video paths', () => {
  it('keeps legacy video links and prefers canonical Swipe slugs when available', () => {
    expect(buildVideoReaderPath('video-1')).toBe('/main/videos?video=video-1');
    expect(buildVideoReaderPath('video-1', 'city update')).toBe('/main/shorts/city%20update');
    expect(buildSwipeReaderPath('हिंदी-खबर')).toContain('/main/shorts/');
  });
});
