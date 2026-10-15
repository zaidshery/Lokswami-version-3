import type { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const connectDBMock = vi.fn();
const subscriberFindOneMock = vi.fn();
const subscriberCreateMock = vi.fn();
const marketingLeadUpsertMock = vi.fn();
const advertiseCreateMock = vi.fn();
const careerCreateMock = vi.fn();
const contactCreateMock = vi.fn();
const upsertStoredMarketingLeadMock = vi.fn();
const createStoredAdvertiseInquiryMock = vi.fn();
const createStoredCareerApplicationMock = vi.fn();
const createStoredContactMessageMock = vi.fn();
const verifyAntiBotMock = vi.fn();
const sendContactAcknowledgementEmailMock = vi.fn();
const generateContactTicketIdMock = vi.fn();

vi.mock('@/lib/db/mongoose', () => ({ default: connectDBMock }));
vi.mock('@/lib/models/Subscriber', () => ({
  default: {
    findOne: subscriberFindOneMock,
    create: subscriberCreateMock,
  },
}));
vi.mock('@/lib/models/MarketingLead', () => ({
  default: { findOneAndUpdate: marketingLeadUpsertMock },
}));
vi.mock('@/lib/models/AdvertiseInquiry', () => ({
  default: { create: advertiseCreateMock },
}));
vi.mock('@/lib/models/CareerApplication', () => ({
  default: { create: careerCreateMock },
}));
vi.mock('@/lib/models/ContactMessage', () => ({
  default: { create: contactCreateMock },
}));
vi.mock('@/lib/storage/marketingLeadsFile', () => ({
  upsertStoredMarketingLead: upsertStoredMarketingLeadMock,
}));
vi.mock('@/lib/storage/advertiseInquiriesFile', () => ({
  createStoredAdvertiseInquiry: createStoredAdvertiseInquiryMock,
}));
vi.mock('@/lib/storage/careerApplicationsFile', () => ({
  createStoredCareerApplication: createStoredCareerApplicationMock,
}));
vi.mock('@/lib/storage/contactMessagesFile', () => ({
  createStoredContactMessage: createStoredContactMessageMock,
}));
vi.mock('@/lib/security/antiBot', () => ({ verifyAntiBot: verifyAntiBotMock }));
vi.mock('@/lib/notifications/contactAckEmail', () => ({
  sendContactAcknowledgementEmail: sendContactAcknowledgementEmailMock,
}));
vi.mock('@/lib/contact/ticket', () => ({
  generateContactTicketId: generateContactTicketIdMock,
}));

const originalMongoUri = process.env.MONGODB_URI;

function jsonRequest(path: string, body: Record<string, unknown>, ip = '203.0.113.10') {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
      'user-agent': 'Vitest browser',
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('audience capture route compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MONGODB_URI;
    connectDBMock.mockResolvedValue(undefined);
    verifyAntiBotMock.mockResolvedValue({ ok: true });
    sendContactAcknowledgementEmailMock.mockResolvedValue({ sent: true, skipped: false });
    generateContactTicketIdMock.mockReturnValue('LS-TEST-0001');
  });

  afterAll(() => {
    if (originalMongoUri === undefined) {
      delete process.env.MONGODB_URI;
    } else {
      process.env.MONGODB_URI = originalMongoUri;
    }
  });

  it('preserves newsletter validation and the unconfigured 503 response', async () => {
    const { POST } = await import('@/app/api/subscribe/route');

    const invalid = await POST(jsonRequest('/api/subscribe', { email: 'bad', source: 'main' }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      success: false,
      error: 'Please enter a valid email address',
    });

    const unavailable = await POST(
      jsonRequest('/api/subscribe', { email: 'reader@example.com', source: 'main' })
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      success: false,
      error: 'Subscription service is not configured yet',
    });
  });

  it('keeps newsletter subscription idempotency and appends a new source once', async () => {
    process.env.MONGODB_URI = 'mongodb://example.invalid/lokswami';
    const save = vi.fn().mockResolvedValue(undefined);
    const existing = { email: 'reader@example.com', sources: ['main'], save };
    subscriberFindOneMock.mockResolvedValue(existing);

    const { POST } = await import('@/app/api/subscribe/route');
    const response = await POST(
      jsonRequest('/api/subscribe', { email: ' Reader@Example.com ', source: 'epaper' })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'You are already subscribed with this email',
    });
    expect(existing.sources).toEqual(['main', 'epaper']);
    expect(save).toHaveBeenCalledTimes(1);
    expect(subscriberCreateMock).not.toHaveBeenCalled();
  });

  it('preserves the newsletter creation status and stored fields', async () => {
    process.env.MONGODB_URI = 'mongodb://example.invalid/lokswami';
    subscriberFindOneMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/subscribe/route');
    const response = await POST(
      jsonRequest('/api/subscribe', { email: 'NEW@Example.com', source: 'main' })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Subscription successful',
    });
    expect(subscriberCreateMock).toHaveBeenCalledWith({
      email: 'new@example.com',
      sources: ['main'],
      subscribedAt: expect.any(Date),
    });
  });

  it('normalizes marketing leads and uses the file fallback without Mongo', async () => {
    const { POST } = await import('@/app/api/marketing/lead/route');
    const response = await POST(
      jsonRequest('/api/marketing/lead', {
        email: ' Reader@Example.com ',
        name: ' Reader ',
        consent: true,
        wantsDailyAlerts: true,
        source: 'Bad Source',
        campaign: 'daily_alerts',
        interests: [' Politics ', 'VIDEO'],
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Preference saved successfully',
    });
    expect(upsertStoredMarketingLeadMock).toHaveBeenCalledWith({
      email: 'reader@example.com',
      name: 'Reader',
      interests: ['politics', 'video'],
      source: 'engagement-popup',
      campaign: 'daily_alerts',
      wantsDailyAlerts: true,
      consent: true,
    });
    expect(subscriberFindOneMock).not.toHaveBeenCalled();
  });

  it('preserves advertising honeypot success without persistence', async () => {
    const { POST } = await import('@/app/api/advertise/inquiry/route');
    const response = await POST(
      jsonRequest('/api/advertise/inquiry', {
        name: 'Example Buyer',
        company: 'Example Media',
        email: 'buyer@example.com',
        message: 'Please share the current advertising inventory.',
        website: 'bot-filled-field',
      })
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ success: true, message: 'Inquiry received' });
    expect(advertiseCreateMock).not.toHaveBeenCalled();
    expect(createStoredAdvertiseInquiryMock).not.toHaveBeenCalled();
  });

  it('preserves advertising file fallback and request metadata', async () => {
    const { POST } = await import('@/app/api/advertise/inquiry/route');
    const response = await POST(
      jsonRequest(
        '/api/advertise/inquiry',
        {
          name: ' Buyer ',
          company: ' Example Media ',
          email: 'BUYER@example.com',
          phone: '+91 98765 43210',
          campaignType: 'video',
          message: 'Please share the current advertising inventory.',
        },
        '198.51.100.31'
      )
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      message: 'Inquiry submitted successfully',
    });
    expect(createStoredAdvertiseInquiryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Buyer',
        company: 'Example Media',
        email: 'buyer@example.com',
        campaignType: 'video',
        source: 'main-advertise',
        ipAddress: '198.51.100.31',
      })
    );
  });

  it('preserves career URL validation and file persistence metadata', async () => {
    const { POST } = await import('@/app/api/careers/apply/route');
    const invalid = await POST(
      jsonRequest('/api/careers/apply', {
        name: 'Applicant',
        email: 'applicant@example.com',
        role: 'Reporter',
        portfolioUrl: 'javascript:alert(1)',
        message: 'I would like to join the Lokswami reporting team.',
      })
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      success: false,
      error: 'Please provide a valid portfolio URL',
    });

    const accepted = await POST(
      jsonRequest(
        '/api/careers/apply',
        {
          name: ' Applicant ',
          email: 'APPLICANT@example.com',
          role: ' Reporter ',
          portfolioUrl: 'https://example.com/work',
          message: 'I would like to join the Lokswami reporting team.',
        },
        '198.51.100.21, 10.0.0.1'
      )
    );
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toEqual({
      success: true,
      message: 'Application submitted successfully',
    });
    expect(createStoredCareerApplicationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Applicant',
        email: 'applicant@example.com',
        role: 'Reporter',
        ipAddress: '198.51.100.21',
        userAgent: 'Vitest browser',
      })
    );
  });

  it('preserves contact anti-bot, ticket, persistence, and acknowledgement behavior', async () => {
    const { POST } = await import('@/app/api/contact/route');
    const response = await POST(
      jsonRequest(
        '/api/contact',
        {
          name: ' Reader ',
          email: 'READER@example.com',
          subject: 'Newsroom question',
          message: 'Please help me contact the newsroom desk.',
          turnstileToken: 'turnstile-token',
        },
        '192.0.2.44'
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      success: true,
      message: 'Message sent successfully',
      requestId: expect.any(String),
      ticketId: 'LS-TEST-0001',
    });
    expect(verifyAntiBotMock).toHaveBeenCalledWith({
      turnstileToken: 'turnstile-token',
      recaptchaToken: '',
      remoteIp: '192.0.2.44',
    });
    expect(createStoredContactMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: 'LS-TEST-0001',
        name: 'Reader',
        email: 'reader@example.com',
        ipAddress: '192.0.2.44',
      })
    );
    expect(sendContactAcknowledgementEmailMock).toHaveBeenCalledWith({
      to: 'reader@example.com',
      name: 'Reader',
      ticketId: 'LS-TEST-0001',
      subject: 'Newsroom question',
    });

    const duplicate = await POST(
      jsonRequest(
        '/api/contact',
        {
          name: 'Reader',
          email: 'reader@example.com',
          subject: 'Newsroom question',
          message: 'Please help me contact the newsroom desk.',
          turnstileToken: 'turnstile-token',
        },
        '192.0.2.44'
      )
    );
    expect(duplicate.status).toBe(202);
    expect(await duplicate.json()).toEqual({
      success: true,
      message: 'Message already received recently.',
      requestId: expect.any(String),
      ticketId: 'LS-TEST-0001',
    });
    expect(createStoredContactMessageMock).toHaveBeenCalledTimes(1);
    expect(sendContactAcknowledgementEmailMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the contact rate limit and Retry-After contract', async () => {
    const { POST } = await import('@/app/api/contact/route');
    generateContactTicketIdMock.mockImplementation(
      () => `LS-RATE-${createStoredContactMessageMock.mock.calls.length + 1}`
    );

    for (let index = 0; index < 6; index += 1) {
      const accepted = await POST(
        jsonRequest(
          '/api/contact',
          {
            name: 'Rate Test',
            email: 'rate@example.com',
            subject: `Question ${index}`,
            message: `This is distinct contact message number ${index}.`,
          },
          '192.0.2.99'
        )
      );
      expect(accepted.status).toBe(201);
    }

    const limited = await POST(
      jsonRequest(
        '/api/contact',
        {
          name: 'Rate Test',
          email: 'rate@example.com',
          subject: 'Question 7',
          message: 'This is the seventh distinct contact message.',
        },
        '192.0.2.99'
      )
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('600');
    expect(await limited.json()).toEqual({
      success: false,
      error: 'Too many requests. Please retry in about 10 minutes.',
      requestId: expect.any(String),
    });
  });
});
