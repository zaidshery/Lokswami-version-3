import type { EPaperArticleHotspot } from '@/lib/types/epaper';
import { isValidEpaperHotspot } from '@/lib/utils/epaperHotspotGeometry';

export interface ReleasedEpaperStory {
  title: string;
  slug: string;
  pageNumber: number;
  excerpt: string;
  contentHtml: string;
  coverImagePath: string;
  pageImagePath: string;
  audio?: { audioUrl: string; model: string; voice: string; mimeType: string; chunkCount: number };
  hotspot: EPaperArticleHotspot;
  version: number;
  releasedAt: string;
  releasedById: string;
  sourceUpdatedAt: string;
  legacy?: boolean;
}

export function makeReleasedEpaperStory(source: Record<string, unknown>, actorId: string, version: number): ReleasedEpaperStory {
  const title = String(source.title || '').trim();
  const contentHtml = String(source.contentHtml || '').trim();
  const excerpt = String(source.excerpt || '').trim();
  const hotspot = source.hotspot as EPaperArticleHotspot;
  const pageNumber = Number(source.pageNumber);
  if (!title || !String(source.slug || '').trim() || !Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(version) || version < 1 || !(contentHtml.replace(/<[^>]*>/g, '').trim() || excerpt) || !isValidEpaperHotspot(hotspot)) {
    throw new Error('A headline, readable text and a valid mapped area are required to release a story.');
  }
  return {
    title, slug: String(source.slug || ''), pageNumber,
    pageImagePath: String(source.pageImagePath || ''),
    contentHtml, excerpt, coverImagePath: String(source.coverImagePath || ''),
    hotspot: { ...hotspot }, version, releasedAt: new Date().toISOString(), releasedById: actorId,
    sourceUpdatedAt: new Date(String(source.updatedAt)).toISOString(),
  };
}

/** Never substitute mutable editorial fields for a missing released snapshot. */
export function resolveReleasedEpaperStory(source: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const snapshot = source?.releasedSnapshot as ReleasedEpaperStory | undefined;
  if (!source || !snapshot || !snapshot.title || !snapshot.slug || !isValidEpaperHotspot(snapshot.hotspot) || snapshot.version < 1) return null;
  return {
    _id: source._id, epaperId: source.epaperId,
    title: snapshot.title, slug: snapshot.slug, pageNumber: snapshot.pageNumber,
    contentHtml: snapshot.contentHtml, excerpt: snapshot.excerpt, coverImagePath: snapshot.coverImagePath,
    hotspot: snapshot.hotspot, releaseVersion: snapshot.version,
    pageImagePath: snapshot.pageImagePath, audio: snapshot.audio,
    createdAt: source.createdAt, updatedAt: snapshot.releasedAt,
  };
}
