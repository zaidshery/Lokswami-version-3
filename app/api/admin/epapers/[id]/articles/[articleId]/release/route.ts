import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canPublishEpaper } from '@/lib/auth/permissions';
import connectDB from '@/lib/db/mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import { makeReleasedEpaperStory } from '@/lib/content/epaperStoryPublication';
import { recordEpaperActivity } from '@/lib/server/epaperActivity';
import { revalidatePath } from 'next/cache';
import { buildEpaperStoryTtsText, findReadyManualTtsAsset } from '@/lib/server/ttsAssets';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; articleId: string }> }) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canPublishEpaper(actor.role)) return NextResponse.json({ error: 'Only admins can release reader stories.' }, { status: 403 });
  const { id, articleId } = await context.params;
  if (![id, articleId].every(Types.ObjectId.isValid)) return NextResponse.json({ error: 'Invalid publication or story ID.' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const expected = new Date(String(body.expectedUpdatedAt || ''));
  if (!Number.isFinite(expected.getTime())) return NextResponse.json({ error: 'Save and reload the story before releasing it.' }, { status: 400 });
  await connectDB();
  const [paper, story] = await Promise.all([
    EPaper.findOne({ _id: id, status: 'published', isCurrentRevision: { $ne: false } }).lean(),
    EPaperArticle.findOne({ _id: articleId, epaperId: id }).lean(),
  ]);
  if (!paper || !story) return NextResponse.json({ error: 'Published issue or story not found.' }, { status: 404 });
  if (story.releasedSnapshot?.sourceUpdatedAt === expected.toISOString()) {
    return NextResponse.json({ success: true, version: story.releasedSnapshot.version });
  }
  if (new Date(story.updatedAt).getTime() !== expected.getTime()) return NextResponse.json({ error: 'Story changed. Reload and review the latest saved version.' }, { status: 409 });
  const pageIndex = paper.pages.findIndex((entry) => entry.pageNumber === story.pageNumber);
  const page = pageIndex >= 0 ? paper.pages[pageIndex] : null;
  if (!page) {
    return NextResponse.json({ error: 'Page not found.' }, { status: 404 });
  }
  const now = new Date();
  if (page.reviewStatus !== 'ready' || !page.reviewedAt || new Date(page.reviewedAt).getTime() < expected.getTime()) {
    await EPaper.updateOne(
      { _id: id, 'pages.pageNumber': story.pageNumber },
      {
        $set: {
          'pages.$.reviewStatus': 'ready',
          'pages.$.reviewedAt': now,
          'pages.$.reviewedBy': {
            id: actor.id,
            name: actor.name || actor.email || 'Admin',
            email: actor.email || '',
            role: actor.role,
          },
        },
      }
    );
    page.reviewStatus = 'ready';
    page.reviewedAt = now;
  }
  let snapshot;
  try {
    snapshot = makeReleasedEpaperStory({ ...story, pageImagePath: page.imagePath } as unknown as Record<string, unknown>, actor.id, (story.releasedSnapshot?.version || 0) + 1);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid story.' }, { status: 400 });
  }
  const audio = await findReadyManualTtsAsset({ sourceType: 'epaperArticle', sourceId: articleId, variant: 'epaper_story', expectedText: buildEpaperStoryTtsText(story) });
  if (audio) snapshot.audio = { audioUrl: audio.audioUrl, model: audio.model, voice: audio.voice, mimeType: audio.mimeType, chunkCount: audio.chunkCount };
  const updated = await EPaperArticle.findOneAndUpdate(
    { _id: articleId, epaperId: id, updatedAt: expected },
    { $set: { releasedSnapshot: snapshot } }, { new: true, runValidators: true }
  );
  if (!updated) return NextResponse.json({ error: 'Story changed during release. Reload before retrying.' }, { status: 409 });
  await recordEpaperActivity({ epaperId: id, actor, action: 'story_released', message: 'Reviewed story released to the public reader.', metadata: { articleId, version: snapshot.version } });
  revalidatePath('/main/epaper');
  revalidatePath('/main/e-magazine');
  return NextResponse.json({ success: true, version: snapshot.version });
}
