import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

describe('e-paper loading performance', () => {
  it('uses a smaller cached first page without an internal HTTP round trip', () => {
    const page = read('app/(reader)/main/epaper/EPaperPageServer.tsx');

    expect(page).toContain('const EPAPER_LIMIT = 12');
    expect(page).toContain('unstable_cache');
    expect(page).toContain('listPublicEpaperFeed');
    expect(page).not.toContain('resolveRequestOrigin');
    expect(page).not.toContain('/api/v1/public/epapers/latest');
  });

  it('optimizes grid covers and prioritizes only the first visible row', () => {
    const client = read('app/(reader)/main/epaper/EPaperPageClient.tsx');
    const grid = client.slice(
      client.indexOf('{epapers.map((paper, index)'),
      client.indexOf('{hasMoreList ?')
    );

    expect(grid).toContain('quality={60}');
    expect(grid).toContain('priority={index < 4}');
    expect(grid).not.toContain('unoptimized');
  });

  it('keeps optimized thumbnail variants cached for one day', () => {
    const config = read('next.config.js');

    expect(config).toContain("formats: ['image/webp']");
    expect(config).toContain('minimumCacheTTL: 86400');
  });

  it('bounds a stalled public MongoDB query before using fallback storage', () => {
    const feed = read('lib/server/epaper/epaperRepository.ts');
    const availability = read('lib/db/mongoAvailability.ts');
    const model = read('lib/models/EPaper.ts');
    const articles = read('lib/content/serverArticles.ts');

    expect(feed).toContain('const DEFAULT_QUERY_TIMEOUT_MS = 2000');
    expect(feed).toContain('MONGODB_PUBLIC_QUERY_TIMEOUT_MS');
    expect(feed).toContain('reportMongoUnavailable');
    expect(availability).toContain('const DEFAULT_PROBE_TIMEOUT_MS = 3000');
    expect(model).toContain('publicationType: 1, status: 1, publishDate: -1, _id: -1');
    expect(articles).toContain("isMongoAvailable({ label: 'sitemap articles lookup' })");
    expect(articles).toContain("isMongoAvailable({ label: 'news sitemap articles lookup' })");
  });

  it('includes a browser CORS preflight check for DigitalOcean direct uploads', () => {
    const script = read('scripts/test-digitalocean-spaces.js');

    expect(script).toContain("method: 'OPTIONS'");
    expect(script).toContain("'Access-Control-Request-Method': 'PUT'");
    expect(script).toContain("'Access-Control-Request-Headers': 'content-type,x-amz-acl'");
    expect(script).toContain('DIGITALOCEAN_SPACES_CORS_ORIGINS');
  });

  it('lazy-loads PDF page fallback rendering outside the initial reader bundle', () => {
    const client = read('app/(reader)/main/epaper/EPaperPageClient.tsx');

    expect(client).not.toContain(
      "import { renderPdfPagePreviewFromUrl } from '@/lib/utils/pdfThumbnailClient'"
    );
    expect(client).toContain("await import(\n          '@/lib/utils/pdfThumbnailClient'");
  });

  it('preserves downloaded editions across service-worker and stale-chunk recovery', () => {
    const client = read('app/(reader)/main/epaper/EPaperPageClient.tsx');
    const serviceWorker = read('public/sw.js');
    const rootLayout = read('app/layout.tsx');

    expect(client).toContain("'lokswami-epaper-offline-v2'");
    expect(serviceWorker).toContain("'lokswami-epaper-offline-v1'");
    expect(serviceWorker).toContain('legacyCache.keys()');
    expect(serviceWorker).toContain('durableOfflineCache.put(request, response)');
    expect(rootLayout).toContain("DURABLE_CACHE_PREFIXES = ['lokswami-epaper-offline-']");
    expect(rootLayout).toContain('!DURABLE_CACHE_PREFIXES.some');
  });

  it('uses the multi-channel branded share menu for editions and magazines', () => {
    const client = read('app/(reader)/main/epaper/EPaperPageClient.tsx');

    expect(client).toContain("import ShareMenu from '@/components/ui/ShareMenu'");
    expect(client).toContain('placement="publication_reader_mobile_toolbar"');
    expect(client).toContain('placement="publication_reader_desktop_toolbar"');
    expect(client).toContain("publicationType === 'emagazine' ? 'emagazine' : 'epaper'");
    expect(client).not.toContain('shareActivePaperOnWhatsApp');
  });
});
