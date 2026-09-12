import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canViewPage } from '@/lib/auth/permissions';
import { deleteAdminCategory } from '@/lib/server/content/adminTaxonomyService';

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAdminSessionFromReq(req);
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!canViewPage(user.role, 'categories')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const parts = req.url.split('/');
    const id = parts[parts.length - 1];
    const deleted = await deleteAdminCategory(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('cat delete err', err);
    return NextResponse.json({ success: false, error: 'Failed to delete' }, { status: 500 });
  }
}
