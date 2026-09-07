export function buildSwipeReaderPath(slug?: string) {
  const normalizedSlug = String(slug || '').trim();
  return normalizedSlug
    ? `/main/shorts/${encodeURIComponent(normalizedSlug)}`
    : '/main/videos';
}

export function buildVideoReaderPath(videoId?: string, swipeSlug?: string) {
  const normalizedSlug = String(swipeSlug || '').trim();
  if (normalizedSlug) return buildSwipeReaderPath(normalizedSlug);
  const normalizedId = String(videoId || '').trim();
  if (!normalizedId) return '/main/videos';

  return `/main/videos?video=${encodeURIComponent(normalizedId)}`;
}
