import { NextResponse } from 'next/server';
import { normalizeVitalMetric } from '@/lib/analytics/webVitals';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';
import AnalyticsEvent from '@/lib/models/AnalyticsEvent';
import { createStoredAnalyticsEvent } from '@/lib/storage/analyticsEventsFile';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const metric = normalizeVitalMetric(body);

    if (!metric) {
      return NextResponse.json(
        { success: false, error: 'Invalid web vitals metric payload' },
        { status: 400 }
      );
    }

    const eventPayload = {
      event: `web_vital_${metric.name.toLowerCase()}`,
      page: (metric.path || '/').slice(0, 1024),
      source: 'web_vitals_beacon',
      sessionId: metric.id,
      ipAddress: '', // Privacy safeguard: do not store IP addresses for vitals
      userAgent: '',
      metadata: {
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
        deviceType: metric.deviceType,
        navigationType: metric.navigationType,
        timestamp: metric.timestamp,
      },
    };

    if (await isMongoAvailable({ label: 'analytics vitals ingestion' })) {
      try {
        await AnalyticsEvent.create(eventPayload);
        return NextResponse.json({ success: true, metric });
      } catch (error) {
        console.error('Failed to record vital event in MongoDB, falling back to file store.', error);
      }
    }

    await createStoredAnalyticsEvent(eventPayload);
    return NextResponse.json({ success: true, metric });
  } catch (error) {
    console.error('Web vitals ingestion error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error processing web vital' },
      { status: 500 }
    );
  }
}
