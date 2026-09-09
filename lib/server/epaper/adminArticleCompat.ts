import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import { canEditEpaper } from '@/lib/auth/permissions';
import { applyEpaperWorkflowAutomation } from '@/lib/server/epaperWorkflowAutomation';
import {
  assertEpaperDraftEditable,
  invalidateEpaperQa,
} from '@/lib/server/epaperWorkflowPolicy';
import {
  normalizeHotspot,
  resolveUniqueSlug,
  validateHotspot,
} from '@/lib/utils/epaperArticles';
import { isAllowedAssetPath } from '@/lib/utils/epaperStorage';
import type { AdminSessionIdentity } from '@/lib/auth/admin';

export function isEpaperKind(req: NextRequest): boolean {
  const kind = req.nextUrl.searchParams.get('kind');
  return kind === 'epaper';
}

function parsePositiveInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.floor(parsed);
}

function isValidAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function mapEpaperArticle(article: unknown) {
  const source = typeof article === 'object' && article ? (article as Record<string, unknown>) : {};
  const hotspot =
    typeof source.hotspot === 'object' && source.hotspot
      ? (source.hotspot as Record<string, unknown>)
      : {};

  return {
    _id: String(source._id || ''),
    epaperId: String(source.epaperId || ''),
    pageNumber: Number(source.pageNumber || 1),
    title: String(source.title || ''),
    slug: String(source.slug || ''),
    excerpt: String(source.excerpt || ''),
    contentHtml: String(source.contentHtml || ''),
    coverImagePath: String(source.coverImagePath || ''),
    hotspot: {
      x: Number(hotspot.x || 0),
      y: Number(hotspot.y || 0),
      w: Number(hotspot.w || 0),
      h: Number(hotspot.h || 0),
    },
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export async function findEpaperArticle(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return EPaperArticle.findById(id).lean();
}

function normalizeEpaperArticleInput(body: unknown) {
  const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};
  return {
    title: typeof source.title === 'string' ? source.title.trim() : '',
    slug: typeof source.slug === 'string' ? source.slug.trim() : '',
    excerpt: typeof source.excerpt === 'string' ? source.excerpt.trim() : '',
    contentHtml: typeof source.contentHtml === 'string' ? source.contentHtml.trim() : '',
    coverImagePath:
      typeof source.coverImagePath === 'string' ? source.coverImagePath.trim() : '',
    pageNumber:
      source.pageNumber !== undefined ? parsePositiveInt(source.pageNumber) : 0,
    hotspot: source.hotspot !== undefined ? normalizeHotspot(source.hotspot) : null,
  };
}

function validateEpaperArticleInput(
  input: ReturnType<typeof normalizeEpaperArticleInput>,
  isPut: boolean
) {
  if (isPut && !input.title) {
    return 'title is required';
  }
  if (input.title && input.title.length > 220) {
    return 'title is too long (max 220 chars)';
  }
  if (input.excerpt.length > 1000) {
    return 'excerpt is too long (max 1000 chars)';
  }
  if (input.pageNumber < 0) {
    return 'pageNumber must be positive';
  }
  if (input.hotspot) {
    const hotspotError = validateHotspot(input.hotspot);
    if (hotspotError) return hotspotError;
  } else if (isPut) {
    return 'hotspot is required';
  }

  if (input.coverImagePath) {
    const validCoverImage =
      input.coverImagePath.startsWith('/')
        ? isAllowedAssetPath(input.coverImagePath)
        : isValidAbsoluteHttpUrl(input.coverImagePath);
    if (!validCoverImage) {
      return 'coverImagePath must be a valid /uploads path or absolute URL';
    }
  }

  return null;
}

export async function getEpaperArticleDetail(id: string, actor: Pick<AdminSessionIdentity, 'role'>) {
  if (!canEditEpaper(actor.role)) {
    return {
      status: 403,
      payload: { success: false, error: 'Forbidden' },
    };
  }

  await connectDB();
  const epaperArticle = await findEpaperArticle(id);
  if (!epaperArticle) {
    return {
      status: 404,
      payload: { success: false, error: 'Article not found' },
    };
  }

  return {
    status: 200,
    payload: { success: true, data: mapEpaperArticle(epaperArticle) },
  };
}

export async function updateEpaperArticleById(
  id: string,
  body: unknown,
  isPut: boolean,
  actor?: AdminSessionIdentity
) {
  if (!Types.ObjectId.isValid(id)) {
    return {
      ok: false as const,
      status: 400,
      payload: { success: false, error: 'Invalid article ID' },
    };
  }

  await connectDB();
  const current = await EPaperArticle.findById(id).lean();
  if (!current) {
    return {
      ok: false as const,
      status: 404,
      payload: { success: false, error: 'Article not found' },
    };
  }

  const parentEpaper = await EPaper.findById(current.epaperId)
    .select('_id status productionStatus pageCount pages')
    .lean();
  if (!parentEpaper) {
    return {
      ok: false as const,
      status: 404,
      payload: { success: false, error: 'E-paper not found' },
    };
  }

  try {
    assertEpaperDraftEditable(parentEpaper);
  } catch (error) {
    return {
      ok: false as const,
      status: 409,
      payload: {
        success: false,
        error: error instanceof Error ? error.message : 'Edition is immutable.',
      },
    };
  }

  const input = normalizeEpaperArticleInput(body);
  const validationError = validateEpaperArticleInput(input, isPut);
  if (validationError) {
    return {
      ok: false as const,
      status: 400,
      payload: { success: false, error: validationError },
    };
  }

  const updates: Record<string, unknown> = {};

  if (input.title) updates.title = input.title;
  if (input.excerpt || input.excerpt === '') updates.excerpt = input.excerpt;
  if (input.contentHtml || input.contentHtml === '') updates.contentHtml = input.contentHtml;
  if (input.coverImagePath || input.coverImagePath === '') updates.coverImagePath = input.coverImagePath;
  if (input.pageNumber > 0) updates.pageNumber = input.pageNumber;
  if (input.hotspot) updates.hotspot = input.hotspot;

  const nextTitle = input.title || current.title;
  const shouldRecomputeSlug = Boolean(input.slug || input.title);
  if (shouldRecomputeSlug) {
    const nextSlug = await resolveUniqueSlug(input.slug || nextTitle, async (candidate) => {
      const existing = await EPaperArticle.findOne({
        _id: { $ne: id },
        epaperId: current.epaperId,
        slug: candidate,
      })
        .select('_id')
        .lean();
      return Boolean(existing);
    });
    updates.slug = nextSlug;
  }

  if (updates.pageNumber !== undefined) {
    const pageCount = Number(parentEpaper.pageCount || 0);
    const pageNumber = Number(updates.pageNumber || 0);
    if (pageCount > 0 && pageNumber > pageCount) {
      return {
        ok: false as const,
        status: 400,
        payload: {
          success: false,
          error: `pageNumber must be between 1 and ${pageCount}`,
        },
      };
    }
  }

  // GAP-008: Editorial story saves must NOT mutate the public releasedSnapshot.
  // Draft edits remain private until the explicit release workflow is triggered.

  const updated = await EPaperArticle.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).lean();

  if (!updated) {
    return {
      ok: false as const,
      status: 404,
      payload: { success: false, error: 'Article not found' },
    };
  }

  if (actor) {
    const changedPages = Array.from(
      new Set([Number(current.pageNumber || 0), Number(updated.pageNumber || 0)])
    ).filter(Boolean);
    const nextPages = (parentEpaper.pages || []).map((page) =>
      changedPages.includes(Number(page.pageNumber || 0))
        ? {
            ...page,
            reviewStatus: 'ready',
            reviewedAt: new Date(),
            reviewedBy: actor.id,
          }
        : page
    );
    await EPaper.findByIdAndUpdate(updated.epaperId, { pages: nextPages });
    await invalidateEpaperQa({
      epaperId: String(updated.epaperId || ''),
      actor,
      reason: 'Mapped story content or hotspot changed.',
      pageNumbers: changedPages,
    });
    await applyEpaperWorkflowAutomation({
      epaperId: String(updated.epaperId || ''),
      actor,
      reason: 'A mapped e-paper story was updated.',
    });
  }

  return {
    ok: true as const,
    status: 200,
    payload: { success: true, data: mapEpaperArticle(updated) },
  };
}

export async function deleteEpaperArticleById(
  id: string,
  actor: AdminSessionIdentity
) {
  if (!canEditEpaper(actor.role)) {
    return {
      status: 403,
      payload: { success: false, error: 'Forbidden' },
    };
  }

  if (!Types.ObjectId.isValid(id)) {
    return {
      status: 400,
      payload: { success: false, error: 'Invalid article ID' },
    };
  }

  await connectDB();
  const existing = await EPaperArticle.findById(id).lean();
  if (!existing) {
    return {
      status: 404,
      payload: { success: false, error: 'Article not found' },
    };
  }

  const parent = await EPaper.findById(existing.epaperId)
    .select('_id status productionStatus pages')
    .lean();
  if (!parent) {
    return {
      status: 404,
      payload: { success: false, error: 'E-paper not found' },
    };
  }

  try {
    assertEpaperDraftEditable(parent);
  } catch (error) {
    return {
      status: 409,
      payload: {
        success: false,
        error: error instanceof Error ? error.message : 'Edition is immutable.',
      },
    };
  }

  const deleted = await EPaperArticle.findByIdAndDelete(id).lean();
  if (!deleted) {
    return {
      status: 404,
      payload: { success: false, error: 'Article not found' },
    };
  }

  const pageNumber = Number(existing.pageNumber || 0);
  const pages = (parent.pages || []).map((page) =>
    Number(page.pageNumber || 0) === pageNumber
      ? {
          ...page,
          reviewStatus: 'pending',
          reviewedAt: null,
          reviewedBy: null,
        }
      : page
  );
  await EPaper.findByIdAndUpdate(existing.epaperId, { pages });
  await invalidateEpaperQa({
    epaperId: String(existing.epaperId),
    actor,
    reason: 'A mapped story was deleted.',
    pageNumbers: [pageNumber],
  });

  return {
    status: 200,
    payload: {
      success: true,
      message: 'Article deleted successfully',
    },
  };
}
