import crypto from 'crypto';
import { generateContactTicketId } from '@/lib/contact/ticket';
import { sendContactAcknowledgementEmail } from '@/lib/notifications/contactAckEmail';
import { verifyAntiBot } from '@/lib/security/antiBot';
import { contactRepository, type ContactRepository } from './contactRepository';
import type {
  AudienceCaptureOutcome,
  AudienceRequestMetadata,
  ContactListOptions,
  ContactWorkflowStatus,
} from './audienceTypes';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+()\-\s0-9]{7,20}$/;
const SOURCE_REGEX = /^[a-z0-9-]{2,40}$/;
const VALID_STATUS = new Set<ContactWorkflowStatus>(['new', 'in_progress', 'resolved']);
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 6;
const DUPLICATE_SUBMISSION_WINDOW_MS = 2 * 60 * 1000;
const RATE_LIMIT_RETRY_AFTER_SECONDS = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
const RATE_LIMIT_RETRY_AFTER_MINUTES = Math.ceil(RATE_LIMIT_RETRY_AFTER_SECONDS / 60);
const rateLimitBuckets = new Map<string, number[]>();
const recentSubmissionFingerprints = new Map<string, { timestamp: number; ticketId: string }>();

type ContactPayload = {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  source: string;
  website: string;
  turnstileToken: string;
  recaptchaToken: string;
};

export class ContactServiceError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ContactServiceError';
  }
}

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function parsePayload(body: Record<string, unknown>) {
  const sourceInput = clean(body.source, 40).toLowerCase();
  const payload: ContactPayload = {
    name: clean(body.name, 120),
    email: clean(body.email, 180).toLowerCase(),
    phone: clean(body.phone, 20),
    subject: clean(body.subject, 200),
    message: String(body.message ?? '').replace(/\r\n/g, '\n').trim().slice(0, 5000),
    source: SOURCE_REGEX.test(sourceInput) ? sourceInput : 'main-contact',
    website: clean(body.website, 100),
    turnstileToken: clean(body.turnstileToken, 4000),
    recaptchaToken: clean(body.recaptchaToken, 4000),
  };

  if (payload.name.length < 2) throw new ContactServiceError('Name must be at least 2 characters long', 400);
  if (!EMAIL_REGEX.test(payload.email)) throw new ContactServiceError('Please provide a valid email address', 400);
  if (payload.phone && !PHONE_REGEX.test(payload.phone)) throw new ContactServiceError('Please provide a valid phone number', 400);
  if (payload.message.length < 10) throw new ContactServiceError('Message must be at least 10 characters long', 400);
  return payload;
}

function pruneContactGuards(now: number) {
  for (const [ip, attempts] of rateLimitBuckets.entries()) {
    const active = attempts.filter((timestamp) => now - timestamp <= RATE_LIMIT_WINDOW_MS);
    if (active.length === 0) rateLimitBuckets.delete(ip);
    else rateLimitBuckets.set(ip, active);
  }
  for (const [fingerprint, existing] of recentSubmissionFingerprints.entries()) {
    if (now - existing.timestamp > DUPLICATE_SUBMISSION_WINDOW_MS) {
      recentSubmissionFingerprints.delete(fingerprint);
    }
  }
}

function consumeRateLimit(ip: string, now: number) {
  const active = (rateLimitBuckets.get(ip) || []).filter(
    (timestamp) => now - timestamp <= RATE_LIMIT_WINDOW_MS
  );
  if (active.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(ip, active);
    return false;
  }
  active.push(now);
  rateLimitBuckets.set(ip, active);
  return true;
}

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto
    .createHash('sha1')
    .update(`${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .digest('hex')
    .slice(0, 20);
}

function fingerprint(payload: ContactPayload, ip: string) {
  const canonical = `${ip}|${payload.email}|${payload.subject}|${payload.message
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class ContactService {
  constructor(private readonly repo: ContactRepository = contactRepository) {}

  async submit(
    body: Record<string, unknown>,
    metadata: AudienceRequestMetadata
  ): Promise<AudienceCaptureOutcome> {
    const payload = parsePayload(body);
    if (payload.website) {
      return { status: 202, body: { success: true, message: 'Message received' } };
    }

    const requestId = createRequestId();
    const clientIp = metadata.ipAddress || 'unknown';
    const now = Date.now();
    pruneContactGuards(now);

    if (!consumeRateLimit(clientIp, now)) {
      return {
        status: 429,
        body: {
          success: false,
          error: `Too many requests. Please retry in about ${RATE_LIMIT_RETRY_AFTER_MINUTES} minutes.`,
          requestId,
        },
        headers: { 'Retry-After': String(RATE_LIMIT_RETRY_AFTER_SECONDS) },
      };
    }

    const key = fingerprint(payload, clientIp);
    const previous = recentSubmissionFingerprints.get(key);
    if (previous && now - previous.timestamp <= DUPLICATE_SUBMISSION_WINDOW_MS) {
      recentSubmissionFingerprints.set(key, { timestamp: now, ticketId: previous.ticketId });
      return {
        status: 202,
        body: {
          success: true,
          message: 'Message already received recently.',
          requestId,
          ticketId: previous.ticketId,
        },
      };
    }

    const antiBot = await verifyAntiBot({
      turnstileToken: payload.turnstileToken,
      recaptchaToken: payload.recaptchaToken,
      remoteIp: clientIp,
    });
    if (!antiBot.ok) {
      return {
        status: 400,
        body: {
          success: false,
          error: antiBot.error || 'Anti-bot verification failed. Please refresh and try again.',
          requestId,
        },
      };
    }

    const ticketId = generateContactTicketId();
    await this.repo.create({
      ticketId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      subject: payload.subject,
      message: payload.message,
      source: payload.source,
      ipAddress: clientIp,
      userAgent: metadata.userAgent,
    });
    recentSubmissionFingerprints.set(key, { timestamp: now, ticketId });

    const emailResult = await sendContactAcknowledgementEmail({
      to: payload.email,
      name: payload.name,
      ticketId,
      subject: payload.subject,
    });
    if (!emailResult.sent && !emailResult.skipped) {
      console.error('Contact acknowledgement email failed:', emailResult.error);
    }

    return {
      status: 201,
      body: { success: true, message: 'Message sent successfully', requestId, ticketId },
    };
  }

  parseListOptions(url: URL): ContactListOptions {
    const page = Number.parseInt(url.searchParams.get('page') || '1', 10);
    const limit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
    const statusRaw = clean(url.searchParams.get('status'), 24);
    return {
      page: Number.isFinite(page) ? Math.max(1, page) : 1,
      limit: Number.isFinite(limit) ? Math.min(100, Math.max(1, limit)) : 20,
      status: VALID_STATUS.has(statusRaw as ContactWorkflowStatus)
        ? (statusRaw as ContactWorkflowStatus)
        : 'all',
      query: clean(url.searchParams.get('q'), 200),
    };
  }

  async listInbox(url: URL) {
    return this.repo.list(this.parseListOptions(url));
  }

  async getInboxMessage(id: string) {
    if (!id) throw new ContactServiceError('Invalid contact message id', 400);
    const item = await this.repo.getById(id);
    if (!item) throw new ContactServiceError('Contact message not found', 404);
    return item;
  }

  async updateInboxMessage(
    id: string,
    body: Record<string, unknown>,
    noteAuthor: string
  ) {
    if (!id) throw new ContactServiceError('Invalid contact message id', 400);
    const statusInput = clean(body.status, 20);
    if (statusInput && !VALID_STATUS.has(statusInput as ContactWorkflowStatus)) {
      throw new ContactServiceError('Invalid workflow status', 400);
    }
    const item = await this.repo.update(id, {
      status: statusInput ? (statusInput as ContactWorkflowStatus) : undefined,
      assignee: typeof body.assignee === 'string' ? clean(body.assignee, 120) : undefined,
      note: clean(body.note, 1000),
      noteAuthor: clean(noteAuthor, 120) || 'Admin',
    });
    if (!item) throw new ContactServiceError('Contact message not found', 404);
    return item;
  }
}

export const contactService = new ContactService();
