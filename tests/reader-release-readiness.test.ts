// @vitest-environment node
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readBuildIdentity } = require('../scripts/build-identity');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyReaderRelease } = require('../scripts/verify-reader-release');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseCliArgs } = require('../scripts/phase3/pr-readiness');
const sha = 'a'.repeat(40);

describe('release evidence', () => {
  it('records unavailable or dirty Git evidence instead of claiming a clean build', () => {
    expect(readBuildIdentity(() => null)).toEqual({ commit: 'unknown', dirty: 'unknown' });
    expect(readBuildIdentity((args: string[]) => args[0] === 'rev-parse' ? sha : ' M app/page.tsx')).toEqual({ commit: sha, dirty: 'true' });
    expect(readBuildIdentity((args: string[]) => args[0] === 'rev-parse' ? sha : '')).toEqual({ commit: sha, dirty: 'false' });
  });

  it('preserves the foundation default and supports an explicitly selected main base', () => {
    expect(parseCliArgs([]).baseBranch).toBe('b3/foundation');
    expect(parseCliArgs(['--pr', '12', '--base', 'main', '--strict'])).toEqual({ prNumber: '12', baseBranch: 'main', strict: true });
  });

  function mockFetch(dirty = 'false', stories = [{}]) {
    return async (url: URL) => {
      const bodies: Record<string, unknown> = {
        '/api/version': { commit: sha, dirty, nodeMajor: 24 },
        '/robots.txt': 'Sitemap: https://lokswami.com/sitemap.xml',
        '/sitemap.xml': '<sitemapindex><sitemap><loc>https://lokswami.com/sitemap/0.xml</loc></sitemap></sitemapindex>',
        '/sitemap/0.xml': '<urlset></urlset>',
        '/news-sitemap.xml': '<urlset></urlset>',
        [`/api/epapers/${'b'.repeat(24)}`]: { success: true, data: { status: 'published', pages: [{}], articles: stories } },
      };
      return { ok: true, headers: { get: () => 'application/xml' }, text: async () => bodies[url.pathname], json: async () => bodies[url.pathname] };
    };
  }

  it('requires a clean matching artifact and fails when a selected E-paper has no released stories', async () => {
    const options = { baseUrl: 'https://preview.example', sha, paperId: 'b'.repeat(24) };
    expect((await verifyReaderRelease(options, mockFetch())).pass).toBe(true);
    expect((await verifyReaderRelease(options, mockFetch('true'))).pass).toBe(false);
    expect((await verifyReaderRelease(options, mockFetch('false', []))).pass).toBe(false);
    expect((await verifyReaderRelease({ ...options, minNews: 2 }, mockFetch())).pass).toBe(false);
    await expect(verifyReaderRelease({ ...options, sha: 'short' }, mockFetch())).rejects.toThrow('full tested commit');
  });
});
