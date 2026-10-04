import {
  buildYouTubeEmbedUrl,
  buildYouTubeWatchUrl,
  extractYouTubeVideoId,
} from '@/lib/utils/youtube';

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;
const YOUTUBE_SHORTCODE_PATTERN = /\[youtube:([^\]\s]+)\]/gi;
const SOCIAL_SHORTCODE_PATTERN =
  /\[social:(facebook|x|twitter|instagram|linkedin|whatsapp|telegram|link):([^\]\s]+)\]/gi;
const YOUTUBE_BLOCK_URL_PATTERN =
  /<(p|div)>\s*((?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/[^<\s]+)\s*<\/\1>/gi;
const YOUTUBE_LINK_PATTERN =
  /<a\b(?![^>]*\bdata-youtube-caption-link\b)[^>]*href=(['"])\s*((?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)[^"'\s]+)\s*\1[^>]*>[\s\S]*?<\/a>/gi;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toParagraphHtml(text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return '';

  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function sanitizeInputHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<(object|embed|link|meta|base|form|input|button|textarea|select)\b[^>]*>/gi, '')
    .replace(/<\/(object|form|button|textarea|select)>/gi, '')
    .replace(/\son\w+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*(['"])\s*data:text\/html[\s\S]*?\2/gi, ' $1="#"');
}

function buildYouTubeEmbedMarkup(input: string) {
  const videoId = extractYouTubeVideoId(input);
  if (!videoId) return null;

  const watchUrl = buildYouTubeWatchUrl(videoId);
  const embedUrl = buildYouTubeEmbedUrl(videoId);

  return `
<figure class="article-youtube-embed" style="display:block;max-width:100%;width:100%;margin:1.25rem 0;">
  <div class="article-youtube-embed-inner" style="position:relative;width:100%;max-width:100%;padding-top:56.25%;overflow:hidden;border-radius:0.75rem;background:#09090b;">
    <iframe
      src="${embedUrl}"
      title="YouTube video player"
      loading="lazy"
      style="position:absolute;inset:0;display:block;width:100%;height:100%;border:0;"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  </div>
  <figcaption>
    <a data-youtube-caption-link="true" href="${watchUrl}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
  </figcaption>
</figure>`.trim();
}

function normalizeSocialUrl(input: string) {
  const value = input.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function getSocialPlatformLabel(platform: string) {
  switch (platform.toLowerCase()) {
    case 'facebook':
      return 'Facebook';
    case 'x':
    case 'twitter':
      return 'X / Twitter';
    case 'instagram':
      return 'Instagram';
    case 'linkedin':
      return 'LinkedIn';
    case 'whatsapp':
      return 'WhatsApp';
    case 'telegram':
      return 'Telegram';
    case 'link':
    default:
      return 'Social link';
  }
}

function buildSocialEmbedMarkup(platform: string, input: string) {
  const url = normalizeSocialUrl(input);
  if (!/^https?:\/\//i.test(url)) return null;

  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }

  const label = getSocialPlatformLabel(platform);
  const safeUrl = escapeHtml(url);
  const safeHost = escapeHtml(host);

  return `
<aside class="article-social-embed" style="display:block;margin:1.25rem 0;padding:1rem;border:1px solid rgba(148,163,184,0.35);border-radius:0.75rem;background:rgba(148,163,184,0.08);">
  <p class="article-social-embed-label" style="margin:0 0 0.35rem;font-size:0.75rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#e72129;">${label}</p>
  <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="font-weight:700;text-decoration:none;">View post on ${label}</a>
  <p style="margin:0.35rem 0 0;font-size:0.875rem;color:#64748b;">${safeHost}</p>
</aside>`.trim();
}

function wrapTables(html: string) {
  if (!/<table\b/i.test(html)) return html;

  return html.replace(
    /(<div\b[^>]*\bclass=(?:'[^']*article-table-wrap[^']*'|"[^"]*article-table-wrap[^"]*")[^>]*>[\s\S]*?<\/div>)|(<table\b[\s\S]*?<\/table>)/gi,
    (match, alreadyWrapped, rawTable) => {
      if (alreadyWrapped) return alreadyWrapped;
      const content = rawTable || match;
      return `<div class="article-table-wrap" data-swipe-ignore="true" tabindex="0" role="region" aria-label="Table">${content}</div>`;
    }
  );
}

export function renderArticleRichContent(rawContent: string) {
  const source = rawContent.trim();
  if (!source) return '';

  let html = HTML_TAG_PATTERN.test(source) ? source : toParagraphHtml(source);
  html = sanitizeInputHtml(html);
  html = wrapTables(html);

  html = html.replace(
    YOUTUBE_LINK_PATTERN,
    (match, _quote: string, urlValue: string) => {
      return buildYouTubeEmbedMarkup(urlValue) || match;
    }
  );

  html = html.replace(
    YOUTUBE_BLOCK_URL_PATTERN,
    (_match, _tagName: string, urlValue: string) => {
      const embed = buildYouTubeEmbedMarkup(urlValue);
      return embed || `<p>${escapeHtml(urlValue)}</p>`;
    }
  );

  html = html.replace(YOUTUBE_SHORTCODE_PATTERN, (match, urlValue: string) => {
    return buildYouTubeEmbedMarkup(urlValue) || match;
  });

  html = html.replace(
    SOCIAL_SHORTCODE_PATTERN,
    (match, platform: string, urlValue: string) => {
      return buildSocialEmbedMarkup(platform, urlValue) || match;
    }
  );

  return html.trim();
}
