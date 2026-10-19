import connectDB from '@/lib/db/mongoose';
import AdvertiseInquiry from '@/lib/models/AdvertiseInquiry';
import { normalizeArticleDate } from '@/lib/content/articleDates';
import { listStoredAdvertiseInquiries, updateStoredAdvertiseInquiry } from '@/lib/storage/advertiseInquiriesFile';
import { ADVERTISING_OWNER, ADVERTISING_STATUSES, type AdvertisingStatus, type AdvertisingWorkflow } from '@/lib/advertising/inquiryWorkflow';

export class AdvertisingInboxError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const clean = (value: unknown, length: number) => String(value ?? '').trim().slice(0, length);
const statusOf = (value: unknown): AdvertisingStatus => ADVERTISING_STATUSES.includes(value as AdvertisingStatus) ? value as AdvertisingStatus : 'new';

export function projectAdvertisingInquiry(input: unknown) {
  const row = input as Record<string, unknown>;
  return {
    _id: String(row._id), name: clean(row.name, 120), company: clean(row.company, 160),
    email: clean(row.email, 180), phone: clean(row.phone, 30), campaignType: clean(row.campaignType, 40),
    budget: clean(row.budget, 80), targetLocations: clean(row.targetLocations, 300), timeline: clean(row.timeline, 120),
    message: clean(row.message, 5000), consent: row.consent === true, consentAt: clean(row.consentAt, 40),
    status: statusOf(row.status), assignee: clean(row.assignee, 120) || ADVERTISING_OWNER,
    followUpAt: clean(row.followUpAt, 40), followUpNote: clean(row.followUpNote, 1000),
    createdAt: normalizeArticleDate(row.createdAt), updatedAt: normalizeArticleDate(row.updatedAt),
  };
}

export class AdvertisingInboxService {
  async list(url: URL) {
    const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
    const limit = 20;
    const store = url.searchParams.get('store') === 'file' || !process.env.MONGODB_URI ? 'file' : 'mongo';
    let rows: unknown[];
    let total: number;
    if (store === 'file') {
      ({ rows, total } = await listStoredAdvertiseInquiries(page, limit));
    } else {
      await connectDB();
      [rows, total] = await Promise.all([
        AdvertiseInquiry.find({}).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        AdvertiseInquiry.countDocuments({}),
      ]);
    }
    return { data: rows.map(projectAdvertisingInquiry), store, page, total, totalPages: Math.max(1, Math.ceil(total / limit)), owner: ADVERTISING_OWNER };
  }

  async update(body: Record<string, unknown>, actor: string) {
    const id = clean(body.id, 80);
    const store = body.store;
    if (!['file', 'mongo'].includes(String(store)) || !/^[a-z0-9_-]{8,80}$/i.test(id)) throw new AdvertisingInboxError('Invalid enquiry or storage source.', 400);
    if (!ADVERTISING_STATUSES.includes(body.status as AdvertisingStatus)) throw new AdvertisingInboxError('Invalid workflow status.', 400);
    const expected = new Date(String(body.expectedUpdatedAt || ''));
    if (!Number.isFinite(expected.getTime())) throw new AdvertisingInboxError('Reload the enquiry before saving.', 400);
    const followUp = body.followUpAt ? new Date(String(body.followUpAt)) : null;
    if (followUp && !Number.isFinite(followUp.getTime())) throw new AdvertisingInboxError('Invalid follow-up date.', 400);
    const patch: AdvertisingWorkflow = {
      status: body.status as AdvertisingStatus, assignee: ADVERTISING_OWNER,
      followUpAt: followUp?.toISOString() || '', followUpNote: clean(body.followUpNote, 1000), updatedBy: clean(actor, 120),
    };
    let updated;
    if (store === 'file') {
      updated = await updateStoredAdvertiseInquiry(id, expected.toISOString(), patch);
    } else {
      if (!/^[a-f0-9]{24}$/i.test(id)) throw new AdvertisingInboxError('Invalid database enquiry ID.', 400);
      await connectDB();
      updated = await AdvertiseInquiry.findOneAndUpdate({ _id: id, updatedAt: expected }, { $set: patch }, { new: true, runValidators: true }).lean();
    }
    if (!updated) throw new AdvertisingInboxError('Enquiry changed or no longer exists. Reload before saving.', 409);
    return projectAdvertisingInquiry(updated);
  }
}
export const advertisingInboxService = new AdvertisingInboxService();
