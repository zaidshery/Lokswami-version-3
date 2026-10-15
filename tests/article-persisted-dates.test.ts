import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { PublicArticleService } from '@/lib/server/content/publicArticleService';
import type { ArticleRepository } from '@/lib/server/content/articleRepository';
import { normalizeArticleDate } from '@/lib/content/articleDates';
import { buildNewsArticleJsonLd } from '@/lib/seo/articleSeo';

describe('persisted publication dates', () => {
  it.each(['mongo', 'file'] as const)('preserves publication and meaningful update timestamps from %s', async (source) => {
    const publication = '2026-10-02T06:00:00.000Z';
    const updated = '2026-10-02T07:00:00.000Z';
    const row = { _id: new Types.ObjectId(), slug: 'persisted-date-story', title: 'Published story',
      summary: 'Story summary', image: '/story.jpg', category: 'Regional', author: 'Desk',
      publishedAt: source === 'mongo' ? new Date(publication) : publication,
      updatedAt: source === 'mongo' ? new Date(publication) : publication,
      workflow: { status: 'published' }, seo: {} };
    const repo = { resolveSource: vi.fn(async () => source),
      getMongoResolutionCandidates: vi.fn(async () => [row]),
      listStoredResolutionRecords: vi.fn(async () => [row]) } as unknown as ArticleRepository;
    const service = new PublicArticleService(repo);
    const schema = async (title: string) => {
      row.title = title;
      const resolution = await service.resolvePublicArticleToken(row.slug);
      if (!('article' in resolution)) throw new Error('Published article missing');
      return buildNewsArticleJsonLd({ ...resolution.article, siteUrl: 'https://phase312-cms-qa.example.test' });
    };
    const first = await schema('Published English story');
    expect(first).toMatchObject({ datePublished: publication, dateModified: publication, inLanguage: 'en-IN' });
    row.updatedAt = source === 'mongo' ? new Date(updated) : updated;
    const second = await schema('मध्य प्रदेश में नई खबर और विकास की जानकारी');
    expect(second).toMatchObject({ datePublished: publication, dateModified: updated, inLanguage: 'hi-IN' });
  });

  it('uses valid persisted fallbacks and never invents a missing historical timestamp', () => {
    expect(normalizeArticleDate(new Date('invalid'), '2026-10-02T06:00:00Z')).toBe('2026-10-02T06:00:00.000Z');
    expect(normalizeArticleDate(undefined)).toBe('');
    expect(normalizeArticleDate('', 'invalid')).toBe('');
  });
});
