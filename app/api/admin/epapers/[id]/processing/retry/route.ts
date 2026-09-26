import { withAdminMutation } from '@/lib/api/adminRoute';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromReq } from '@/lib/auth/admin';
import { epaperProcessingService } from '@/lib/server/epaper/epaperProcessingService';
import { EpaperDomainError } from '@/lib/server/epaper/epaperTypes';
import { logAuditAction } from '@/lib/security/auditLogger';
import { getClientIp } from '@/lib/security/ipUtils';

type RouteContext = { params: Promise<{ id: string }> };

async function POSTHandler(request: NextRequest, context: RouteContext) {
  const actor = await getAdminSessionFromReq(request);
  if (!actor) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const startTime = Date.now();
  const clientIp = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const { id } = await context.params;

  try {
    const result = await epaperProcessingService.retry(actor, id, await request.json().catch(() => ({})));

    void logAuditAction({
      action: 'retry',
      resourceType: 'epaper',
      resourceId: id,
      resourceName: 'E-Paper Page Processing Retry',
      userId: actor.id,
      userEmail: actor.email,
      userRole: actor.role,
      method: 'POST',
      endpoint: `/api/admin/epapers/${id}/processing/retry`,
      statusCode: 200,
      duration: Date.now() - startTime,
      ipAddress: clientIp,
      userAgent,
      requestData: {
        jobId: result.data?.jobId,
        pageNumbers: result.data?.pageNumbers,
      },
      responseStatus: 'success',
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof EpaperDomainError) {
      void logAuditAction({
        action: 'retry',
        resourceType: 'epaper',
        resourceId: id,
        resourceName: 'E-Paper Page Processing Retry',
        userId: actor.id,
        userEmail: actor.email,
        userRole: actor.role,
        method: 'POST',
        endpoint: `/api/admin/epapers/${id}/processing/retry`,
        statusCode: error.status,
        duration: Date.now() - startTime,
        ipAddress: clientIp,
        userAgent,
        errorMessage: error.message,
        responseStatus: 'error',
      });
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = withAdminMutation(POSTHandler);
