import { NextRequest, NextResponse } from 'next/server';
import {
  analyticsService,
  AnalyticsValidationError,
} from '@/lib/server/analytics/analyticsService';

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim().slice(0, 120) || '';
  }
  return String(req.headers.get('x-real-ip') || '').trim().slice(0, 120);
}

function getCountryCode(req: NextRequest): string {
  const candidates = [
    req.headers.get('x-vercel-ip-country'),
    req.headers.get('cf-ipcountry'),
    req.headers.get('x-country-code'),
    req.headers.get('x-country'),
  ];

  for (const value of candidates) {
    const normalized = String(value || '').trim().slice(0, 8).toUpperCase();
    if (/^[A-Z]{2,3}$/.test(normalized)) {
      return normalized;
    }
  }

  return '';
}

function getAcceptLanguage(req: NextRequest): string {
  const header = String(req.headers.get('accept-language') || '').trim().slice(0, 120);
  if (!header) return '';
  return header.split(',')[0]?.trim().slice(0, 32) || '';
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request payload' },
        { status: 400 }
      );
    }

    const context = {
      clientIp: getClientIp(req),
      userAgent: req.headers.get('user-agent') || '',
      acceptLanguage: getAcceptLanguage(req),
      countryCode: getCountryCode(req),
    };

    const result = await analyticsService.trackPublicEvent(body, context);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AnalyticsValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    console.error('Analytics tracking failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to track analytics event' },
      { status: 500 }
    );
  }
}
