import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canCreateEpaper } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function POSTHandler(req: NextRequest) {
  const admin = await getAdminSessionFromReq(req);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canCreateEpaper(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(
    {
      success: false,
      error:
        'Direct DigitalOcean upload is required for e-paper files. Please use the updated CMS upload screen.',
    },
    { status: 400 }
  );
}

export const POST = withAdminMutation(POSTHandler);
