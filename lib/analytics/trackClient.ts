'use client';

const ANALYTICS_SESSION_KEY = 'lokswami_analytics_session_id';
const ANALYTICS_TAB_KEY = 'lokswami_analytics_tab_id';

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

function createSessionId() {
  const random = Math.random().toString(36).slice(2, 12);
  return `sess_${Date.now().toString(36)}${random}`;
}

let inMemorySessionId = '';
let inMemoryTabId = '';

export function _resetSessionIdForTesting(): void {
  inMemorySessionId = '';
  inMemoryTabId = '';
  if (typeof window !== 'undefined' && typeof window.name === 'string' && window.name.startsWith('lok_tab_')) {
    try {
      window.name = '';
    } catch {
      // ignore
    }
  }
}

function getTabInstanceId(): string {
  if (inMemoryTabId) return inMemoryTabId;

  if (
    typeof window !== 'undefined' &&
    typeof window.name === 'string' &&
    /^lok_tab_[a-z0-9]+$/i.test(window.name.trim())
  ) {
    inMemoryTabId = window.name.trim();
    return inMemoryTabId;
  }

  const random = Math.random().toString(36).slice(2, 12);
  inMemoryTabId = `lok_tab_${random}`;

  if (typeof window !== 'undefined') {
    try {
      if (!window.name || !/^lok_tab_[a-z0-9]+$/i.test(window.name)) {
        window.name = inMemoryTabId;
      }
    } catch {
      // window.name write blocked
    }
  }

  return inMemoryTabId;
}

function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^sess_[a-z0-9_\-]{8,120}$/i.test(value.trim());
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return '';

  // 1. If already established in this runtime, return it immediately for stability
  if (inMemorySessionId) {
    return inMemorySessionId;
  }

  const currentTabId = getTabInstanceId();

  let sessionValue: string | null = null;
  let storedTabId: string | null = null;
  let hasSessionStorage = false;
  try {
    sessionValue = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
    storedTabId = window.sessionStorage.getItem(ANALYTICS_TAB_KEY);
    hasSessionStorage = true;
  } catch {
    // sessionStorage restricted or unavailable
  }

  // Detect and cleanup legacy localStorage key
  let legacyLocalValue: string | null = null;
  try {
    legacyLocalValue = window.localStorage.getItem(ANALYTICS_SESSION_KEY);
    if (legacyLocalValue !== null) {
      window.localStorage.removeItem(ANALYTICS_SESSION_KEY);
    }
  } catch {
    // localStorage restricted or unavailable
  }

  // 2. Check existing sessionStorage
  if (isValidSessionId(sessionValue)) {
    // Unbound existing session (e.g. created prior to tab binding or in legacy test) -> adopt and bind
    if (!storedTabId) {
      if (hasSessionStorage) {
        try {
          window.sessionStorage.setItem(ANALYTICS_TAB_KEY, currentTabId);
        } catch {
          // storage blocked
        }
      }
      inMemorySessionId = sessionValue;
      return sessionValue;
    }

    // Legitimately owned by current tab
    if (storedTabId === currentTabId) {
      inMemorySessionId = sessionValue;
      return sessionValue;
    }

    // Otherwise storedTabId !== currentTabId:
    // This sessionStorage was cloned from another tab (e.g. duplicate tab, window.open with opener).
    // Rotate to a fresh session ID for this newly created tab context.
  }

  // 3. If legacy localStorage had a valid ID, migrate it to sessionStorage for this active tab
  if (isValidSessionId(legacyLocalValue)) {
    inMemorySessionId = legacyLocalValue;
    if (hasSessionStorage) {
      try {
        window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, legacyLocalValue);
        window.sessionStorage.setItem(ANALYTICS_TAB_KEY, currentTabId);
      } catch {
        // storage blocked
      }
    }
    return legacyLocalValue;
  }

  // 4. Generate a new session-scoped ID (or rotate cloned session)
  const newId = createSessionId();
  inMemorySessionId = newId;

  if (hasSessionStorage) {
    try {
      window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, newId);
      window.sessionStorage.setItem(ANALYTICS_TAB_KEY, currentTabId);
    } catch {
      // storage blocked
    }
  }

  return newId;
}

function trackGoogleTagManagerEvent(payload: {
  event: string;
  page: string;
  source: string;
  sessionId: string;
  metadata: Record<string, unknown>;
}) {
  if (typeof window === 'undefined') return;

  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: payload.event,
      lokswami_page: payload.page,
      lokswami_source: payload.source,
      lokswami_metadata: payload.metadata,
    });

    if (typeof window.gtag === 'function' && /^[a-z][a-z0-9_]{0,39}$/.test(payload.event)) {
      window.gtag('event', payload.event, {
        page_path: payload.page,
        content_group: payload.source,
        device_category: String(payload.metadata.deviceCategory || ''),
        viewport_bucket: String(payload.metadata.viewportBucket || ''),
        page_type: String(payload.metadata.pageType || ''),
        content_section: String(payload.metadata.section || ''),
        referrer_category: String(payload.metadata.referrerCategory || ''),
        campaign_name: String(payload.metadata.utmCampaign || ''),
      });
    }
  } catch {
    // no-op
  }
}

type TrackClientEventInput = {
  event: string;
  page?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

function getDeviceCategory() {
  if (typeof window === 'undefined') return 'unknown';

  const userAgent = navigator.userAgent.toLowerCase();
  const width = window.innerWidth || 0;

  if (/ipad|tablet/.test(userAgent) || (width >= 768 && width < 1100)) {
    return 'tablet';
  }

  if (/mobi|android|iphone/.test(userAgent) || width < 768) {
    return 'mobile';
  }

  return 'desktop';
}

function getViewportBucket() {
  if (typeof window === 'undefined') return 'unknown';

  const width = window.innerWidth || 0;
  if (width < 640) return 'sm';
  if (width < 1024) return 'md';
  return 'lg';
}

function getBrowserTimeZone() {
  if (typeof Intl === 'undefined') return '';

  try {
    return String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 80);
  } catch {
    return '';
  }
}

function getReferrerMetadata() {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return {
      referrerHost: '',
      referrerCategory: 'direct',
    };
  }

  const rawReferrer = String(document.referrer || '').trim();
  if (!rawReferrer) {
    return {
      referrerHost: '',
      referrerCategory: 'direct',
    };
  }

  try {
    const referrerUrl = new URL(rawReferrer);
    const currentHost = window.location.hostname.replace(/^www\./, '');
    const referrerHost = referrerUrl.hostname.replace(/^www\./, '');

    if (!referrerHost) {
      return {
        referrerHost: '',
        referrerCategory: 'direct',
      };
    }

    if (referrerHost === currentHost) {
      return {
        referrerHost,
        referrerCategory: 'internal',
      };
    }

    if (/(google|bing|yahoo|duckduckgo)\./i.test(referrerHost)) {
      return {
        referrerHost,
        referrerCategory: 'search',
      };
    }

    if (/(facebook|instagram|twitter|x\.com|t\.co|youtube|linkedin)\./i.test(referrerHost)) {
      return {
        referrerHost,
        referrerCategory: 'social',
      };
    }

    if (/(whatsapp|wa\.me|telegram|t\.me)\./i.test(referrerHost)) {
      return {
        referrerHost,
        referrerCategory: 'messaging',
      };
    }

    return {
      referrerHost,
      referrerCategory: 'referral',
    };
  } catch {
    return {
      referrerHost: '',
      referrerCategory: 'direct',
    };
  }
}

function getCampaignMetadata() {
  if (typeof window === 'undefined') {
    return {
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmTerm: '',
      utmContent: '',
    };
  }

  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utmSource: String(params.get('utm_source') || '').trim().slice(0, 120),
      utmMedium: String(params.get('utm_medium') || '').trim().slice(0, 120),
      utmCampaign: String(params.get('utm_campaign') || '').trim().slice(0, 160),
      utmTerm: String(params.get('utm_term') || '').trim().slice(0, 160),
      utmContent: String(params.get('utm_content') || '').trim().slice(0, 160),
    };
  } catch {
    return {
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmTerm: '',
      utmContent: '',
    };
  }
}

function sanitizeClientPage(rawPage?: string): string {
  if (typeof window === 'undefined') return '/';
  const target = String(rawPage || window.location.pathname).trim();
  if (!target) return '/';

  try {
    const origin = window.location.origin || 'https://lokswami.com';
    const url = new URL(target.startsWith('/') ? target : `/${target}`, origin);
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
    try {
      return decodeURI(cleanPath).slice(0, 200);
    } catch {
      return cleanPath.slice(0, 200);
    }
  } catch {
    return (window.location.pathname || '/').slice(0, 200);
  }
}

export function trackClientEvent(input: TrackClientEventInput) {
  if (typeof window === 'undefined') return;

  const event = String(input.event || '').trim().toLowerCase();
  if (!event) return;

  const source = String(input.source || 'web').slice(0, 80);
  const isAnonymousSwipeEvent = source === 'lokswami_swipe';
  const referrer = isAnonymousSwipeEvent
    ? { referrerHost: '', referrerCategory: '' }
    : getReferrerMetadata();
  const campaign = isAnonymousSwipeEvent
    ? { utmSource: '', utmMedium: '', utmCampaign: '', utmTerm: '', utmContent: '' }
    : getCampaignMetadata();
  const payload = {
    event,
    page: sanitizeClientPage(input.page),
    source,
    sessionId: isAnonymousSwipeEvent ? '' : getSessionId(),
    metadata: isAnonymousSwipeEvent
      ? {
          ...input.metadata,
          deviceCategory: getDeviceCategory(),
          viewportBucket: getViewportBucket(),
        }
      : {
          ...input.metadata,
          deviceCategory: getDeviceCategory(),
          viewportBucket: getViewportBucket(),
          browserTimeZone: getBrowserTimeZone(),
          browserLanguage: String(navigator.language || '').slice(0, 32),
          referrerHost: referrer.referrerHost,
          referrerCategory: referrer.referrerCategory,
          utmSource: campaign.utmSource,
          utmMedium: campaign.utmMedium,
          utmCampaign: campaign.utmCampaign,
          utmTerm: campaign.utmTerm,
          utmContent: campaign.utmContent,
        },
  };

  trackGoogleTagManagerEvent(payload);

  const raw = JSON.stringify(payload);

  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([raw], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/track', blob);
      return;
    }
  } catch {
    // no-op
  }

  void fetch('/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
    keepalive: true,
  }).catch(() => undefined);
}
