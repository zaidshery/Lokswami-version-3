import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('fs/promises', () => ({ default: { readFile: mocks.read } }));
vi.mock('@/lib/storage/atomicStorage', () => ({ writeJsonFileAtomically: mocks.write }));
import { createStoredAdvertiseInquiry, listStoredAdvertiseInquiries, updateStoredAdvertiseInquiry } from '@/lib/storage/advertiseInquiriesFile';
let data: unknown[];
beforeEach(() => {
  vi.clearAllMocks(); data = [];
  mocks.read.mockImplementation(async () => JSON.stringify(data));
  mocks.write.mockImplementation(async (_path, rows) => { data = JSON.parse(JSON.stringify(rows)); });
});
const input = { name: 'Buyer', company: 'Shop', email: 'buyer@example.test', campaignType: 'display', message: 'Campaign information', source: 'main-advertise', consent: true };
describe('advertising recovery file', () => {
  it('serializes concurrent captures and assigns Zaid without losing a lead', async () => {
    await Promise.all([createStoredAdvertiseInquiry(input), createStoredAdvertiseInquiry(input)]);
    const result = await listStoredAdvertiseInquiries(1, 20);
    expect(result.total).toBe(2); expect(result.rows.every((row) => row.assignee === 'Zaid')).toBe(true);
  });
  it('rejects stale updates and never overwrites corrupt recovery data', async () => {
    const row = await createStoredAdvertiseInquiry(input);
    const patch = { status: 'qualified' as const, assignee: 'Zaid', followUpAt: '', followUpNote: 'Call back', updatedBy: 'Zaid' };
    expect(await updateStoredAdvertiseInquiry(row._id, '2020-01-01T00:00:00.000Z', patch)).toBeNull();
    expect(await updateStoredAdvertiseInquiry(row._id, row.updatedAt, patch)).toMatchObject(patch);
    mocks.write.mockClear(); mocks.read.mockResolvedValue('{broken');
    await expect(createStoredAdvertiseInquiry(input)).rejects.toThrow();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
