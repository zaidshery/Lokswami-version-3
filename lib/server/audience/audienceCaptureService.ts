import {
  audienceRepository,
  type AudienceRepository,
} from './audienceRepository';
import type {
  AdvertiseInquiryInput,
  AudienceCaptureOutcome,
  AudienceRequestMetadata,
  CareerApplicationInput,
  MarketingLeadInput,
} from './audienceTypes';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+()\-\s0-9]{7,20}$/;
const SOURCE_REGEX = /^[a-z0-9-]{2,40}$/;
const LEAD_SOURCE_REGEX = /^[a-z0-9_\-]{2,80}$/;
const ALLOWED_SUBSCRIPTION_SOURCES = new Set(['main', 'epaper']);
const CAMPAIGN_TYPES = new Set(['display', 'sponsored', 'video', 'mixed']);

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanMessage(value: unknown) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, 5000);
}

function normalizeInterests(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => clean(entry, 50).toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}

function validation(error: string): AudienceCaptureOutcome {
  return { status: 400, body: { success: false, error } };
}

function isValidUrl(value: string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class AudienceCaptureService {
  constructor(private readonly repo: AudienceRepository = audienceRepository) {}

  async subscribe(body: Record<string, unknown>): Promise<AudienceCaptureOutcome> {
    const email = String(body.email || '').trim().toLowerCase();
    const source = String(body.source || 'main').trim().toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      return validation('Please enter a valid email address');
    }
    if (!ALLOWED_SUBSCRIPTION_SOURCES.has(source)) {
      return validation('Invalid source');
    }
    if (!process.env.MONGODB_URI) {
      return {
        status: 503,
        body: { success: false, error: 'Subscription service is not configured yet' },
      };
    }

    const result = await this.repo.subscribe(email, source);
    return result === 'existing'
      ? {
          status: 200,
          body: {
            success: true,
            message: 'You are already subscribed with this email',
          },
        }
      : {
          status: 201,
          body: { success: true, message: 'Subscription successful' },
        };
  }

  async captureMarketingLead(body: Record<string, unknown>): Promise<AudienceCaptureOutcome> {
    const email = clean(body.email, 180).toLowerCase();
    const consent = Boolean(body.consent);
    if (!consent) return validation('Consent is required');
    if (!EMAIL_REGEX.test(email)) {
      return validation('Please provide a valid email address');
    }

    const sourceInput = clean(body.source, 80).toLowerCase();
    const campaignInput = clean(body.campaign, 80).toLowerCase();
    const input: MarketingLeadInput = {
      email,
      name: clean(body.name, 120),
      interests: normalizeInterests(body.interests),
      source: LEAD_SOURCE_REGEX.test(sourceInput) ? sourceInput : 'engagement-popup',
      campaign: LEAD_SOURCE_REGEX.test(campaignInput) ? campaignInput : 'daily-alerts',
      wantsDailyAlerts: Boolean(body.wantsDailyAlerts),
      consent,
    };

    await this.repo.saveMarketingLead(input);
    return {
      status: 200,
      body: { success: true, message: 'Preference saved successfully' },
    };
  }

  async captureAdvertiseInquiry(
    body: Record<string, unknown>,
    metadata: AudienceRequestMetadata
  ): Promise<AudienceCaptureOutcome> {
    const sourceInput = clean(body.source, 40).toLowerCase();
    const campaignTypeInput = clean(body.campaignType, 40).toLowerCase();
    const website = clean(body.website, 100);
    const input: AdvertiseInquiryInput = {
      name: clean(body.name, 120),
      company: clean(body.company, 160),
      email: clean(body.email, 180).toLowerCase(),
      phone: clean(body.phone, 20),
      budget: clean(body.budget, 80),
      campaignType: CAMPAIGN_TYPES.has(campaignTypeInput) ? campaignTypeInput : 'display',
      targetLocations: clean(body.targetLocations, 300),
      message: cleanMessage(body.message),
      source: SOURCE_REGEX.test(sourceInput) ? sourceInput : 'main-advertise',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    };

    if (input.name.length < 2) return validation('Name must be at least 2 characters long');
    if (input.company.length < 2) {
      return validation('Company name must be at least 2 characters long');
    }
    if (!EMAIL_REGEX.test(input.email)) return validation('Please provide a valid email address');
    if (input.phone && !PHONE_REGEX.test(input.phone)) {
      return validation('Please provide a valid phone number');
    }
    if (input.message.length < 10) return validation('Message must be at least 10 characters long');
    if (website) {
      return { status: 202, body: { success: true, message: 'Inquiry received' } };
    }

    await this.repo.createAdvertiseInquiry(input);
    return {
      status: 201,
      body: { success: true, message: 'Inquiry submitted successfully' },
    };
  }

  async captureCareerApplication(
    body: Record<string, unknown>,
    metadata: AudienceRequestMetadata
  ): Promise<AudienceCaptureOutcome> {
    const sourceInput = clean(body.source, 40).toLowerCase();
    const website = clean(body.website, 100);
    const input: CareerApplicationInput = {
      name: clean(body.name, 120),
      email: clean(body.email, 180).toLowerCase(),
      phone: clean(body.phone, 20),
      role: clean(body.role, 120),
      experience: clean(body.experience, 80),
      portfolioUrl: clean(body.portfolioUrl, 500),
      message: cleanMessage(body.message),
      source: SOURCE_REGEX.test(sourceInput) ? sourceInput : 'main-careers',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    };

    if (input.name.length < 2) return validation('Name must be at least 2 characters long');
    if (!EMAIL_REGEX.test(input.email)) return validation('Please provide a valid email address');
    if (input.phone && !PHONE_REGEX.test(input.phone)) {
      return validation('Please provide a valid phone number');
    }
    if (input.role.length < 2) return validation('Please select a role');
    if (!isValidUrl(input.portfolioUrl)) {
      return validation('Please provide a valid portfolio URL');
    }
    if (input.message.length < 10) return validation('Message must be at least 10 characters long');
    if (website) {
      return { status: 202, body: { success: true, message: 'Application received' } };
    }

    await this.repo.createCareerApplication(input);
    return {
      status: 201,
      body: { success: true, message: 'Application submitted successfully' },
    };
  }
}

export const audienceCaptureService = new AudienceCaptureService();

export function getAudienceRequestMetadata(headers: Headers): AudienceRequestMetadata {
  const forwardedFor = headers.get('x-forwarded-for');
  const ipAddress = forwardedFor
    ? forwardedFor.split(',')[0]?.trim().slice(0, 120) || ''
    : clean(headers.get('x-real-ip'), 120);
  return {
    ipAddress,
    userAgent: clean(headers.get('user-agent'), 500),
  };
}
