import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpaperMetadataService } from '@/lib/server/epaper/epaperMetadataService';
import type { EpaperRepository } from '@/lib/server/epaper/epaperRepository';

const id = '507f1f77bcf86cd799439011';
const secret = 'MUTABLE_SECRET_HEADLINE_DO_NOT_EXPOSE';
const description = 'MUTABLE_SECRET_DESCRIPTION_DO_NOT_EXPOSE';
const issue = { _id: id, publicationType: 'epaper', status: 'published', isCurrentRevision: true, title: 'Public issue', publishDate: '2026-01-01', city: 'Indore', pages: [], pageCount: 2 };
const snapshot = { title: 'Released headline', excerpt: 'Released description', slug: 'released-story', pageNumber: 1, version: 2, hotspot: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 } };
const repo = { isPublicMongoAvailable: vi.fn(), isValidId: () => true, toObjectId: (value: string) => value, findEditionById: vi.fn(), findEdition: vi.fn(), findLatestEdition: vi.fn(), findArticle: vi.fn(), getStoredById: vi.fn(), listAllStored: vi.fn() };
const service = new EpaperMetadataService(repo as unknown as EpaperRepository);
beforeEach(() => {
  vi.resetAllMocks();
  repo.isPublicMongoAvailable.mockResolvedValue(true);
  repo.findEditionById.mockResolvedValue(issue);
  repo.findEdition.mockResolvedValue(issue);
  repo.findLatestEdition.mockResolvedValue(issue);
  repo.getStoredById.mockResolvedValue({ ...issue, title: 'STALE_PUBLIC_COPY' });
  repo.listAllStored.mockResolvedValue([issue]);
  repo.findArticle.mockResolvedValue({ _id: 'story-1', title: secret, excerpt: description, slug: 'mutable', pageNumber: 1, hotspot: snapshot.hotspot, releasedSnapshot: snapshot });
});
describe('publication metadata release eligibility', () => {
  it.each(['epaper', 'emagazine'] as const)('selects an older released %s before limiting instead of a future issue', async (publicationType) => {
    const released = { ...issue, publicationType, publishDate: new Date('2026-01-01'), publishedAt: new Date('2026-01-01') };
    const candidates = [{ ...released, title: 'Future issue', publishDate: new Date('2999-01-01') }, released];
    repo.findLatestEdition.mockImplementation(async (filter) => {
      const deadline = filter.$and?.[0].publishDate.$lte as Date | undefined;
      return candidates.find(row => !deadline || row.publishDate <= deadline) || null;
    });
    expect(await service.getEdition({ publicationType })).toMatchObject({ title: 'Public issue' });
    expect(repo.listAllStored).not.toHaveBeenCalled();
  });

  it('filters future publication timestamps before selecting the latest issue', async () => {
    const released = { ...issue, publishDate: new Date('2026-01-01'), publishedAt: new Date('2026-01-01') };
    const candidates = [{ ...released, title: 'Future release', publishDate: new Date('2026-01-02'), publishedAt: new Date('2999-01-01') }, released];
    repo.findLatestEdition.mockImplementation(async (filter) => {
      const deadline = filter.$and?.[1].$or[1].publishedAt.$lte as Date | undefined;
      return candidates.find(row => !deadline || row.publishedAt <= deadline) || null;
    });
    expect(await service.getEdition({ citySlug: 'indore' })).toMatchObject({ title: 'Public issue' });
  });

  it('preserves exact date identity when a future issue is not released and denies stale fallback', async () => {
    repo.findLatestEdition.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: id });
    expect(await service.getEdition({ citySlug: 'indore', publishDate: '2999-01-01' })).toBeNull();
    expect(repo.findLatestEdition.mock.calls[0][0].$and).toBeDefined();
    expect(repo.findLatestEdition.mock.calls[1][0]).toMatchObject({ citySlug: 'indore', publishDate: { $gte: new Date('2999-01-01') } });
    expect(repo.findLatestEdition.mock.calls[1][0].$and).toBeUndefined();
    expect(repo.listAllStored).not.toHaveBeenCalled();
  });
  it.each(['epaper', 'emagazine'] as const)('returns public Mongo %s', async (publicationType) => {
    repo.findEditionById.mockResolvedValue({ ...issue, publicationType });
    expect(await service.getEdition({ id, publicationType })).toMatchObject({ title: 'Public issue' });
    expect(repo.getStoredById).not.toHaveBeenCalled();
  });
  it('allows eligible legacy issue file fallback only when Mongo is unavailable', async () => {
    repo.isPublicMongoAvailable.mockResolvedValue(false);
    repo.getStoredById.mockResolvedValue({ ...issue, status: undefined });
    expect(await service.getEdition({ id })).toMatchObject({ title: 'Public issue' });
  });
  it.each([{ status: 'draft' }, { status: 'unreleased' }, { publishDate: '2999-01-01' }, { publishedAt: '2999-01-01' }, { isCurrentRevision: false }, { isPublished: false }])('rejects hidden/future file %j', async (hidden) => {
    repo.isPublicMongoAvailable.mockResolvedValue(false);
    repo.getStoredById.mockResolvedValue({ ...issue, ...hidden });
    expect(await service.getEdition({ id })).toBeNull();
  });
  it.each(['draft', 'unreleased', 'scheduled'])('never resurrects authoritative Mongo %s from a stale file', async (status) => {
    repo.findEditionById.mockResolvedValue({ ...issue, status });
    repo.findEdition.mockResolvedValue(null);
    expect(await service.getEdition({ id })).toBeNull();
    expect(repo.getStoredById).not.toHaveBeenCalled();
  });
  it('preserves existing legacy issue fallback for true Mongo absence', async () => {
    repo.findEditionById.mockResolvedValue(null);
    expect(await service.getEdition({ id })).toMatchObject({ title: 'STALE_PUBLIC_COPY' });
    expect(repo.getStoredById).toHaveBeenCalledWith(id);
  });
  it('rejects future Mongo issues', async () => {
    repo.findEditionById.mockResolvedValue({ ...issue, publishDate: '2999-01-01' });
    expect(await service.getEdition({ id })).toBeNull();
  });
  it('denies archive fallback when a hidden Mongo issue matches the same filters', async () => {
    repo.findLatestEdition.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: id });
    expect(await service.getEdition({ citySlug: 'indore', publishDate: '2026-01-01' })).toBeNull();
    expect(repo.listAllStored).not.toHaveBeenCalled();
  });
  it('retains eligible legacy archive fallback on true absence', async () => {
    repo.findLatestEdition.mockResolvedValue(null);
    expect(await service.getEdition({ publishDate: '2026-01-01' })).toMatchObject({ title: 'Public issue' });
  });
  it.each(['epaper', 'emagazine'] as const)('uses only the released %s snapshot', async (publicationType) => {
    expect(await service.getStory({ epaperId: id, storyToken: 'story-1', publicationType })).toMatchObject({ title: snapshot.title, excerpt: snapshot.excerpt });
  });
  it.each(['epaper', 'emagazine'] as const)('rejects mutable-only %s stories without falling back', async (publicationType) => {
    repo.findArticle.mockResolvedValue({ _id: 'story-1', title: secret, excerpt: description, hotspot: snapshot.hotspot, releasedSnapshot: null });
    const result = await service.getStory({ epaperId: id, storyToken: 'story-1', publicationType });
    expect(result).toBeNull();
    expect(repo.getStoredById).not.toHaveBeenCalled();
  });
  it('rejects mutable file hotspots without a released snapshot', async () => {
    repo.isPublicMongoAvailable.mockResolvedValue(false);
    repo.getStoredById.mockResolvedValue({ ...issue, articleHotspots: [{ id: 'story-1', title: secret, text: description }] });
    expect(await service.getStory({ epaperId: id, storyToken: `${id}-story-1` })).toBeNull();
  });
});
