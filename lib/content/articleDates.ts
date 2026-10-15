/** Normalize persisted timestamps without inventing a publication/render time. */
export function normalizeArticleDate(value: unknown, fallback?: unknown): string {
  for (const candidate of [value, fallback]) {
    if (!(candidate instanceof Date) && typeof candidate !== 'string' && typeof candidate !== 'number') continue;
    if (typeof candidate === 'string' && !candidate.trim()) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return '';
}
