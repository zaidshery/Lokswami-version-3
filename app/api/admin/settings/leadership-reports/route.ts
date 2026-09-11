import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin';
import { canManageSettings } from '@/lib/auth/permissions';
import { analyticsReportService } from '@/lib/server/analytics/analyticsReportService';

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!canManageSettings(admin.role)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  try {
    const data = await analyticsReportService.getLeadershipReportSettings();
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Failed to load leadership report settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load leadership report settings.' },
      { status: 500 }
    );
  }
}
