import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ issue: vi.fn(), story: vi.fn() }));
vi.mock('@/lib/server/publicEpaperMetadata', () => ({ getPublicEpaperForMetadata: mocks.issue, getPublicEpaperStoryForMetadata: mocks.story }));
vi.mock('@/lib/server/publicEpaperFeed', () => ({ listPublicEpaperFeed: vi.fn() }));
vi.mock('@/app/(reader)/main/epaper/EPaperPageClient', () => ({ default: () => null }));
import { generateEPaperMetadata } from '@/app/(reader)/main/epaper/EPaperPageServer';
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://lokswami.com');
  mocks.issue.mockResolvedValue({ id: 'paper-1', title: 'Public issue', citySlug: 'indore', cityName: 'Indore', publishDate: '2026-01-01' });
  mocks.story.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe('publication metadata unavailable selectors', () => {
  it.each(['epaper', 'emagazine'] as const)('keeps safe %s issue metadata and noindexes an unreleased story', async (publicationType) => {
    const metadata = await generateEPaperMetadata({ searchParams: Promise.resolve({ paper: 'paper-1', story: 'hidden-story', page: '2' }) }, publicationType);
    expect(metadata.robots).toMatchObject({ index: false });
    const json = JSON.stringify(metadata);
    expect(json).not.toContain('MUTABLE_SECRET_HEADLINE_DO_NOT_EXPOSE');
    expect(json).not.toContain('MUTABLE_SECRET_DESCRIPTION_DO_NOT_EXPOSE');
  });
  it('noindexes a missing or hidden issue without looking up its stories', async () => {
    mocks.issue.mockResolvedValue(null);
    mocks.story.mockClear();
    const metadata = await generateEPaperMetadata({ searchParams: Promise.resolve({ paper: 'hidden', story: 'secret' }) });
    expect(metadata.robots).toMatchObject({ index: false });
    expect(mocks.story).not.toHaveBeenCalled();
    expect(JSON.stringify(metadata)).not.toContain('STALE_PUBLIC_COPY');
  });
  it('keeps a public issue indexable', async () => {
    const metadata = await generateEPaperMetadata({ searchParams: Promise.resolve({ paper: 'paper-1' }) });
    expect(metadata.robots).toMatchObject({ index: true });
  });
});
