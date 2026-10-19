import React, { StrictMode } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import GoogleAnalyticsConsent from '@/components/analytics/GoogleAnalyticsConsent';
import { GOOGLE_CONSENT_KEY, readGoogleConsent, saveGoogleConsent } from '@/lib/analytics/googleConsent';

const state = vi.hoisted(() => ({ pathname: '/main', language: 'en' }));
const track = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('next/script', () => ({ default: ({ src }: { src: string }) => <div data-testid="google-script" data-src={src} /> }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: (selector: (s: typeof state) => unknown) => selector(state) }));
vi.mock('@/lib/analytics/trackClient', () => ({ trackClientEvent: track }));
vi.mock('@/components/seo/WebVitalsBeacon', () => ({ default: () => null }));

beforeEach(() => {
  localStorage.clear();
  state.pathname = '/main';
  window.dataLayer = [];
  delete window.gtag;
  track.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('Google analytics consent', () => {
  it('loads no tag and sends no Google page view before consent or after refusal', () => {
    render(<GoogleAnalyticsConsent gtmId="GTM-TEST" ga4Id="G-TEST" />);
    expect(screen.queryByTestId('google-script')).toBeNull();
    expect(track).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Decline analytics' }));
    expect(readGoogleConsent()).toBe('denied');
    expect(screen.queryByTestId('google-script')).toBeNull();
    expect(window.dataLayer).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Analytics settings' }));
    expect(screen.getByRole('button', { name: 'Allow analytics' })).toBeVisible();
  });

  it('uses only GTM, initializes consent before events, and measures the accepted page once', () => {
    const { rerender } = render(<StrictMode><GoogleAnalyticsConsent gtmId="GTM-TEST" ga4Id="G-TEST" /></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: 'Allow analytics' }));
    expect(screen.getByTestId('google-script')).toHaveAttribute('data-src', 'https://www.googletagmanager.com/gtm.js?id=GTM-TEST');
    const commands = window.dataLayer as unknown as Array<ArrayLike<unknown>>;
    expect(Array.from(commands[0])).toEqual(['consent', 'default', expect.objectContaining({ analytics_storage: 'denied', ad_storage: 'denied' })]);
    expect(Array.from(commands[1])).toEqual(['consent', 'update', expect.objectContaining({ analytics_storage: 'granted', ad_storage: 'denied' })]);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ event: 'page_view', page: '/main', destination: 'google' }));
    rerender(<StrictMode><GoogleAnalyticsConsent gtmId="GTM-TEST" ga4Id="G-TEST" /></StrictMode>);
    expect(track).toHaveBeenCalledTimes(1);
    state.pathname = '/main/advertise';
    rerender(<StrictMode><GoogleAnalyticsConsent gtmId="GTM-TEST" ga4Id="G-TEST" /></StrictMode>);
    expect(track).toHaveBeenCalledTimes(2);
    state.pathname = '/admin';
    rerender(<StrictMode><GoogleAnalyticsConsent gtmId="GTM-TEST" ga4Id="G-TEST" /></StrictMode>);
    expect(track).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('google-script')).toBeNull();
    state.pathname = '/main/advertise';
    rerender(<StrictMode><GoogleAnalyticsConsent gtmId="GTM-TEST" ga4Id="G-TEST" /></StrictMode>);
    expect(track).toHaveBeenCalledTimes(3);
    expect(track).toHaveBeenLastCalledWith(expect.objectContaining({ event: 'page_view', page: '/main/advertise', destination: 'google' }));
    rerender(<StrictMode><GoogleAnalyticsConsent gtmId="GTM-TEST" ga4Id="G-TEST" /></StrictMode>);
    expect(track).toHaveBeenCalledTimes(3);
  });

  it('restores granted consent in direct mode without automatic duplicate page views', () => {
    saveGoogleConsent('granted');
    render(<StrictMode><GoogleAnalyticsConsent gtmId="" ga4Id="G-TEST" /></StrictMode>);
    expect(screen.getByTestId('google-script')).toHaveAttribute('data-src', 'https://www.googletagmanager.com/gtag/js?id=G-TEST');
    const config = (window.dataLayer as unknown as Array<ArrayLike<unknown>>).find((entry) => entry[0] === 'config');
    expect(config && Array.from(config)).toEqual(['config', 'G-TEST', expect.objectContaining({ send_page_view: false })]);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('fails closed when preferences cannot be saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<GoogleAnalyticsConsent gtmId="GTM-TEST" ga4Id="" />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow analytics' }));
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByTestId('google-script')).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it('rejects old or malformed stored values and hides controls when not configured', () => {
    localStorage.setItem(GOOGLE_CONSENT_KEY, 'true');
    expect(readGoogleConsent()).toBeNull();
    const { container } = render(<GoogleAnalyticsConsent gtmId="" ga4Id="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
