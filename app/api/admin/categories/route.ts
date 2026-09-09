import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import {
  createAdminCategory,
  getAdminCategories,
} from '@/lib/server/content/adminTaxonomyService';

export async function GET(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const cats = await getAdminCategories();
    return NextResponse.json({ success: true, data: cats });
  } catch (err) {
    console.error('categories GET err', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canViewPage(user.role, 'categories')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const newCat = await createAdminCategory(body);
    return NextResponse.json({ success: true, data: newCat }, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 400) {
      return NextResponse.json(
        { success: false, error: (err as Error).message },
        { status: 400 }
      );
    }
    console.error('cat create err', err);
    return NextResponse.json(
      { success: false, error: 'Failed to create category' },
      { status: 500 }
    );
  }
}
