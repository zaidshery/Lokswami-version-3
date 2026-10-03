import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildArticlePublicPath, buildVideoReaderPath, buildSwipeReaderPath, buildPublicationReaderPath } from '@/lib/utils/readerContentPaths';
import { resolveCanonicalShareUrl, buildSocialShareUrl, copyCanonicalUrl, shareNative } from '@/lib/utils/universalShare';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const origin = 'https://lokswami.com';
const paths = [
  buildArticlePublicPath({ id: 'id', slug: 'भोपाल-समाचार' }),
  buildVideoReaderPath('video &?१'),
  buildSwipeReaderPath('short-news'),
  buildPublicationReaderPath({ paperId: 'p1', city: 'indore', publishDate: '2026-09-05', page: 3, storyToken: 'समाचार &?' }),
  buildPublicationReaderPath({ publicationType: 'emagazine', paperId: 'm1', publishDate: '2026-09-01', page: 7, storyToken: 'monthly-story' }),
];
describe('canonical universal share', () => {
  it.each(paths)('retains the exact canonical content path %s', path => {
    expect(resolveCanonicalShareUrl(path)).toBe(origin + path);
  });
  it.each(['javascript:alert(1)', '//evil.com/main/videos', 'https://evil.com/main/article/news', '/admin', '/cms', '/api/articles', '/article/id', '/a/id', '/e/id', '/main/epaper?redirect=/admin', '/main/emagazine?city=indore', '/main/article/%ZZ', '/main/article/%2Fadmin', '/main/videos?video=id&video=other', '/main/videos#admin', 'https://user:pass@lokswami.com/main/videos'])('rejects unsafe URL %s', input => {
    expect(resolveCanonicalShareUrl(input)).toBe('');
    expect(buildSocialShareUrl('whatsapp', { url: input })).toBe('');
  });
  it.each(['whatsapp', 'facebook', 'x', 'telegram'] as const)('encodes Hindi and punctuation once for %s', platform => {
    const title = 'भोपाल समाचार & Delhi? 50% ✓';
    const url = origin + paths[3];
    const target = new URL(buildSocialShareUrl(platform, { url, title }));
    if (platform === 'whatsapp') expect(target.searchParams.get('text')).toBe(`${title}\n${url}`);
    else {
      expect(target.searchParams.get(platform === 'facebook' ? 'u' : 'url')).toBe(url);
      if (platform !== 'facebook') expect(target.searchParams.get('text')).toBe(title);
    }
  });
  it('uses the configured public origin and rejects an unrelated absolute origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://news.example.com');
    expect(resolveCanonicalShareUrl(paths[0])).toBe('https://news.example.com' + paths[0]);
    expect(resolveCanonicalShareUrl(origin + paths[0])).toBe('');
  });
  it.each(['http://localhost:3000/main/videos?video=id', 'http://127.0.0.1/main/videos', 'http://internal.local/main/videos', 'https://cms.lokswami.com/main/article/news', '/main/e-magazine?date=2026-09-01', '/main/article/%E0%A4', '/admin/../main/videos', '/main/article/%2e%2e/videos', 'main/videos', 'https:javascript:alert(1)'])('rejects internal or malformed source %s', url => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin);
    expect(resolveCanonicalShareUrl(url)).toBe('');
  });
  it('does not leak a loopback origin in production and safely encodes markup as text', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    const title = '<script>alert("X & Y?")</script>';
    const destination = new URL(buildSocialShareUrl('telegram', { url: paths[0], title }));
    expect(destination.origin).toBe('https://t.me');
    expect(destination.searchParams.get('url')).toBe(origin + paths[0]);
    expect(destination.searchParams.get('text')).toBe(title);
  });
  it.each(['whatsapp', 'facebook', 'x', 'telegram'] as const)('preserves English punctuation for %s', platform => {
    const url = origin + paths[4];
    const destination = new URL(buildSocialShareUrl(platform, { url, title: 'City & nation: what next? 50%' }));
    const hosts = { whatsapp: 'wa.me', facebook: 'www.facebook.com', x: 'x.com', telegram: 't.me' };
    expect(destination.hostname).toBe(hosts[platform]);
    expect(destination.searchParams.get(platform === 'whatsapp' ? 'text' : platform === 'facebook' ? 'u' : 'url')).toContain(url);
  });
  it.each(['shared', 'cancelled', 'failed', 'unavailable'] as const)('contains native %s results', async result => {
    const share = vi.fn().mockImplementation(async () => {
      if (result === 'cancelled') throw { name: 'AbortError' };
      if (result === 'failed') throw new Error('Permission denied');
    });
    Object.defineProperty(navigator, 'share', { configurable: true, value: result === 'unavailable' ? undefined : share });
    expect(await shareNative({ url: paths[1], title: 'Video' })).toBe(result);
    if (result !== 'unavailable') expect(share).toHaveBeenCalledWith({ url: origin + paths[1], title: 'Video', text: undefined });
  });
  it.each(['clipboard', 'unavailable', 'rejected', 'failed'] as const)('truthfully handles %s copy', async mode => {
    const writeText = vi.fn().mockImplementation(async () => { if (mode === 'rejected' || mode === 'failed') throw new Error('Denied'); });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: mode === 'unavailable' ? undefined : { writeText } });
    const exec = vi.fn().mockReturnValue(mode !== 'failed');
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
    const button = document.createElement('button'); document.body.appendChild(button); button.focus();
    expect(await copyCanonicalUrl(paths[4])).toBe(mode !== 'failed');
    if (mode !== 'unavailable') expect(writeText).toHaveBeenCalledWith(origin + paths[4]);
    if (mode !== 'clipboard') { expect(exec).toHaveBeenCalledWith('copy'); expect(document.activeElement).toBe(button); }
    expect(document.querySelector('textarea')).toBeNull(); button.remove();
  });
});
