import { stripArticleHtml, getSiteUrl } from '@/lib/seo/articleSeo';
import { detectBreakingTtsLanguage } from '@/lib/types/breaking';

export const SOCIAL_FALLBACK_IMAGE = '/lokswami-share-preview.png';

export function metadataText(value: string | undefined, limit = 200) {
  return Array.from(stripArticleHtml(stripArticleHtml(value || '')).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, limit).join('');
}

export function metadataLocale(title: string, description = '') {
  return detectBreakingTtsLanguage(`${title} ${description}`).replace('-', '_');
}

/** Validate without fetching: metadata must not introduce remote SSR dependencies. */
export function publicSocialImage(value: string | undefined, siteUrl = getSiteUrl()) {
  const source = String(value || '').trim();
  if (!source || /[\s\\\u0000-\u001f]/.test(source) || source.startsWith('//') || (!source.startsWith('/') && !/^https?:\/\//i.test(source))) return '';
  try {
    if (/(^|\/)\.\.?($|\/)/.test(decodeURIComponent(source.split('?')[0]))) return '';
    const url = new URL(source, siteUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    const path = decodeURIComponent(url.pathname);
    decodeURIComponent(url.search);
    if (/(^|\/)\.\.?($|\/)|^\/(admin|cms|private)(\/|$)|^\/api\/(?!og\/)/i.test(path)) return '';
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const local = host === 'localhost' || host === '::1' || /^(0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    const localSite = new URL(siteUrl).hostname === url.hostname && process.env.NODE_ENV !== 'production';
    if ((local && !localSite) || (!host.includes('.') && !localSite) || /(^|\.)(admin|cms|internal)(\.|$)|\.(local|internal)$/.test(host)) return '';
    if (url.hash || /%(?![\da-f]{2})/i.test(url.href)) return '';
    return url.href;
  } catch { return ''; }
}

export function selectSocialImage(values: Array<string | undefined>, siteUrl = getSiteUrl()) {
  for (const value of values) {
    const image = publicSocialImage(value, siteUrl);
    if (image && !new URL(image).pathname.startsWith('/placeholders/')) return image;
  }
  return new URL(SOCIAL_FALLBACK_IMAGE, siteUrl).href;
}
