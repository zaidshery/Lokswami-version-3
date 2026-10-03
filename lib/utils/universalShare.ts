import { getSiteUrl, normalizePublicOrigin, toAbsolutePublicUrl } from './readerContentPaths';
import { getPublicationTypeLabels } from './epaperPublication';

/** Accept only canonical reader content on the configured public origin. */
export function resolveCanonicalShareUrl(value: string, siteOrigin = getSiteUrl()) {
  const origin = normalizePublicOrigin(siteOrigin);
  if (!/^(?:\/main\/|https?:\/\/)/i.test(value) || /\/(?:\.|%2e){1,2}(?:\/|$)/i.test(value.split('?')[0])) return '';
  if (!origin || /[\\\s\u0000-\u001f]/.test(value) || /%(?![\da-f]{2})/i.test(value)) return '';
  try {
    const parsed = new URL(value, origin);
    decodeURIComponent(parsed.pathname + parsed.search);
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.hash) return '';
    const path = parsed.pathname;
    const tokenRoute = /^\/main\/(article|shorts)\/([^/]+)$/.exec(path);
    let allowed: string[];
    if (tokenRoute) {
      const token = decodeURIComponent(tokenRoute[2]);
      if (!token || token === '.' || token === '..' || /[\/\\\u0000-\u001f]/.test(token)) return '';
      allowed = [];
    } else if (path === '/main/videos') {
      allowed = ['video'];
    } else if (path === getPublicationTypeLabels('epaper').publicBasePath) {
      allowed = ['paper', 'city', 'date', 'page', 'story'];
    } else if (path === getPublicationTypeLabels('emagazine').publicBasePath) {
      allowed = ['paper', 'month', 'page', 'story'];
    } else return '';
    for (const [key, entry] of parsed.searchParams) {
      if (!allowed.includes(key) || parsed.searchParams.getAll(key).length !== 1 || !entry.trim() || /[\u0000-\u001f]/.test(entry)) return '';
      if (key === 'page' && !/^[1-9]\d*$/.test(entry)) return '';
    }
    return toAbsolutePublicUrl(`${path}${parsed.search}`, origin);
  } catch { return ''; }
}

export type ShareTarget = { url: string; title?: string; text?: string };
export type SocialSharePlatform = 'whatsapp' | 'facebook' | 'x' | 'telegram' | 'linkedin';

export function buildSocialShareUrl(platform: SocialSharePlatform, input: ShareTarget) {
  const url = resolveCanonicalShareUrl(input.url);
  if (!url) return '';
  const body = input.text?.trim() || input.title?.trim() || '';
  const destinations = {
    whatsapp: 'https://wa.me/',
    facebook: 'https://www.facebook.com/sharer/sharer.php',
    x: 'https://x.com/intent/tweet',
    telegram: 'https://t.me/share/url',
    linkedin: 'https://www.linkedin.com/sharing/share-offsite/',
  };
  const destination = new URL(destinations[platform]);
  if (platform === 'whatsapp') destination.searchParams.set('text', [body, body.split(/\s+/).includes(url) ? '' : url].filter(Boolean).join('\n'));
  else {
    destination.searchParams.set(platform === 'facebook' ? 'u' : 'url', url);
    if ((platform === 'x' || platform === 'telegram') && body) destination.searchParams.set('text', body);
  }
  return destination.toString();
}

export const buildWhatsAppShareUrl = (input: ShareTarget) => buildSocialShareUrl('whatsapp', input);
export const buildFacebookShareUrl = (input: ShareTarget) => buildSocialShareUrl('facebook', input);
export const buildXShareUrl = (input: ShareTarget) => buildSocialShareUrl('x', input);
export const buildTelegramShareUrl = (input: ShareTarget) => buildSocialShareUrl('telegram', input);

export async function shareNative(input: ShareTarget): Promise<'shared' | 'cancelled' | 'unavailable' | 'failed'> {
  const url = resolveCanonicalShareUrl(input.url);
  if (!url) return 'failed';
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unavailable';
  try {
    await navigator.share({ title: input.title, text: input.text || undefined, url });
    return 'shared';
  } catch (error) {
    return error && typeof error === 'object' && 'name' in error && error.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export async function copyCanonicalUrl(value: string): Promise<boolean> {
  const url = resolveCanonicalShareUrl(value);
  if (!url || typeof document === 'undefined') return false;
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch { /* Try the synchronous fallback after permission/API failures. */ }
  const focused = document.activeElement as HTMLElement | null;
  const textarea = document.createElement('textarea');
  textarea.value = url;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(textarea);
  textarea.select();
  try { return typeof document.execCommand === 'function' && document.execCommand('copy'); }
  catch { return false; }
  finally { textarea.remove(); focused?.focus({ preventScroll: true }); }
}
