import { NextRequest, NextResponse } from 'next/server';
import { isAdminRole } from '@/lib/auth/roles';
import {
  findStaffUserBySetupToken,
  setStaffPasswordWithToken,
} from '@/lib/auth/staffCredentials';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/getRateLimiter';
import { getClientIp } from '@/lib/security/ipUtils';
import { logStaffSetupCompleted } from '@/lib/security/auditLogger';

function normalizePassword(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    const user = await findStaffUserBySetupToken(token);

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid setup link' },
        { status: 404 }
      );
    }

    const expiresAt = user.setupTokenExpiresAt ? new Date(user.setupTokenExpiresAt) : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        {
          success: false,
          error: 'This setup link has expired',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        name: typeof user.name === 'string' ? user.name.trim() : '',
        email: typeof user.email === 'string' ? user.email.trim() : '',
        loginId: typeof user.loginId === 'string' ? user.loginId.trim() : '',
        role: user.role,
        setupExpiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Staff setup GET failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to validate setup link' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req);
    const limitRes = await checkRateLimit({
      scope: 'staff_setup_redemption',
      identifier: clientIp,
    });
    if (!limitRes.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many setup attempts. Please try again later.',
          code: 'RATE_LIMITED',
        },
        { status: 429, headers: getRateLimitHeaders(limitRes) }
      );
    }

    const body = await req.json();
    const token = typeof body.token === 'string' ? body.token : '';
    const password = normalizePassword(body.password);
    const confirmPassword = normalizePassword(body.confirmPassword);

    if (!token.trim()) {
      return NextResponse.json(
        { success: false, error: 'Setup token is required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    const result = await setStaffPasswordWithToken({
      token: token.trim(),
      password,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    try {
      await logStaffSetupCompleted({
        userId: result.userId,
        userEmail: result.email,
        userRole: result.role,
        loginId: result.loginId,
        ipAddress: clientIp,
        userAgent: req.headers.get('user-agent') || 'unknown',
      });
    } catch (auditError) {
      console.error('Failed to log staff setup completion audit event:', auditError);
    }

    return NextResponse.json({
      success: true,
      data: {
        loginId: result.loginId,
        email: result.email,
        role: result.role,
      },
    });
  } catch (error) {
    console.error('Staff setup POST failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set password' },
      { status: 500 }
    );
  }
}
