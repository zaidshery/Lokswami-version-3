import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ session: vi.fn(), connect: vi.fn(), find: vi.fn(), count: vi.fn(), update: vi.fn(), listFile: vi.fn(), updateFile: vi.fn() }));
vi.mock('@/lib/auth/admin', () => ({ getAdminSession: mocks.session }));
vi.mock('@/lib/api/adminRoute', () => ({ withAdminMutation: (handler: unknown) => handler }));
vi.mock('@/lib/db/mongoose', () => ({ default: mocks.connect }));
vi.mock('@/lib/models/AdvertiseInquiry', () => ({ default: { find: mocks.find, countDocuments: mocks.count, findOneAndUpdate: mocks.update } }));
vi.mock('@/lib/storage/advertiseInquiriesFile', () => ({ listStoredAdvertiseInquiries: mocks.listFile, updateStoredAdvertiseInquiry: mocks.updateFile }));
import { GET, PATCH } from '@/app/api/admin/advertising-enquiries/route';
import { advertisingInboxService } from '@/lib/server/audience/advertisingInboxService';

const row = { _id: 'a'.repeat(24), name: 'Buyer', company: 'Shop', email: 'buyer@example.test', createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', ipAddress: 'private-ip', userAgent: 'private-agent', consent: true };
const body = { id: row._id, store: 'mongo', expectedUpdatedAt: row.updatedAt, status: 'qualified', assignee: 'client override', followUpAt: '2026-10-20T12:00:00Z', followUpNote: 'Confirm availability' };
const request = (payload = body) => new NextRequest('https://cms.example.test/api/admin/advertising-enquiries', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('MONGODB_URI', 'mongodb://isolated-test');
  mocks.session.mockResolvedValue({ id: 'owner', role: 'super_admin', name: 'Zaid' });
  mocks.listFile.mockResolvedValue({ rows: [row], total: 1 });
  const chain = { sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([row]) };
  mocks.find.mockReturnValue(chain); mocks.count.mockResolvedValue(1);
  mocks.update.mockReturnValue({ lean: async () => ({ ...row, ...body }) });
});
afterEach(() => vi.unstubAllEnvs());

describe('advertising staff inbox', () => {
  it.each([null, { role: 'reader' }, { role: 'reporter' }, { role: 'copy_editor' }])('blocks unprivileged readers and writers (%s)', async (actor) => {
    mocks.session.mockResolvedValue(actor);
    expect((await GET(new NextRequest('https://cms.example.test/api/admin/advertising-enquiries'))).status).toBe(actor ? 403 : 401);
    expect((await PATCH(request())).status).toBe(actor ? 403 : 401);
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('assigns unassigned enquiries to Zaid and omits raw request metadata from the API', async () => {
    const response = await GET(new NextRequest('https://cms.example.test/api/admin/advertising-enquiries'));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data[0]).toMatchObject({ assignee: 'Zaid', status: 'new', consent: true });
    expect(result.data[0]).not.toHaveProperty('ipAddress'); expect(result.data[0]).not.toHaveProperty('userAgent');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('preserves Mongo Date milliseconds required for optimistic concurrency', async () => {
    mocks.listFile.mockResolvedValue({ rows: [{ ...row, updatedAt: new Date('2026-10-18T00:00:00.123Z') }], total: 1 });
    const result = await advertisingInboxService.list(new URL('https://cms.example.test/?store=file'));
    expect(result.data[0].updatedAt).toBe('2026-10-18T00:00:00.123Z');
  });
  it('keeps recovery-file selection explicit and never silently writes to a different store', async () => {
    const result = await advertisingInboxService.list(new URL('https://cms.example.test/?store=file'));
    expect(result.store).toBe('file'); expect(mocks.connect).not.toHaveBeenCalled();
    mocks.connect.mockRejectedValue(new Error('offline'));
    expect((await PATCH(request())).status).toBe(503);
    expect(mocks.updateFile).not.toHaveBeenCalled();
  });
  it('uses the saved-version condition, assigned owner and authenticated updater', async () => {
    expect((await PATCH(request())).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ _id: row._id, updatedAt: new Date(row.updatedAt) }, { $set: expect.objectContaining({ assignee: 'Zaid', status: 'qualified', updatedBy: 'Zaid' }) }, { new: true, runValidators: true });
    mocks.update.mockReturnValue({ lean: async () => null });
    expect((await PATCH(request())).status).toBe(409);
  });
  it('validates workflow fields before touching storage and preserves legacy unknown consent', async () => {
    expect((await PATCH(request({ ...body, status: 'invented' }))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.listFile.mockResolvedValue({ rows: [{ ...row, consent: undefined }], total: 1 });
    expect((await advertisingInboxService.list(new URL('https://cms.example.test/?store=file'))).data[0].consent).toBe(false);
  });
});
