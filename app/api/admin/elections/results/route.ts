import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { canManageNewsroomSettings } from '@/lib/auth/permissions';
import { electionAudienceService } from '@/lib/server/audience/electionAudienceService';

async function authorize(req: NextRequest) {
  const user = await getAdminSessionFromReq(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageNewsroomSettings(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;
  return NextResponse.json(await electionAudienceService.readResults());
}

export async function POST(req: NextRequest) {
  const denied = await authorize(req);
  if (denied) return denied;
  const data = await electionAudienceService.writeResults(await req.json());
  return NextResponse.json({ success: true, lastUpdated: data.lastUpdated });
}
