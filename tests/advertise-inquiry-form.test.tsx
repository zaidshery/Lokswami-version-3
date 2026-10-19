import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdvertiseInquiryForm from '@/components/advertising/AdvertiseInquiryForm';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/trackClient', () => ({ trackClientEvent: track }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: (selector: (s: { language: string }) => unknown) => selector({ language: 'en' }) }));

beforeEach(() => track.mockClear());
afterEach(() => vi.unstubAllGlobals());

function fill() {
  fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Example Buyer' } });
  fireEvent.change(screen.getByLabelText('Company / business *'), { target: { value: 'Example Shop' } });
  fireEvent.change(screen.getByLabelText('Work email *'), { target: { value: 'buyer@example.com' } });
  fireEvent.change(screen.getByLabelText('Campaign goals and details *'), { target: { value: 'Promote our new shop in Indore.' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('advertising campaign enquiry', () => {
  it('sends qualification fields once, confirms success and excludes contact details from analytics', async () => {
    let resolve!: (value: unknown) => void;
    const fetchMock = vi.fn<(url: string, options: RequestInit) => Promise<unknown>>(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<AdvertiseInquiryForm />);
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fill();
    fireEvent.focus(screen.getByLabelText('Name *'));
    fireEvent.focus(screen.getByLabelText('Work email *'));
    fireEvent.submit(container.querySelector('form')!);
    fireEvent.submit(container.querySelector('form')!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(payload).toEqual(expect.objectContaining({ consent: true, email: 'buyer@example.com', source: 'main-advertise', campaignType: 'display' }));
    resolve({ ok: true, json: async () => ({ success: true }) });
    await screen.findByRole('status');
    expect(screen.getByLabelText('Work email *')).toHaveValue('');
    expect(track.mock.calls.filter(([event]) => event.event === 'advertise_inquiry_start')).toHaveLength(1);
    expect(JSON.stringify(track.mock.calls)).not.toMatch(/buyer@example|Example Shop|Promote our/);
  });

  it('keeps the brief available after an API failure so it can be corrected and retried', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false }) }));
    const { container } = render(<AdvertiseInquiryForm />);
    fill();
    fireEvent.submit(container.querySelector('form')!);
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Work email *')).toHaveValue('buyer@example.com');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send enquiry' })).toBeEnabled());
  });
});
