import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/db/mongoose';
import AnalyticsEvent from '@/lib/models/AnalyticsEvent';
import { createStoredAnalyticsEvent } from '@/lib/storage/analyticsEventsFile';

const EVENT_REGEX = /^[a-z0-9_\-]{3,80}$/;
const SOURCE_REGEX = /^[a-z0-9_\-]{2,80}$/;
const SESSION_ID_REGEX = /^[a-z0-9_\-]{8,120}$/i;

function clean(value: unknown, max: number) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim().slice(0, 120) || '';
  }
  return clean(req.headers.get('x-real-ip'), 120);
}

function generateSessionId() {
  const raw =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : crypto.randomBytes(16).toString('hex');
  return `sess_${raw.slice(0, 24)}`;
}

function cleanMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const safe: Record<string, unknown> = {};
  const entries = Object.entries(input).slice(0, 20);

  for (const [key, value] of entries) {
    const normalizedKey = clean(key, 64);
    if (!normalizedKey) continue;

    if (value == null) {
      safe[normalizedKey] = null;
      continue;
    }

    if (typeof value === 'string') {
      safe[normalizedKey] = clean(value, 300);
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      safe[normalizedKey] = value;
      continue;
    }

    if (Array.isArray(value)) {
      safe[normalizedKey] = value
        .slice(0, 10)
        .map((item) => (typeof item === 'string' ? clean(item, 120) : item))
        .filter((item) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean');
      continue;
    }

    safe[normalizedKey] = clean(JSON.stringify(value), 300);
  }

  return safe;
}

const SWIPE_METADATA_KEYS = new Set([
  'videoId',
  'videoSlug',
  'mediaProvider',
  'fromVideoId',
  'toVideoId',
  'articleId',
  'articleSlug',
  'deviceCategory',
  'viewportBucket',
]);

function cleanAnonymousSwipeMetadata(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => SWIPE_METADATA_KEYS.has(key))
  );
}

function getCountryCode(req: NextRequest) {
  const candidates = [
    req.headers.get('x-vercel-ip-country'),
    req.headers.get('cf-ipcountry'),
    req.headers.get('x-country-code'),
    req.headers.get('x-country'),
  ];

  for (const value of candidates) {
    const normalized = clean(value, 8).toUpperCase();
    if (/^[A-Z]{2,3}$/.test(normalized)) {
      return normalized;
    }
  }

  return '';
}

function getAcceptLanguage(req: NextRequest) {
  const header = clean(req.headers.get('accept-language'), 120);
  if (!header) return '';

  return clean(header.split(',')[0], 32);
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

    const eventInput = clean(body.event, 80).toLowerCase();
    const pageInput = clean(body.page, 1024);
    const sourceInput = clean(body.source, 80).toLowerCase();
    const sessionInput = clean(body.sessionId, 120);

    if (!EVENT_REGEX.test(eventInput)) {
      return NextResponse.json(
        { success: false, error: 'Invalid analytics event' },
        { status: 400 }
      );
    }

    if (!pageInput) {
      return NextResponse.json(
        { success: false, error: 'Invalid analytics page' },
        { status: 400 }
      );
    }

    const source = SOURCE_REGEX.test(sourceInput) ? sourceInput : 'web';
    const isAnonymousSwipeEvent = source === 'lokswami_swipe';
    const sessionId = isAnonymousSwipeEvent
      ? generateSessionId()
      : SESSION_ID_REGEX.test(sessionInput)
        ? sessionInput
        : generateSessionId();

    const baseMetadata = cleanMetadata(body.metadata);
    const cleanedMetadata = isAnonymousSwipeEvent
      ? cleanAnonymousSwipeMetadata(baseMetadata)
      : baseMetadata;
    if (!isAnonymousSwipeEvent && !cleanedMetadata.browserLanguage) {
      cleanedMetadata.browserLanguage = getAcceptLanguage(req);
    }
    if (!isAnonymousSwipeEvent && !cleanedMetadata.countryCode) {
      const countryCode = getCountryCode(req);
      if (countryCode) {
        cleanedMetadata.countryCode = countryCode;
      }
    }

    const savePayload = {
      event: eventInput,
      page: pageInput,
      source,
      sessionId,
      ipAddress: isAnonymousSwipeEvent ? '' : getClientIp(req),
      userAgent: isAnonymousSwipeEvent ? '' : clean(req.headers.get('user-agent'), 500),
      metadata: cleanedMetadata,
    };

    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        await AnalyticsEvent.create(savePayload);

        return NextResponse.json(
          { success: true, sessionId },
          { status: 201 }
        );
      } catch (mongoError) {
        console.error('Mongo write failed, analytics falling back to file:', mongoError);
      }
    }

    await createStoredAnalyticsEvent(savePayload);

    return NextResponse.json(
      { success: true, sessionId },
      { status: 201 }
    );
  } catch (error) {
    console.error('Analytics tracking failed:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to track analytics event' },
      { status: 500 }
    );
  }
}
