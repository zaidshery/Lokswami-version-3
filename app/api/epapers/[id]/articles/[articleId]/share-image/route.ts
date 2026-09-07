import { NextRequest, NextResponse } from 'next/server';
import { getPublicEpaperForMetadata, getPublicEpaperStoryForMetadata } from '@/lib/server/publicEpaperMetadata';
import { loadTrustedEpaperImage, renderBrandedEpaperImage } from '@/lib/server/epaperShareImage';
import { normalizeEPaperPublicationType } from '@/lib/types/epaper';

export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; articleId: string }> }) {
  const { id, articleId } = await context.params;
  const publicationType = normalizeEPaperPublicationType(request.nextUrl.searchParams.get('publicationType'));
  const paper = await getPublicEpaperForMetadata({ id, publicationType });
  if (!paper) return NextResponse.json({ error: 'Publication not found.' }, { status: 404 });
  const story = await getPublicEpaperStoryForMetadata({ epaperId: paper.id, storyToken: articleId, publicationType });
  if (!story || !story.hotspot || !story.pageImagePath) return NextResponse.json({ error: 'Released clipping is unavailable.' }, { status: 404 });
  const requestedVersion = request.nextUrl.searchParams.get('v');
  if (requestedVersion && requestedVersion !== String(story.releaseVersion)) return NextResponse.json({ error: 'Story was updated. Reopen it to share the latest version.' }, { status: 409 });
  try {
    const image = await loadTrustedEpaperImage(story.pageImagePath);
    const output = await renderBrandedEpaperImage({ image, hotspot: story.hotspot, label: `${publicationType === 'emagazine' ? 'E-Magazine' : `${paper.cityName} E-Paper`} | ${publicationType === 'emagazine' ? paper.publishDate.slice(0, 7) : paper.publishDate} | Page ${story.pageNumber}` });
    return new Response(Uint8Array.from(output), { headers: {
      'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=60, s-maxage=300',
      'Content-Disposition': `${request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="lokswami-page-${story.pageNumber}.png"`,
    } });
  } catch {
    return NextResponse.json({ error: 'Clipping preparation failed. Please retry.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
