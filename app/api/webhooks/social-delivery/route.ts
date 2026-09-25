import { NextRequest, NextResponse } from 'next/server';
import { getSocialAutomationConfig } from '@/lib/server/socialAutomation';
import { verifyWebhookSignature } from '@/lib/server/distribution/webhookSecurity';
import { socialDistributionService } from '@/lib/server/distribution/socialDistributionService';
import { checkRateLimit, getRateLimitHeaders } from '@/lib/security/getRateLimiter';
import { getClientIp } from '@/lib/security/ipUtils';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rateLimit = await checkRateLimit({
      scope: 'api',
      identifier: `webhook-social:${ip}`,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const config = getSocialAutomationConfig();
    const rawBody = await req.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json(
        { success: false, error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    const deliveryIdHeader = req.headers.get('x-lokswami-delivery-id');
    const deliveryId = (deliveryIdHeader || String(parsed.deliveryId || '')).trim();

    if (!deliveryId) {
      return NextResponse.json(
        { success: false, error: 'Missing delivery ID' },
        { status: 400 }
      );
    }

    const signatureHeader = req.headers.get('x-lokswami-signature');
    const timestampHeader = req.headers.get('x-lokswami-timestamp');

    const verification = verifyWebhookSignature({
      signatureHeader,
      timestampHeader,
      rawBody,
      deliveryId,
      secret: config.sharedSecret,
      maxDriftSeconds: 300,
    });

    if (!verification.valid) {
      return NextResponse.json(
        { success: false, error: verification.reason || 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    const statusParam = String(parsed.status || '').trim().toLowerCase();
    const outcome = statusParam === 'succeeded' || statusParam === 'published' ? 'succeeded' : 'failed';
    const externalUrl = typeof parsed.externalUrl === 'string' ? parsed.externalUrl.trim() : undefined;
    const externalPostId = typeof parsed.externalPostId === 'string' ? parsed.externalPostId.trim() : undefined;
    const note = typeof parsed.error === 'string' ? parsed.error.trim() : undefined;

    const reconciled = await socialDistributionService.reconcileDelivery(
      deliveryId,
      {
        outcome,
        externalUrl,
        externalPostId,
        note,
      },
      {
        id: 'webhook-system',
        name: 'Webhook System',
        email: 'webhook@system.local',
        role: 'super_admin',
      }
    );

    return NextResponse.json(
      { success: true, data: reconciled },
      { headers: getRateLimitHeaders(rateLimit) }
    );
  } catch (error) {
    console.error('Error handling social webhook:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal webhook error' },
      { status: 500 }
    );
  }
}
