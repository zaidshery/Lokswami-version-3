import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContactPage from '@/app/(reader)/main/contact/page';

const trackClientEventMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: trackClientEventMock,
}));

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: () => ({ language: 'en' }),
}));

vi.mock('@/components/forms/TurnstileWidget', () => ({
  default: ({ onTokenChange }: { onTokenChange: (token: string) => void }) => {
    return (
      <div data-testid="turnstile-mock">
        <button
          type="button"
          onClick={() => onTokenChange('test-turnstile-token')}
        >
          Verify Captcha
        </button>
      </div>
    );
  },
}));

describe('ContactPage Telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT emit redundant contact_page_view on mount', () => {
    render(<ContactPage />);

    // No event should be emitted purely on mount
    expect(trackClientEventMock).not.toHaveBeenCalled();
    const calls = trackClientEventMock.mock.calls;
    expect(calls.some(([arg]) => arg?.event === 'contact_page_view')).toBe(false);
  });

  it('emits contact_form_start on first user interaction with form', () => {
    render(<ContactPage />);

    const nameInput = screen.getByLabelText(/Full Name/i);
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });

    expect(trackClientEventMock).toHaveBeenCalledTimes(1);
    expect(trackClientEventMock).toHaveBeenCalledWith({
      event: 'contact_form_start',
      page: '/main/contact',
      source: 'contact_form',
    });

    // Subsequent typing should not re-emit start
    fireEvent.change(nameInput, { target: { value: 'Jane Doe 2' } });
    expect(trackClientEventMock).toHaveBeenCalledTimes(1);
  });

  it('emits contact_validation_fail with fields array when invalid form is submitted', () => {
    render(<ContactPage />);

    const submitButton = screen.getByRole('button', { name: /Send Message/i });
    fireEvent.click(submitButton);

    expect(trackClientEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'contact_validation_fail',
        page: '/main/contact',
        source: 'contact_form',
        metadata: expect.objectContaining({
          fields: expect.arrayContaining(['name', 'email', 'message', 'consent']),
        }),
      })
    );
  });

  it('emits contact_submit_success when form submission succeeds', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Message sent',
        ticketId: 'TCK-1001',
      }),
    });

    render(<ContactPage />);

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Message/i), {
      target: { value: 'This is a valid test message with more than ten characters.' },
    });
    fireEvent.click(
      screen.getByLabelText(/I agree to be contacted regarding this request/i)
    );

    const submitButton = screen.getByRole('button', { name: /Send Message/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(trackClientEventMock).toHaveBeenCalledWith({
        event: 'contact_submit_success',
        page: '/main/contact',
        source: 'contact_form',
        metadata: { ticketId: 'TCK-1001' },
      });
    });
  });

  it('emits contact_submit_fail when form submission fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: 'Server error processing contact form',
      }),
    });

    render(<ContactPage />);

    fireEvent.change(screen.getByLabelText(/Full Name/i), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/i), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Message/i), {
      target: { value: 'This is a valid test message with more than ten characters.' },
    });
    fireEvent.click(
      screen.getByLabelText(/I agree to be contacted regarding this request/i)
    );

    const submitButton = screen.getByRole('button', { name: /Send Message/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(trackClientEventMock).toHaveBeenCalledWith({
        event: 'contact_submit_fail',
        page: '/main/contact',
        source: 'contact_form',
        metadata: {
          status: 500,
          reason: 'Server error processing contact form',
        },
      });
    });
  });
});
