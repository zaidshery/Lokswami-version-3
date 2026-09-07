import {
  getPublicEpaperForMetadata,
  getPublicEpaperStoryForMetadata,
} from '@/lib/server/publicEpaperMetadata';
import { socialPreviewHeaders } from '@/lib/server/socialPreviewImage';
import { loadTrustedEpaperImage, renderBrandedEpaperImage } from '@/lib/server/epaperShareImage';
import { normalizeEPaperPublicationType } from '@/lib/types/epaper';
import { formatUiDate } from '@/lib/utils/dateFormat';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paper = url.searchParams.get('paper') || '';
  const city = url.searchParams.get('city') || '';
  const date = url.searchParams.get('date') || '';
  const storyToken = url.searchParams.get('story') || '';
  const publicationType = normalizeEPaperPublicationType(url.searchParams.get('publicationType'));
  const issue = await getPublicEpaperForMetadata({
    id: paper,
    citySlug: city,
    publishDate: date,
    publicationType,
  });
  const story =
    storyToken && (issue?.id || paper)
      ? await getPublicEpaperStoryForMetadata({
          epaperId: issue?.id || paper,
          storyToken,
          publicationType,
        })
      : null;
  if (!issue || (storyToken && !story)) return new Response('Released publication not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const cityLabel = publicationType === 'emagazine' ? 'E-Magazine' : `${issue.cityName} E-Paper`;
  const dateLabel = issue?.publishDate
    ? formatUiDate(issue.publishDate, issue.publishDate)
    : date
      ? formatUiDate(date, date)
      : 'Latest edition';
  const requestedVersion = url.searchParams.get('v');
  if (story && requestedVersion && requestedVersion !== String(story.releaseVersion)) return new Response('Story version changed', { status: 409, headers: { 'Cache-Control': 'no-store' } });
  try {
    const image = await loadTrustedEpaperImage(story?.pageImagePath || issue.thumbnailPath);
    const output = await renderBrandedEpaperImage({ image, hotspot: story?.hotspot, preview: true, label: `${cityLabel} | ${publicationType === 'emagazine' ? issue.publishDate.slice(0, 7) : dateLabel}${story ? ` | Page ${story.pageNumber}` : ''}` });
    return new Response(Uint8Array.from(output), { headers: socialPreviewHeaders() });
  } catch {
    return new Response('Preview temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
