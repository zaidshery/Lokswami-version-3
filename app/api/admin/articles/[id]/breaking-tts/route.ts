import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canEditContent, canViewPage } from '@/lib/auth/permissions';
import Article from '@/lib/models/Article';
import { resolveArticleWorkflow } from '@/lib/workflow/article';
import {
  ensureBreakingTtsForArticle,
  resolveReusableBreakingTts,
} from '@/lib/server/breakingTts';
import {
  getStoredArticleById,
  isArticleVersionConflictError,
  updateStoredArticle,
} from '@/lib/storage/articlesFile';
import { normalizeBreakingTtsMetadata } from '@/lib/types/breaking';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseExpectedVersion(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasPersistedVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function resolveArticleVersion(value: unknown) {
  return hasPersistedVersion(value) ? value : 1;
}

function buildVersionMatch(expectedVersion: number) {
  return expectedVersion === 1
    ? { $or: [{ version: 1 }, { version: { $exists: false } }] }
    : { version: expectedVersion };
}

function serializeDate(value: unknown) {
  return value instanceof Date
    ? value.toISOString()
    : typeof value === 'string'
      ? value
      : new Date().toISOString();
}

function breakingTtsMatches(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizeBreakingTtsMetadata(left)) ===
    JSON.stringify(normalizeBreakingTtsMetadata(right))
  );
}

function versionConflictResponse(currentVersion: number, updatedAt?: unknown) {
  return NextResponse.json(
    {
      success: false,
      code: 'ARTICLE_VERSION_CONFLICT',
      error: 'The article changed before breaking audio status could be refreshed.',
      currentVersion,
      updatedAt: updatedAt ? serializeDate(updatedAt) : null,
    },
    { status: 409 }
  );
}

async function shouldUseFileStore() {
  if (!process.env.MONGODB_URI) {
    return true;
  }

  try {
    await connectDB();
    return false;
  } catch (error) {
    console.error('MongoDB unavailable for breaking TTS route, using file store.', error);
    return true;
  }
}

async function POSTHandler(req: NextRequest, context: RouteContext) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!canViewPage(user.role, 'article_edit')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const forceRegenerate = req.nextUrl.searchParams.get('force') !== '0';
    const expectedVersion = parseExpectedVersion(
      req.nextUrl.searchParams.get('expectedVersion')
    );
    if (expectedVersion === null) {
      return NextResponse.json(
        { success: false, error: 'A valid expectedVersion is required.' },
        { status: 400 }
      );
    }

    if (await shouldUseFileStore()) {
      const article = await getStoredArticleById(id);
      if (!article) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }
      if (
        !canEditContent(user, {
          legacyAuthorName: article.author,
          workflow: resolveArticleWorkflow(article),
        })
      ) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        );
      }

      if (!article.isBreaking) {
        return NextResponse.json(
          { success: false, error: 'Only breaking articles can use breaking audio.' },
          { status: 400 }
        );
      }

      const currentVersion = resolveArticleVersion(article.version);
      if (expectedVersion !== currentVersion) {
        return versionConflictResponse(currentVersion, article.updatedAt);
      }

      const breakingTts = await ensureBreakingTtsForArticle(article, { forceRegenerate });
      if (!breakingTts) {
        return NextResponse.json(
          { success: false, error: 'Upload manual breaking audio before refreshing status.' },
          { status: 502 }
        );
      }

      if (breakingTtsMatches(article.breakingTts, breakingTts)) {
        return NextResponse.json({
          success: true,
          data: {
            ready: true,
            breakingTts,
            version: currentVersion,
            updatedAt: article.updatedAt,
          },
        });
      }

      let updated;
      try {
        updated = await updateStoredArticle(
          id,
          { breakingTts },
          { skipRevision: true, expectedVersion }
        );
      } catch (updateError) {
        if (isArticleVersionConflictError(updateError)) {
          return versionConflictResponse(updateError.currentVersion);
        }
        throw updateError;
      }

      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Article not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          ready: true,
          breakingTts: updated.breakingTts ?? breakingTts,
          version: updated.version,
          updatedAt: updated.updatedAt,
        },
      });
    }

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid article ID' },
        { status: 400 }
      );
    }

    const article = await Article.findById(id);
    if (!article) {
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }
    if (
      !canEditContent(user, {
        legacyAuthorName: article.author,
        workflow: resolveArticleWorkflow({
          workflow: article.workflow,
          updatedAt: article.updatedAt,
          publishedAt: article.publishedAt,
        }),
      })
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    if (!article.isBreaking) {
      return NextResponse.json(
        { success: false, error: 'Only breaking articles can use breaking audio.' },
        { status: 400 }
      );
    }

    const currentVersion = resolveArticleVersion(article.version);
    if (expectedVersion !== currentVersion) {
      return versionConflictResponse(currentVersion, article.updatedAt);
    }

    const breakingTts = await ensureBreakingTtsForArticle(article.toObject(), {
      forceRegenerate,
    });

    if (!breakingTts) {
      return NextResponse.json(
        { success: false, error: 'Upload manual breaking audio before refreshing status.' },
        { status: 502 }
      );
    }

    if (breakingTtsMatches(article.breakingTts, breakingTts)) {
      return NextResponse.json({
        success: true,
        data: {
          ready: true,
          breakingTts,
          version: currentVersion,
          updatedAt: serializeDate(article.updatedAt),
        },
      });
    }

    const storedBreakingTts = {
      ...breakingTts,
      generatedAt: new Date(breakingTts.generatedAt),
    };
    const updatedAt = new Date();
    const initializesLegacyVersion = !hasPersistedVersion(article.version);
    const updatedArticle = await Article.findOneAndUpdate(
      {
        _id: id,
        isBreaking: true,
        ...buildVersionMatch(expectedVersion),
      },
      {
        $set: {
          breakingTts: storedBreakingTts,
          updatedAt,
          ...(initializesLegacyVersion ? { version: currentVersion + 1 } : {}),
        },
        ...(!initializesLegacyVersion ? { $inc: { version: 1 } } : {}),
      },
      { new: true, runValidators: true }
    );

    if (!updatedArticle) {
      const latest = (await Article.findById(id)
        .select('version updatedAt')
        .lean()) as { version?: unknown; updatedAt?: unknown } | null;
      if (latest) {
        return versionConflictResponse(
          resolveArticleVersion(latest.version),
          latest.updatedAt
        );
      }
      return NextResponse.json(
        { success: false, error: 'Article not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ready: Boolean(resolveReusableBreakingTts(updatedArticle.toObject())),
        breakingTts,
        version: resolveArticleVersion(updatedArticle.version),
        updatedAt: serializeDate(updatedArticle.updatedAt || updatedAt),
      },
    });
  } catch (error) {
    console.error('Failed to refresh breaking TTS cache:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to refresh breaking audio status' },
      { status: 500 }
    );
  }
}

export const POST = withAdminMutation(POSTHandler);
