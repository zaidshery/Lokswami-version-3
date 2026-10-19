import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageContactInbox } from '@/lib/auth/permissions';
import { withAdminMutation } from '@/lib/api/adminRoute';
import { AdvertisingInboxError, advertisingInboxService } from '@/lib/server/audience/advertisingInboxService';

async function authorize() {
  const actor = await getAdminSession();
  if (!actor) return { response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }), actor: null };
  if (!canManageContactInbox(actor.role)) return { response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }), actor: null };
  return { response: null, actor };
}
function failure(error: unknown) {
  return NextResponse.json({ success: false, error: error instanceof AdvertisingInboxError ? error.message : 'Enquiry storage is unavailable. Check the selected source or recovery file.' }, { status: error instanceof AdvertisingInboxError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    return NextResponse.json({ success: true, ...await advertisingInboxService.list(request.nextUrl) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export const PATCH = withAdminMutation(async (request: NextRequest) => {
  try {
    const auth = await authorize();
    if (auth.response) return auth.response;
    let body;
    try { body = await request.json(); } catch { throw new AdvertisingInboxError('Invalid JSON.', 400); }
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new AdvertisingInboxError('Invalid payload.', 400);
    const data = await advertisingInboxService.update(body, auth.actor!.name || auth.actor!.email || 'Admin');
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
});
