import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetSessionIdForTesting,
  getSessionId,
  trackClientEvent,
} from '@/lib/analytics/trackClient';

describe('trackClient privacy and session migration', () => {
  const originalSessionStorage = window.sessionStorage;
  const originalLocalStorage = window.localStorage;

  let sessionStore: Record<string, string> = {};
  let localStore: Record<string, string> = {};

  beforeEach(() => {
    sessionStore = {};
    localStore = {};
    _resetSessionIdForTesting();

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => sessionStore[key] ?? null),
        setItem: vi.fn((key: string, val: string) => {
          sessionStore[key] = String(val);
        }),
        removeItem: vi.fn((key: string) => {
          delete sessionStore[key];
        }),
        clear: vi.fn(() => {
          sessionStore = {};
        }),
      },
    });

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => localStore[key] ?? null),
        setItem: vi.fn((key: string, val: string) => {
          localStore[key] = String(val);
        }),
        removeItem: vi.fn((key: string) => {
          delete localStore[key];
        }),
        clear: vi.fn(() => {
          localStore = {};
        }),
      },
    });
  });

  afterEach(() => {
    _resetSessionIdForTesting();
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage,
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('generates a new session ID and stores it in sessionStorage, leaving localStorage empty', () => {
    const id = getSessionId();

    expect(id).toMatch(/^sess_[a-z0-9_\-]{8,120}$/i);
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      'lokswami_analytics_session_id',
      id
    );
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('lokswami_analytics_session_id')).toBeNull();
  });

  it('migrates a valid legacy localStorage session ID into sessionStorage and removes it from localStorage', () => {
    const legacyId = 'sess_abcdef1234567890abcdef12';
    localStore['lokswami_analytics_session_id'] = legacyId;

    const id = getSessionId();

    expect(id).toBe(legacyId);
    expect(window.sessionStorage.setItem).toHaveBeenCalledWith(
      'lokswami_analytics_session_id',
      legacyId
    );
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(
      'lokswami_analytics_session_id'
    );
    expect(localStore['lokswami_analytics_session_id']).toBeUndefined();
  });

  it('preserves the migrated legacy ID in memory when sessionStorage.setItem throws and reuses it consistently', () => {
    const legacyId = 'sess_fallback_legacy_id_999999';
    localStore['lokswami_analytics_session_id'] = legacyId;

    // Simulate sessionStorage write failure (e.g. quota exceeded or strict sandbox)
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => sessionStore[key] ?? null),
        setItem: vi.fn(() => {
          throw new Error('QuotaExceededError: storage write failed');
        }),
        removeItem: vi.fn((key: string) => {
          delete sessionStore[key];
        }),
        clear: vi.fn(() => {
          sessionStore = {};
        }),
      },
    });

    // First call: reads legacy ID from localStorage, deletes it, catches sessionStorage throw
    const firstCallId = getSessionId();
    expect(firstCallId).toBe(legacyId);
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('lokswami_analytics_session_id');
    expect(localStore['lokswami_analytics_session_id']).toBeUndefined();

    // Second call: localStorage is now empty, sessionStorage cannot store it, but in-memory fallback preserves it
    const secondCallId = getSessionId();
    expect(secondCallId).toBe(legacyId);

    // Third call: remains identical for module lifetime, never splitting the session
    const thirdCallId = getSessionId();
    expect(thirdCallId).toBe(legacyId);

    // Assert no persistent localStorage tracking was reintroduced
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
    expect(localStore['lokswami_analytics_session_id']).toBeUndefined();
  });

  it('cleans up malformed legacy localStorage value and generates a fresh session ID', () => {
    localStore['lokswami_analytics_session_id'] = 'malformed_value_not_sess';

    const id = getSessionId();

    expect(id).toMatch(/^sess_[a-z0-9_\-]{8,120}$/i);
    expect(id).not.toBe('malformed_value_not_sess');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(
      'lokswami_analytics_session_id'
    );
    expect(localStore['lokswami_analytics_session_id']).toBeUndefined();
  });

  it('uses existing valid sessionStorage ID and cleans up any residual localStorage key', () => {
    const existingSession = 'sess_active_tab_session_99';
    sessionStore['lokswami_analytics_session_id'] = existingSession;
    localStore['lokswami_analytics_session_id'] = 'sess_stale_local_session_88';

    const id = getSessionId();

    expect(id).toBe(existingSession);
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(
      'lokswami_analytics_session_id'
    );
    expect(localStore['lokswami_analytics_session_id']).toBeUndefined();
  });

  it('falls back to in-memory session ID when sessionStorage access throws', () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => {
          throw new Error('SecurityError: The operation is insecure.');
        }),
        setItem: vi.fn(() => {
          throw new Error('SecurityError');
        }),
      },
    });

    const id1 = getSessionId();
    expect(id1).toMatch(/^sess_[a-z0-9_\-]{8,120}$/i);

    const id2 = getSessionId();
    expect(id2).toBe(id1);
  });

  it('strips query strings and hashes from input.page and transmits clean pathname in beacon body', async () => {
    const sendBeacon = vi.fn();
    Object.defineProperty(navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeacon,
    });

    trackClientEvent({
      event: 'page_view',
      page: '/main/search?q=secret+query#target',
    });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe('/api/analytics/track');

    // Deserialize actual Blob transmitted via sendBeacon
    expect(blob).toBeInstanceOf(Blob);
    const rawText = await blob.text();
    const parsed = JSON.parse(rawText);

    // Assert exact sanitized page field
    expect(parsed.page).toBe('/main/search');

    // Assert sensitive query parameters and hash fragments are absent from transmitted body
    expect(rawText).not.toContain('?q=');
    expect(rawText).not.toContain('secret+query');
    expect(rawText).not.toContain('#target');
  });
});
