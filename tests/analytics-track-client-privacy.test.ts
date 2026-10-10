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

  describe('Per-tab session isolation and cloned sessionStorage rotation (P2-B)', () => {
    it('CASE T1: guarantees same runtime stability across repeated calls in the active context', () => {
      const id1 = getSessionId();
      const id2 = getSessionId();
      const id3 = getSessionId();

      expect(id1).toMatch(/^sess_[a-z0-9_\-]{8,120}$/i);
      expect(id2).toBe(id1);
      expect(id3).toBe(id1);
    });

    it('CASE T2: preserves existing valid session in the legitimate current tab across navigations', () => {
      const legitSession = 'sess_legit_current_tab_12345';
      const legitTab = 'lok_tab_legit1';
      sessionStore['lokswami_analytics_session_id'] = legitSession;
      sessionStore['lokswami_analytics_tab_id'] = legitTab;
      window.name = legitTab;

      const id1 = getSessionId();
      const id2 = getSessionId();

      expect(id1).toBe(legitSession);
      expect(id2).toBe(legitSession);
      expect(sessionStore['lokswami_analytics_session_id']).toBe(legitSession);
    });

    it('CASE T3: rotates session ID in a simulated cloned tab runtime with copied sessionStorage', () => {
      // 1. Original Tab (Tab 1) initializes its session
      const tab1Session = getSessionId();
      const tab1Token = sessionStore['lokswami_analytics_tab_id'];
      expect(tab1Session).toMatch(/^sess_[a-z0-9_\-]{8,120}$/i);
      expect(tab1Token).toBeTruthy();

      // 2. Tab 2 is created: browser copies sessionStorage from Tab 1, but Tab 2 is a new browsing context
      // Simulate fresh tab runtime with empty window.name and fresh module memory
      _resetSessionIdForTesting();
      window.name = '';

      // Tab 2 has copied sessionStorage containing Tab 1's values
      expect(sessionStore['lokswami_analytics_session_id']).toBe(tab1Session);
      expect(sessionStore['lokswami_analytics_tab_id']).toBe(tab1Token);

      // Tab 2 requests its session ID: detects copied storage from Tab 1 and rotates
      const tab2Session = getSessionId();
      expect(tab2Session).toMatch(/^sess_[a-z0-9_\-]{8,120}$/i);
      expect(tab2Session).not.toBe(tab1Session);

      // Both remain independently stable after initialization
      const tab2Repeated = getSessionId();
      expect(tab2Repeated).toBe(tab2Session);
      expect(sessionStore['lokswami_analytics_session_id']).toBe(tab2Session);
      expect(sessionStore['lokswami_analytics_tab_id']).not.toBe(tab1Token);
    });

    it('CASE T4: prevents session merging in opener-created same-origin browsing contexts', () => {
      const openerSession = 'sess_opener_origin_111111';
      const openerTab = 'lok_tab_opener_99';
      sessionStore['lokswami_analytics_session_id'] = openerSession;
      sessionStore['lokswami_analytics_tab_id'] = openerTab;

      // Child tab created via window.open starts with window.name = '' and fresh runtime
      window.name = '';
      _resetSessionIdForTesting();

      const childTabSession = getSessionId();
      expect(childTabSession).not.toBe(openerSession);
      expect(childTabSession).toMatch(/^sess_[a-z0-9_\-]{8,120}$/i);

      // Subsequent child calls remain stable with child session
      expect(getSessionId()).toBe(childTabSession);
    });

    it('CASE T5: migrates valid legacy localStorage ID once and cleans up persistent storage', () => {
      const legacyId = 'sess_valid_legacy_mig_555';
      localStore['lokswami_analytics_session_id'] = legacyId;

      const migratedId = getSessionId();
      expect(migratedId).toBe(legacyId);
      expect(localStore['lokswami_analytics_session_id']).toBeUndefined();
      expect(sessionStore['lokswami_analytics_session_id']).toBe(legacyId);
      expect(sessionStore['lokswami_analytics_tab_id']).toBeTruthy();
    });

    it('CASE T6: preserves session in-memory fallback on sessionStorage write failure without random churn', () => {
      const legacyId = 'sess_write_fail_legacy_777';
      localStore['lokswami_analytics_session_id'] = legacyId;

      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: {
          getItem: vi.fn((key: string) => sessionStore[key] ?? null),
          setItem: vi.fn(() => {
            throw new Error('QuotaExceededError');
          }),
          removeItem: vi.fn(),
          clear: vi.fn(),
        },
      });

      const first = getSessionId();
      const second = getSessionId();
      const third = getSessionId();

      expect(first).toBe(legacyId);
      expect(second).toBe(first);
      expect(third).toBe(first);
    });

    it('CASE T7: handles completely restricted storage gracefully with stable in-memory identity', () => {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: {
          getItem: vi.fn(() => {
            throw new Error('Access denied');
          }),
          setItem: vi.fn(() => {
            throw new Error('Access denied');
          }),
        },
      });

      const r1 = getSessionId();
      const r2 = getSessionId();

      expect(r1).toMatch(/^sess_[a-z0-9_\-]{8,120}$/i);
      expect(r2).toBe(r1);
    });

    it('CASE T8: never reintroduces persistent identity in localStorage, cookies, or IndexedDB', () => {
      getSessionId();

      expect(window.localStorage.setItem).not.toHaveBeenCalled();
      expect(localStore['lokswami_analytics_session_id']).toBeUndefined();
      expect(document.cookie).not.toContain('lokswami_analytics');
    });
  });
});
