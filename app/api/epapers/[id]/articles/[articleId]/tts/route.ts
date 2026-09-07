import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import { resolveReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import type { ReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import {
  buildEpaperStoryTtsText,
} from '@/lib/server/ttsAssets';
import { getStoredEPaperById } from '@/lib/storage/epapersFile';

type RouteContext = {
  params: Promise<{ id: string; articleId: string }>;
};

type EpaperStoryListenSource = {
  paperId: string;
  storyId: string;
  paperTitle: string;
  cityName: string;
  publishDate: string;
  pageNumber: number;
  title: string;
  excerpt: string;
  contentHtml: string;
  audio?: ReleasedEpaperStory['audio'];
};

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) {
    return true;
  }

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for e-paper TTS route, using file store.', error);
    return true;
  }
}

function mapStoredStory(
  paper: NonNullable<Awaited<ReturnType<typeof getStoredEPaperById>>>,
  articleId: string
) {
  const hotspots = Array.isArray(paper.articleHotspots) ? paper.articleHotspots : [];

  for (let index = 0; index < hotspots.length; index += 1) {
    const hotspot = hotspots[index];
    const derivedId = `${paper._id}-${String(hotspot.id || index + 1)}`;
    if (derivedId !== articleId) continue;

    return {
      paperId: String(paper._id),
      storyId: derivedId,
      paperTitle: String(paper.title || '').trim(),
      cityName: String(paper.city || '').trim(),
      publishDate: String(paper.publishDate || '').trim(),
      pageNumber: Math.max(1, Number(hotspot.page || 1)),
      title: String(hotspot.title || '').trim() || `Story ${index + 1}`,
      excerpt: String(hotspot.text || '').trim(),
      contentHtml: '',
    } satisfies EpaperStoryListenSource;
  }

  return null;
}

async function loadEpaperStoryForListen(params: {
  paperId: string;
  articleId: string;
  useFileStore: boolean;
}): Promise<EpaperStoryListenSource | null> {
  if (params.useFileStore) {
    const stored = await getStoredEPaperById(params.paperId);
    if (!stored) return null;
    return mapStoredStory(stored, params.articleId);
  }

  if (!Types.ObjectId.isValid(params.paperId) || !Types.ObjectId.isValid(params.articleId)) {
    return null;
  }

  const epaper = await EPaper.findById(params.paperId)
    .select('_id title cityName publishDate status isCurrentRevision');
  if (!epaper || epaper.status !== 'published' || epaper.isCurrentRevision === false) {
    return null;
  }

  const record = await EPaperArticle.findOne({
    _id: params.articleId,
    epaperId: params.paperId,
  }).select('_id epaperId releasedSnapshot').lean();
  const story = resolveReleasedEpaperStory(record as unknown as Record<string, unknown> | null);

  if (!story) {
    return null;
  }

  return {
    paperId: String(epaper._id),
    storyId: String(story._id),
    paperTitle: String(epaper.title || '').trim(),
    cityName: String(epaper.cityName || '').trim(),
    publishDate:
      epaper.publishDate instanceof Date
        ? epaper.publishDate.toISOString()
        : String(epaper.publishDate || '').trim(),
    pageNumber: Math.max(1, Number(story.pageNumber || 1)),
    title: String(story.title || '').trim(),
    excerpt: String(story.excerpt || '').trim(),
    contentHtml: String(story.contentHtml || '').trim(),
    audio: story.audio as ReleasedEpaperStory['audio'],
  } satisfies EpaperStoryListenSource;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { id, articleId } = await context.params;
    const paperId = id.trim();
    const storyId = articleId.trim();

    if (!paperId || !storyId) {
      return NextResponse.json(
        { success: false, error: 'Invalid e-paper story ID' },
        { status: 400 }
      );
    }

    const useFileStore = await shouldUseFileStore();
    const story = await loadEpaperStoryForListen({
      paperId,
      articleId: storyId,
      useFileStore,
    });

    if (!story) {
      return NextResponse.json(
        { success: false, error: 'Story not found' },
        { status: 404 }
      );
    }

    if (!useFileStore) {
      const manualAsset = story.audio;
      if (manualAsset?.audioUrl) {
        return NextResponse.json({
          success: true,
          data: {
            provider: 'manual',
            model: manualAsset.model,
            voice: manualAsset.voice,
            mimeType: manualAsset.mimeType,
            chunkCount: manualAsset.chunkCount,
            audioUrl: manualAsset.audioUrl,
          },
        });
      }
    }

    const sourceText = buildEpaperStoryTtsText({
      title: story.title,
      excerpt: story.excerpt,
      contentHtml: story.contentHtml,
    });

    if (!sourceText) {
      return NextResponse.json(
        { success: false, error: 'Readable text is not available for this story yet.' },
        { status: 400 }
      );
    }

    // No auto-synthesis available — manual audio upload required
    return NextResponse.json(
      {
        success: false,
        error: 'No manual audio has been uploaded for this story yet. Upload audio from the admin e-paper editor.',
      },
      { status: 404 }
    );
  } catch (error) {
    console.error('E-paper story TTS route failed:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Failed to load e-paper story audio.',
      },
      { status: 500 }
    );
  }
}
