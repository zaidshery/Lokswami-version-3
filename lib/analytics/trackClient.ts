'use client';

const ANALYTICS_SESSION_KEY = 'lokswami_analytics_session_id';

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

function getSessionId() {
  if (typeof window === 'undefined') return '';

  try {
    const current = window.localStorage.getItem(ANALYTICS_SESSION_KEY);
    if (current) return current;

    const generated = createSessionId();
    window.localStorage.setItem(ANALYTICS_SESSION_KEY, generated);
    return generated;
  } catch {
    return createSessionId();
  }
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
    page: String(input.page || window.location.pathname).slice(0, 200),
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
