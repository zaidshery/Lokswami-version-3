import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import { getAdminSession } from '@/lib/auth/admin';
import { canEditEpaper, canViewPage } from '@/lib/auth/permissions';
import {
  buildEpaperActivityMessage,
  recordEpaperActivity,
} from '@/lib/server/epaperActivity';
import { applyEpaperWorkflowAutomation } from '@/lib/server/epaperWorkflowAutomation';
import { assertEpaperDraftEditable } from '@/lib/server/epaperWorkflowPolicy';
import {
  buildEpaperPlaceholderTitle,
  normalizeHotspot,
  resolveUniqueSlug,
  validateHotspot,
} from '@/lib/utils/epaperArticles';
import { isAllowedAssetPath } from '@/lib/utils/epaperStorage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parsePageNumber(value: string | null) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return Math.floor(parsed);
}

function asObject(value: unknown) {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function toIsoDate(value: unknown) {
  const parsed =
    value instanceof Date ? value : value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function mapArticle(article: unknown) {
  const source = asObject(article);
  const hotspot = asObject(source.hotspot);
  const workflow = asObject(source.workflow);
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
    workflow:
      Object.keys(workflow).length > 0
        ? {
            status: typeof workflow.status === 'string' ? workflow.status : 'draft',
            priority: typeof workflow.priority === 'string' ? workflow.priority : 'normal',
            createdBy:
              typeof workflow.createdBy === 'object' && workflow.createdBy
                ? {
                    id: String((workflow.createdBy as { id?: unknown }).id || ''),
                    name: String((workflow.createdBy as { name?: unknown }).name || ''),
                    email: String((workflow.createdBy as { email?: unknown }).email || ''),
                    role: String((workflow.createdBy as { role?: unknown }).role || ''),
                  }
                : null,
            assignedTo:
              typeof workflow.assignedTo === 'object' && workflow.assignedTo
                ? {
                    id: String((workflow.assignedTo as { id?: unknown }).id || ''),
                    name: String((workflow.assignedTo as { name?: unknown }).name || ''),
                    email: String((workflow.assignedTo as { email?: unknown }).email || ''),
                    role: String((workflow.assignedTo as { role?: unknown }).role || ''),
                  }
                : null,
            reviewedBy:
              typeof workflow.reviewedBy === 'object' && workflow.reviewedBy
                ? {
                    id: String((workflow.reviewedBy as { id?: unknown }).id || ''),
                    name: String((workflow.reviewedBy as { name?: unknown }).name || ''),
                    email: String((workflow.reviewedBy as { email?: unknown }).email || ''),
                    role: String((workflow.reviewedBy as { role?: unknown }).role || ''),
                  }
                : null,
            submittedAt: toIsoDate(workflow.submittedAt),
            approvedAt: toIsoDate(workflow.approvedAt),
            rejectedAt: toIsoDate(workflow.rejectedAt),
            publishedAt: toIsoDate(workflow.publishedAt),
            scheduledFor: toIsoDate(workflow.scheduledFor),
            dueAt: toIsoDate(workflow.dueAt),
            rejectionReason:
              typeof workflow.rejectionReason === 'string'
                ? workflow.rejectionReason
                : '',
            comments: Array.isArray(workflow.comments)
              ? workflow.comments.map((comment) => {
                  const normalized = asObject(comment);
                  const author = asObject(normalized.author);
                  return {
                    id: String(normalized.id || ''),
                    body: String(normalized.body || ''),
                    kind: String(normalized.kind || 'comment'),
                    author: {
                      id: String(author.id || ''),
                      name: String(author.name || ''),
                      email: String(author.email || ''),
                      role: String(author.role || ''),
                    },
                    createdAt: toIsoDate(normalized.createdAt) || new Date(0).toISOString(),
                  };
                })
              : [],
          }
        : undefined,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function isLikelyHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (!canViewPage(admin.role, 'epapers')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid e-paper ID' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const pageNumber = parsePageNumber(searchParams.get('pageNumber'));
    const query: Record<string, unknown> = { epaperId: id };
    if (pageNumber) query.pageNumber = pageNumber;

    const records = await EPaperArticle.find(query)
      .sort({ pageNumber: 1, createdAt: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: records.map(mapArticle),
    });
  } catch (error) {
    console.error('Failed to list e-paper articles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list articles' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (!canEditEpaper(admin.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await connectDB();
    const { id } = await context.params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid e-paper ID' },
        { status: 400 }
      );
    }

    const epaper = await EPaper.findById(id)
      .select('_id pageCount pages title cityName publishDate status productionStatus')
      .lean();
    if (!epaper) {
      return NextResponse.json(
        { success: false, error: 'E-paper not found' },
        { status: 404 }
      );
    }
    try {
      assertEpaperDraftEditable(epaper);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Edition is immutable.',
        },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const source = typeof body === 'object' && body ? (body as Record<string, unknown>) : {};

    const pageNumber = parsePageNumber(
      source.pageNumber !== undefined ? String(source.pageNumber) : null
    );
    const requestedTitle =
      typeof source.title === 'string' ? source.title.trim() : '';
    const slugInput = typeof source.slug === 'string' ? source.slug.trim() : '';
    const excerpt = typeof source.excerpt === 'string' ? source.excerpt.trim() : '';
    const contentHtml =
      typeof source.contentHtml === 'string' ? source.contentHtml.trim() : '';
    const coverImagePath =
      typeof source.coverImagePath === 'string' ? source.coverImagePath.trim() : '';
    const hotspot = normalizeHotspot(source.hotspot);

    if (!pageNumber) {
      return NextResponse.json(
        { success: false, error: 'pageNumber is required' },
        { status: 400 }
      );
    }
    if (pageNumber > Number(epaper.pageCount || 0)) {
      return NextResponse.json(
        { success: false, error: `pageNumber must be between 1 and ${epaper.pageCount}` },
        { status: 400 }
      );
    }
    if (requestedTitle.length > 220) {
      return NextResponse.json(
        { success: false, error: 'title is too long (max 220 chars)' },
        { status: 400 }
      );
    }
    if (excerpt.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'excerpt is too long (max 1000 chars)' },
        { status: 400 }
      );
    }
    if (coverImagePath) {
      const validCoverPath =
        coverImagePath.startsWith('/') ? isAllowedAssetPath(coverImagePath) : isLikelyHttpUrl(coverImagePath);
      if (!validCoverPath) {
        return NextResponse.json(
          {
            success: false,
            error: 'coverImagePath must be a valid legacy upload path or an http(s) URL',
          },
          { status: 400 }
        );
      }
    }

    const hotspotError = validateHotspot(hotspot);
    if (hotspotError) {
      return NextResponse.json(
        { success: false, error: hotspotError },
        { status: 400 }
      );
    }

    const existingPageStoryCount = requestedTitle
      ? 0
      : await EPaperArticle.countDocuments({ epaperId: id, pageNumber });
    const title =
      requestedTitle ||
      buildEpaperPlaceholderTitle(pageNumber, existingPageStoryCount + 1);

    const slug = await resolveUniqueSlug(slugInput || title, async (candidate) => {
      const existing = await EPaperArticle.exists({ epaperId: id, slug: candidate });
      return Boolean(existing);
    });

    const pageRecord = (epaper.pages || []).find((p) => Number(p.pageNumber || 0) === pageNumber);
    const pageImagePath = pageRecord?.imagePath || '';

    const releasedSnapshot = {
      title,
      slug,
      pageNumber,
      excerpt,
      contentHtml,
      coverImagePath,
      pageImagePath,
      hotspot: { ...hotspot },
      version: 1,
      releasedAt: new Date().toISOString(),
      releasedById: admin.id,
      sourceUpdatedAt: new Date().toISOString(),
    };

    const created = await EPaperArticle.create({
      epaperId: id,
      pageNumber,
      title,
      slug,
      excerpt,
      contentHtml,
      coverImagePath,
      hotspot,
      releasedSnapshot,
      workflow: {
        status: 'published',
        publishedAt: new Date(),
        reviewedBy: {
          id: admin.id,
          name: admin.name || admin.email || 'Admin',
          email: admin.email || '',
          role: admin.role,
        },
      },
    });

    await recordEpaperActivity({
      epaperId: id,
      actor: admin,
      action: 'story_created',
      message: buildEpaperActivityMessage({ action: 'story_created' }),
      metadata: {
        articleId: String(created._id || ''),
        pageNumber,
        title,
      },
    });

    const pages = (epaper.pages || []).map((page) =>
      Number(page.pageNumber || 0) === pageNumber
        ? {
            ...page,
            reviewStatus: 'ready',
            reviewedAt: new Date(),
            reviewedBy: admin.id,
          }
        : page
    );
    await EPaper.findByIdAndUpdate(id, { pages });

    await applyEpaperWorkflowAutomation({
      epaperId: id,
      actor: admin,
      reason: 'A mapped e-paper story was created.',
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Article created successfully',
        data: mapArticle(created.toObject()),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create e-paper article:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create article' },
      { status: 500 }
    );
  }
}
