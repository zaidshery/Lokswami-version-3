import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import {
  buildArticleAssistResult,
  type ArticleAssistInput,
} from '@/lib/utils/articleAssistant';

function normalizeAssistInput(body: unknown): ArticleAssistInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be an object');
  }

  const source = body as Record<string, unknown>;
  const seo = source.seo && typeof source.seo === 'object' && !Array.isArray(source.seo)
    ? (source.seo as Record<string, unknown>)
    : {};

  return {
    mode: source.mode === 'edit' ? 'edit' : 'create',
    title: typeof source.title === 'string' ? source.title : '',
    summary: typeof source.summary === 'string' ? source.summary : '',
    content: typeof source.content === 'string' ? source.content : '',
    category: typeof source.category === 'string' ? source.category : '',
    author: typeof source.author === 'string' ? source.author : '',
    image: typeof source.image === 'string' && source.image.trim() ? 'featured-image-ready' : '',
    seoSlug: typeof source.seoSlug === 'string' ? source.seoSlug : '',
    seo,
    isBreaking: Boolean(source.isBreaking),
    isTrending: Boolean(source.isTrending),
    language: source.language === 'en' ? 'en' : 'hi',
    breakingAudioReady: Boolean(source.breakingAudioReady),
    requireBreakingAudio: Boolean(source.requireBreakingAudio),
    listenAudioReady: Boolean(source.listenAudioReady),
    sourceInfo: typeof source.sourceInfo === 'string' ? source.sourceInfo : '',
    sourceStoryId: typeof source.sourceStoryId === 'string' ? source.sourceStoryId : '',
    locationTag: typeof source.locationTag === 'string' ? source.locationTag : '',
    editorial:
      source.editorial && typeof source.editorial === 'object' && !Array.isArray(source.editorial)
        ? source.editorial
        : undefined,
    relatedArticles: Array.isArray(source.relatedArticles)
      ? source.relatedArticles
          .map((item) => {
            const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
            return {
              title: typeof record.title === 'string' ? record.title.trim() : '',
              slug: typeof record.slug === 'string' ? record.slug.trim() : '',
            };
          })
          .filter((item) => item.title)
          .slice(0, 50)
      : [],
  };
}

async function POSTHandler(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!canViewPage(user.role, 'articles')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    const input = normalizeAssistInput(body);
    const result = buildArticleAssistResult(input);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Article assist failed';
    return NextResponse.json(
      { success: false, error: message },
      { status: message.includes('Request body') ? 400 : 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
