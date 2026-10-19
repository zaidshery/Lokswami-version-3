'use client';

export const GOOGLE_CONSENT_KEY = 'lokswami_google_analytics_consent_v1';
export type GoogleConsent = 'granted' | 'denied';

export function readGoogleConsent(): GoogleConsent | null {
  try {
    const value = window.localStorage.getItem(GOOGLE_CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function saveGoogleConsent(value: GoogleConsent): boolean {
  try {
    window.localStorage.setItem(GOOGLE_CONSENT_KEY, value);
    return readGoogleConsent() === value;
  } catch {
    return false;
  }
}
