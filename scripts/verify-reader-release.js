#!/usr/bin/env node

// Read-only checks against the deployed artifact. Does not publish or repair data.
async function verifyReaderRelease({ baseUrl, sha, paperId, minNews = 0 }, fetchFn = fetch) {
  if (!/^[a-f0-9]{40}$/i.test(sha || '')) throw new Error('--sha requires the full tested commit SHA');
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('HTTP(S) base URL required');
  if (paperId && !/^[a-f0-9]{24}$/i.test(paperId)) throw new Error('Invalid E-paper ID');
  if (!Number.isInteger(minNews) || minNews < 0) throw new Error('--min-news must be a non-negative integer');
  const checks = [];
  async function check(name, action) {
    try { checks.push({ name, pass: Boolean(await action()) }); }
    catch { checks.push({ name, pass: false }); }
  }
  const get = (route, options = {}) => fetchFn(new URL(route, base), { signal: AbortSignal.timeout(20000), ...options });
  await check('clean tested SHA and Node 24', async () => {
    const response = await get('/api/version');
    const body = await response.json();
    return response.ok && body.commit === sha.toLowerCase() && body.dirty === 'false' && body.nodeMajor === 24;
  });
  await check('advertised sitemap index and child', async () => {
    const robots = await get('/robots.txt');
    if (!robots.ok || !/Sitemap:\s*https?:\/\/[^\s]+\/sitemap\.xml(?:\s|$)/i.test(await robots.text())) return false;
    const response = await get('/sitemap.xml');
    const xml = await response.text();
    if (!response.ok || !response.headers.get('content-type')?.includes('xml') || !xml.includes('<sitemapindex')) return false;
    const child = xml.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!child) return false;
    const childUrl = new URL(child, base);
    // Always probe the supplied deployment, including previews with canonical URLs.
    const chunk = await get(childUrl.pathname);
    return chunk.ok && (await chunk.text()).includes('<urlset');
  });
  await check(`news sitemap XML contains at least ${minNews} eligible entries`, async () => {
    const response = await get('/news-sitemap.xml');
    const xml = await response.text();
    return response.ok && xml.includes('<urlset') && (xml.match(/<news:news>/g) || []).length >= minNews;
  });
  if (paperId) await check('published E-paper has pages and released clickable stories', async () => {
    const response = await get(`/api/epapers/${paperId}?publicationType=epaper`);
    const body = await response.json();
    const paper = body.data;
    return response.ok && body.success && paper?.status === 'published' && paper.pages?.length > 0 && paper.articles?.length > 0;
  });
  return { pass: checks.every((check) => check.pass), checks };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args[args.indexOf(name) + 1];
  if (args.includes('--help')) {
    console.log('Usage: npm run verify:reader-release -- --base-url https://lokswami.com --sha <40-character-tested-SHA> [--paper <published-E-paper-ID>] [--min-news <eligible-article-count>]');
    return;
  }
  if (!args.includes('--base-url') || !args.includes('--sha')) throw new Error('Provide --base-url and --sha; use --help');
  const result = await verifyReaderRelease({ baseUrl: option('--base-url'), sha: option('--sha'), paperId: args.includes('--paper') ? option('--paper') : undefined, minNews: args.includes('--min-news') ? Number(option('--min-news')) : 0 });
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { verifyReaderRelease };
