import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Swipe trust UI', () => {
  it('contains no fabricated stories or unsupported subscription, like, or quality controls', () => {
    const videosPage = read('app/(reader)/main/videos/VideosPageClient.tsx');
    const legacyShorts = read('components/ui/VideoShortsFeed.tsx');
    expect(videosPage).not.toMatch(/fallback-(?:lead|short|queue)-video/);
    expect(videosPage).not.toMatch(/Subscribe|subscribers|toggleLiked|likedIds/);
    expect(legacyShorts).not.toMatch(/QualityOption|QUALITY_OPTIONS|settingsPanelView === 'quality'/);
    expect(legacyShorts).not.toMatch(/handleLike|likedIds/);
  });
});
