import { describe, expect, it } from 'vitest';
import { selectHomepageSections } from '@/lib/content/homepageSections';

const article = (id: string, day = 1, views = 0, isTrending = false) => ({
  id, publishedAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`, views, isTrending,
});
const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('homepage section selection from eligible public articles', () => {
  it('selects newest Lead deterministically with descending ID ties and does not mutate input', () => {
    const input = [article('a', 2), article('z', 2), article('new', 3)];
    expect(selectHomepageSections(input).lead?.id).toBe('new');
    expect(selectHomepageSections(input.slice(0, 2).reverse()).lead?.id).toBe('z');
    expect(ids(input)).toEqual(['a', 'z', 'new']);
  });
  it('excludes Lead from Latest and Lead/Latest from Popular with enough alternatives', () => {
    const result = selectHomepageSections(Array.from({ length: 9 }, (_, i) => article(String(i), i + 1)));
    expect(ids(result.latest)).toEqual(['7', '6', '5', '4']);
    expect(ids(result.popular)).toEqual(['3', '2', '1', '0']);
    expect(new Set([result.lead!.id, ...ids(result.latest), ...ids(result.popular)]).size).toBe(9);
  });
  it('prioritizes effective Trending then views, recency and stable ID', () => {
    const input = [article('lead', 28), ...Array.from({ length: 4 }, (_, i) => article(`latest${i}`, 20 + i)),
      article('trend', 1, 0, true), article('views', 1, 100), article('z', 3, 10), article('a', 3, 10)];
    expect(ids(selectHomepageSections(input).popular)).toEqual(['trend', 'views', 'z', 'a']);
    expect(selectHomepageSections(input.reverse())).toEqual(selectHomepageSections([...input].reverse()));
  });
  it('backfills sparse rails with real content without duplicate IDs inside a rail', () => {
    const input = [article('a'), article('a'), article('b', 2)];
    const result = selectHomepageSections(input);
    expect(ids(result.latest)).toEqual(['a', 'b']);
    expect(ids(result.popular)).toEqual(['b', 'a']);
    expect(result.popular.every((item) => input.includes(item))).toBe(true);
    expect(result.popular.every((item) => !item.isTrending)).toBe(true);
  });
  it('handles empty and singleton content without fabrication', () => {
    expect(selectHomepageSections([])).toEqual({ lead: null, latest: [], popular: [] });
    const item = article('only');
    expect(selectHomepageSections([item])).toEqual({ lead: item, latest: [item], popular: [item] });
  });
});
