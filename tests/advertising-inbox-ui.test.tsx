import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdvertisingInquiryInbox from '@/components/admin/AdvertisingInquiryInbox';
vi.mock('@/lib/auth/clientToken', () => ({ getAuthHeader: () => ({}) }));
afterEach(() => vi.unstubAllGlobals());
describe('advertising follow-up UI', () => {
  it('loads the assigned inbox, saves a next action and offers a separate recovery source', async () => {
    const row = { _id: 'a'.repeat(24), name: 'Buyer', company: 'Shop', email: 'buyer@example.test', campaignType: 'display', message: 'Test brief', status: 'new', assignee: 'Zaid', consent: false, createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', followUpAt: '', followUpNote: '' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, store: 'mongo', data: [row], totalPages: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<AdvertisingInquiryInbox />);
    fireEvent.click(await screen.findByText('Shop · display · new'));
    expect(screen.getByText(/Legacy enquiry/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'qualified' } });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { ...row, status: 'qualified', updatedAt: '2026-10-19T00:00:00.000Z' } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    await waitFor(() => expect(fetchMock.mock.calls[1][1].method).toBe('PATCH'));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ store: 'mongo', expectedUpdatedAt: row.updatedAt, status: 'qualified' });
    expect(await screen.findByText('Shop · display · qualified')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'file' } });
    await waitFor(() => expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('store=file'));
  });
});
