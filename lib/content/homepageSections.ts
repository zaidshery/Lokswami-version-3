/** Input must come from the publication-filtered public article services.
 * isTrending is the effective flag after editorial expiry has been resolved.
 */
export type HomepageArticle = {
  id: string;
  publishedAt: string;
  views: number;
  isTrending?: boolean;
};

function timestamp(article: HomepageArticle) {
  const value = Date.parse(article.publishedAt);
  return Number.isFinite(value) ? value : 0;
}

export function compareHomepageRecency(a: HomepageArticle, b: HomepageArticle) {
  return timestamp(b) - timestamp(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

function boundedRail<T extends HomepageArticle>(ranked: T[], excluded: Set<string>, limit: number) {
  // Prefer distinct stories; only backfill overlaps when content is sparse.
  return [...ranked.filter((item) => !excluded.has(item.id)),
    ...ranked.filter((item) => excluded.has(item.id))].slice(0, limit);
}

export function selectHomepageSections<T extends HomepageArticle>(articles: readonly T[]) {
  const ranked = [...articles].filter((article) => article.id).sort(compareHomepageRecency);
  const unique = ranked.filter((article, index) =>
    ranked.findIndex((candidate) => candidate.id === article.id) === index);
  const lead = unique[0] ?? null;
  const latest = boundedRail(unique, new Set(lead ? [lead.id] : []), 4);
  const popularRanked = [...unique].sort((a, b) =>
    Number(Boolean(b.isTrending)) - Number(Boolean(a.isTrending)) ||
    (b.views || 0) - (a.views || 0) || compareHomepageRecency(a, b));
  const popular = boundedRail(popularRanked,
    new Set([...(lead ? [lead.id] : []), ...latest.map((article) => article.id)]), 4);
  return { lead, latest, popular };
}
