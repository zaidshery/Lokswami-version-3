const FALLBACK_SITE_URL = 'https://lokswami.com';

/** Only a public reader origin belongs here; paths, queries and credentials do not. */
export function normalizePublicOrigin(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function getSiteUrl(value = process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL) {
  const origin = normalizePublicOrigin(value);
  if (!origin) return FALLBACK_SITE_URL;
  const hostname = new URL(origin).hostname;
  if (process.env.NODE_ENV === 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    return FALLBACK_SITE_URL;
  }
  return origin;
}

/** Join generated reader paths only. Never resolve an arbitrary redirect destination. */
export function toAbsolutePublicUrl(path: string, siteOrigin = getSiteUrl()): string {
  const origin = normalizePublicOrigin(siteOrigin);
  if (!origin || !/^\/main(?:[/?#]|$)/.test(path) || /[\\\u0000-\u0020]/u.test(path)) return '';
  const url = new URL(path, origin);
  if (url.origin !== origin || !/^\/main(?:\/|$)/.test(url.pathname)) return '';
  return url.toString();
}

export function encodePublicPathToken(value?: string): string {
  const token = String(value || '').trim();
  if (!token || token === '.' || token === '..' || /[\\/\u0000-\u001f\u007f]/u.test(token)) return '';
  try {
    return encodeURIComponent(token);
  } catch {
    return '';
  }
}
