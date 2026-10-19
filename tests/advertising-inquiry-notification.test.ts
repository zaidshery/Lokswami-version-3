import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendAdvertisingInquiryNotification } from '@/lib/notifications/advertisingInquiryEmail';

const rateLimit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/security/getRateLimiter', () => ({ checkRateLimit: rateLimit }));
const fetchMock = vi.fn();
const receipt = { id: '6ad1e53a79c188cabb59ac41', store: 'mongo' as const };

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('ADVERTISE_INQUIRY_EMAIL_ENABLED', 'true');
  vi.stubEnv('ADVERTISE_INQUIRY_NOTIFY_EMAIL', '');
  vi.stubEnv('RESEND_API_KEY', 'isolated-test-key');
  vi.stubEnv('RESEND_FROM_EMAIL', 'Lokswami <alerts@lokswami.com>');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://lokswami.com/path?ignored=true');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  rateLimit.mockReset().mockResolvedValue({ allowed: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('advertising notification delivery boundary', () => {
  it('sends only a saved reference and protected inbox link to the confirmed destination', async () => {
    expect(await sendAdvertisingInquiryNotification(receipt)).toEqual({ accepted: true });
    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe('https://api.resend.com/emails');
    expect(body.to).toEqual(['tech.lokswami@gmail.com']);
    expect(body.text).toContain('Owner: Zaid');
    expect(body.text).toContain('Queue: Database');
    expect(body.text).toContain('https://lokswami.com/admin/contact-messages');
    expect(Object.keys(body).sort()).toEqual(['from', 'subject', 'text', 'to']);
    expect(request.headers['Idempotency-Key']).toBe(`advertising-inquiry/mongo/${receipt.id}`);
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.redirect).toBe('error');
    expect(request.cache).toBe('no-store');
    expect(rateLimit).toHaveBeenCalledWith({ scope: 'public_write', identifier: 'advertising-notification:operations' });
  });

  it('identifies the recovery queue and accepts an operator-configured recipient', async () => {
    vi.stubEnv('ADVERTISE_INQUIRY_NOTIFY_EMAIL', 'ops@example.test');
    await sendAdvertisingInquiryNotification({ id: 'file-reference-001', store: 'file' });
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body)).toMatchObject({ to: ['ops@example.test'], text: expect.stringContaining('Queue: Recovery file') });
    expect(request.headers['Idempotency-Key']).toBe('advertising-inquiry/file/file-reference-001');
  });

  it.each(['development', 'test'])('never sends from %s even with provider credentials', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    expect(await sendAdvertisingInquiryNotification(receipt)).toEqual({ accepted: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it('requires explicit opt-in', async () => {
    vi.stubEnv('ADVERTISE_INQUIRY_EMAIL_ENABLED', 'false');
    expect(await sendAdvertisingInquiryNotification(receipt)).toEqual({ accepted: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['RESEND_API_KEY', ''], ['RESEND_FROM_EMAIL', ''],
    ['RESEND_FROM_EMAIL', 'sender@example.test\r\nBcc: x@example.test'],
    ['ADVERTISE_INQUIRY_NOTIFY_EMAIL', 'one@example.test,two@example.test'],
    ['NEXT_PUBLIC_SITE_URL', 'http://lokswami.com'],
    ['NEXT_PUBLIC_SITE_URL', 'https://user:password@lokswami.com'],
    ['NEXT_PUBLIC_SITE_URL', 'invalid'],
  ])('fails closed for invalid %s', async (key, value) => {
    vi.stubEnv(key, value);
    expect(await sendAdvertisingInquiryNotification(receipt)).toEqual({ accepted: false, reason: 'configuration' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid reference without transmission', async () => {
    expect(await sendAdvertisingInquiryNotification({ ...receipt, id: 'bad\r\nReference' })).toEqual({ accepted: false, reason: 'invalid_reference' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds notification volume without losing the saved enquiry', async () => {
    rateLimit.mockResolvedValue({ allowed: false });
    expect(await sendAdvertisingInquiryNotification(receipt)).toEqual({ accepted: false, reason: 'throttled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose provider error bodies', async () => {
    const text = vi.fn().mockResolvedValue('provider echoes private data');
    fetchMock.mockResolvedValue({ ok: false, text });
    expect(await sendAdvertisingInquiryNotification(receipt)).toEqual({ accepted: false, reason: 'provider_rejected' });
    expect(text).not.toHaveBeenCalled();
  });

  it('handles provider timeout or network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    expect(await sendAdvertisingInquiryNotification(receipt)).toEqual({ accepted: false, reason: 'unavailable' });
  });
});
