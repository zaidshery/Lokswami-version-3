import {
  ADVERTISING_NOTIFICATION_EMAIL,
  ADVERTISING_OWNER,
  type AdvertisingInquiryReceipt,
} from '@/lib/advertising/inquiryWorkflow';
import { checkRateLimit } from '@/lib/security/getRateLimiter';

type NotificationReason = 'disabled' | 'configuration' | 'invalid_reference' | 'throttled' | 'provider_rejected' | 'unavailable';
export type AdvertisingNotificationResult = { accepted: boolean; reason?: NotificationReason };

// The saved enquiry remains authoritative. This best-effort alert contains no
// buyer details and never turns a successful capture into a retryable failure.
export async function sendAdvertisingInquiryNotification(
  receipt: AdvertisingInquiryReceipt
): Promise<AdvertisingNotificationResult> {
  if (process.env.NODE_ENV !== 'production' || process.env.ADVERTISE_INQUIRY_EMAIL_ENABLED?.trim() !== 'true') {
    return { accepted: false, reason: 'disabled' };
  }
  if (!/^[a-z0-9-]{8,80}$/i.test(receipt.id) || !['mongo', 'file'].includes(receipt.store)) {
    return { accepted: false, reason: 'invalid_reference' };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = process.env.ADVERTISE_INQUIRY_NOTIFY_EMAIL?.trim() || ADVERTISING_NOTIFICATION_EMAIL;
  if (!apiKey || !from || /[\r\n]/.test(from) || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)) {
    return { accepted: false, reason: 'configuration' };
  }

  let inbox: URL;
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://lokswami.com');
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Invalid origin');
    inbox = new URL('/admin/contact-messages', origin.origin);
  } catch {
    return { accepted: false, reason: 'configuration' };
  }

  try {
    const limit = await checkRateLimit({ scope: 'public_write', identifier: 'advertising-notification:operations' });
    if (!limit.allowed) return { accepted: false, reason: 'throttled' };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `advertising-inquiry/${receipt.store}/${receipt.id}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: 'New Lokswami advertising enquiry',
        text: [
          'A new advertising enquiry is saved in the protected Contact Inbox.',
          `Owner: ${ADVERTISING_OWNER}`,
          `Reference: ${receipt.id}`,
          `Queue: ${receipt.store === 'file' ? 'Recovery file' : 'Database'}`,
          `Open inbox: ${inbox.href}`,
          'Sign in to review the brief and contact details, then record the next action.',
        ].join('\n'),
      }),
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
      redirect: 'error',
    });
    // Do not copy provider error bodies into logs: they can echo request data.
    return response.ok ? { accepted: true } : { accepted: false, reason: 'provider_rejected' };
  } catch {
    return { accepted: false, reason: 'unavailable' };
  }
}
