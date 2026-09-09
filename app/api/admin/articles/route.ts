import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { EditorialService } from '@/lib/server/content/editorialService';
import {
  EditorialForbiddenError,
  EditorialValidationError,
} from '@/lib/server/content/newsroomArticleTypes';

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseListLimit(value: string | null, fallback: number): number | null {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'all') return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const scope = searchParams.get('scope');
    const workflowStatus = searchParams.get('workflowStatus');
    const assignedTo = searchParams.get('assignedTo');
    const createdBy = searchParams.get('createdBy');
    const limit = parseListLimit(searchParams.get('limit'), 10);
    const page = parsePositiveInt(searchParams.get('page'), 1);

    const result = await EditorialService.listArticlesForNewsroom(
      {
        category,
        scope,
        workflowStatus,
        assignedTo,
        createdBy,
        limit,
        page,
      },
      user
    );

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    if (error instanceof EditorialForbiddenError) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    console.error('Error fetching articles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Read JSON body FIRST to avoid disturbed/locked body errors in Next.js 15
    const body = await req.json();

    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const created = await EditorialService.createDraft(body, user);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof EditorialForbiddenError) {
      return NextResponse.json(
        { success: false, error: error.message || 'Forbidden' },
        { status: 403 }
      );
    }
    if (error instanceof EditorialValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    console.error('Error creating article:', error);
    const message =
      process.env.NODE_ENV !== 'production'
        ? getErrorMessage(error) || 'Failed to create article'
        : 'Failed to create article';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
