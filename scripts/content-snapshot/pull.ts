import {
  mergeArticleDetail,
  parseArticleDetail,
  parseArticleList,
  parseBreaking,
  parseEpapers,
  parseHomeFeedEmagazines,
  parseShorts,
  parseVideos,
  resolveShortArticleLinks,
} from './parsers';
import {
  assertRealContentOptIn,
  LOKSWAMI_SOURCE_ORIGIN,
  mapWithConcurrency,
  MAX_HTTP_RETRIES,
  MAX_SNAPSHOT_CONCURRENCY,
  normalizeBoundedInteger,
  ReadOnlyLokswamiHttpClient,
  resolveAssetUrl,
  type SnapshotEnvironment,
} from './safety';
import { ContentSnapshotStore } from './store';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotArticle,
  type SnapshotError,
  type SnapshotLimits,
  type SnapshotManifest,
  type SnapshotMediaReference,
  type SnapshotPublication,
  type SnapshotShort,
  type SnapshotVideo,
} from './types';

const DEFAULT_LIMITS: SnapshotLimits = {
  articles: 25,
  breaking: 10,
  videos: 8,
  shorts: 8,
  epapers: 3,
  emagazines: 1,
  concurrency: 3,
};

const LIMIT_CAPS: Record<keyof Omit<SnapshotLimits, 'concurrency'>, number> = {
  articles: 50,
  breaking: 20,
  videos: 20,
  shorts: 20,
  epapers: 10,
  emagazines: 3,
};

export type PullSnapshotOptions = {
  env?: SnapshotEnvironment;
  limits?: Partial<SnapshotLimits>;
  client?: ReadOnlyLokswamiHttpClient;
  store?: ContentSnapshotStore;
  capturedAt?: string;
};

export function normalizeSnapshotLimits(input: Partial<SnapshotLimits> = {}): SnapshotLimits {
  return {
    articles: normalizeBoundedInteger(input.articles, DEFAULT_LIMITS.articles, 1, LIMIT_CAPS.articles),
    breaking: normalizeBoundedInteger(input.breaking, DEFAULT_LIMITS.breaking, 0, LIMIT_CAPS.breaking),
    videos: normalizeBoundedInteger(input.videos, DEFAULT_LIMITS.videos, 0, LIMIT_CAPS.videos),
    shorts: normalizeBoundedInteger(input.shorts, DEFAULT_LIMITS.shorts, 0, LIMIT_CAPS.shorts),
    epapers: normalizeBoundedInteger(input.epapers, DEFAULT_LIMITS.epapers, 0, LIMIT_CAPS.epapers),
    emagazines: normalizeBoundedInteger(input.emagazines, DEFAULT_LIMITS.emagazines, 0, LIMIT_CAPS.emagazines),
    concurrency: normalizeBoundedInteger(
      input.concurrency,
      DEFAULT_LIMITS.concurrency,
      1,
      MAX_SNAPSHOT_CONCURRENCY
    ),
  };
}

function endpoint(pathname: string): string {
  return new URL(pathname, `${LOKSWAMI_SOURCE_ORIGIN}/`).toString();
}

function buildEndpoints(limits: SnapshotLimits) {
  return {
    articles: endpoint(`/api/v1/public/articles?limit=${limits.articles}`),
    breaking: endpoint(`/api/v1/public/breaking?limit=${limits.breaking}`),
    videos: endpoint(`/api/v1/public/videos?limit=${limits.videos}`),
    shorts: endpoint(`/api/v1/public/shorts?limit=${limits.shorts}`),
    epapers: endpoint(`/api/v1/public/epapers?limit=${limits.epapers}&status=published&publicationType=epaper`),
    homeFeed: endpoint('/api/v1/public/home-feed'),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getOptionalPayload(
  client: ReadOnlyLokswamiHttpClient,
  url: string,
  scope: SnapshotError['scope'],
  errors: SnapshotError[]
): Promise<unknown> {
  try {
    return await client.getJson(url);
  } catch (error) {
    errors.push({ scope, sourceUrl: url, message: errorMessage(error) });
    return null;
  }
}

function uniqueBySourceId<T extends { sourceId: string }>(records: T[]): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.sourceId)) return false;
    seen.add(record.sourceId);
    return true;
  });
}

async function hydrateArticleDetails(
  articles: SnapshotArticle[],
  client: ReadOnlyLokswamiHttpClient,
  concurrency: number,
  capturedAt: string,
  endpoints: string[],
  errors: SnapshotError[]
): Promise<SnapshotArticle[]> {
  return mapWithConcurrency(articles, concurrency, async (article) => {
    const identifier = article.slug || article.sourceId;
    const url = endpoint(`/api/v1/public/articles/${encodeURIComponent(identifier)}`);
    endpoints.push(url);
    try {
      const payload = await client.getJson(url);
      return mergeArticleDetail(article, parseArticleDetail(payload, capturedAt));
    } catch (error) {
      errors.push({ scope: 'article', sourceUrl: url, message: errorMessage(error) });
      return article;
    }
  });
}

async function localizeMedia(
  reference: SnapshotMediaReference | undefined,
  client: ReadOnlyLokswamiHttpClient,
  store: ContentSnapshotStore,
  errors: SnapshotError[]
): Promise<SnapshotMediaReference | undefined> {
  if (!reference) return undefined;
  try {
    const safeUrl = resolveAssetUrl(reference.sourceUrl).toString();
    const asset = await client.getAsset(safeUrl, reference.kind);
    const localPath = await store.writeAsset(safeUrl, reference.kind, asset);
    return {
      ...reference,
      sourceUrl: safeUrl,
      status: 'downloaded',
      localPath,
      contentType: asset.contentType,
      sizeBytes: asset.bytes.byteLength,
      sha256: asset.sha256,
    };
  } catch (error) {
    const message = errorMessage(error);
    errors.push({ scope: 'asset', sourceUrl: reference.sourceUrl, message });
    return { ...reference, status: 'unavailable', error: message };
  }
}

async function localizeArticles(
  articles: SnapshotArticle[],
  client: ReadOnlyLokswamiHttpClient,
  store: ContentSnapshotStore,
  concurrency: number,
  errors: SnapshotError[]
): Promise<SnapshotArticle[]> {
  return mapWithConcurrency(articles, concurrency, async (article) => ({
    ...article,
    image: await localizeMedia(article.image, client, store, errors),
  }));
}

async function localizeVideos<T extends SnapshotVideo | SnapshotShort>(
  videos: T[],
  client: ReadOnlyLokswamiHttpClient,
  store: ContentSnapshotStore,
  concurrency: number,
  errors: SnapshotError[]
): Promise<T[]> {
  return mapWithConcurrency(videos, concurrency, async (video) => ({
    ...video,
    // Video playback URLs remain public metadata; video binaries are deliberately never downloaded.
    thumbnail: await localizeMedia(video.thumbnail, client, store, errors),
  }));
}

async function localizePublications(
  publications: SnapshotPublication[],
  client: ReadOnlyLokswamiHttpClient,
  store: ContentSnapshotStore,
  concurrency: number,
  errors: SnapshotError[]
): Promise<SnapshotPublication[]> {
  const localized: SnapshotPublication[] = [];
  for (const publication of publications) {
    const references = [publication.thumbnail, publication.pdf, ...publication.pages].filter(
      (value): value is SnapshotMediaReference => Boolean(value)
    );
    const results = await mapWithConcurrency(references, concurrency, (reference) =>
      localizeMedia(reference, client, store, errors)
    );
    let index = 0;
    const thumbnail = publication.thumbnail ? results[index++] : undefined;
    const pdf = publication.pdf ? results[index++] : undefined;
    const pages = publication.pages.map(() => results[index++]).filter(
      (value): value is SnapshotMediaReference => Boolean(value)
    );
    localized.push({ ...publication, thumbnail, pdf, pages });
  }
  return localized;
}

function countAssets(manifest: Pick<SnapshotManifest, 'articles' | 'videos' | 'shorts' | 'epapers' | 'emagazines'>) {
  const media: SnapshotMediaReference[] = [];
  for (const article of manifest.articles) if (article.image) media.push(article.image);
  for (const video of [...manifest.videos, ...manifest.shorts]) if (video.thumbnail) media.push(video.thumbnail);
  for (const publication of [...manifest.epapers, ...manifest.emagazines]) {
    if (publication.thumbnail) media.push(publication.thumbnail);
    if (publication.pdf) media.push(publication.pdf);
    media.push(...publication.pages);
  }
  return {
    downloaded: media.filter((item) => item.status === 'downloaded').length,
    unavailable: media.filter((item) => item.status === 'unavailable').length,
  };
}

export async function pullContentSnapshot(
  options: PullSnapshotOptions = {}
): Promise<SnapshotManifest> {
  assertRealContentOptIn(options.env);
  const limits = normalizeSnapshotLimits(options.limits);
  const capturedAt = options.capturedAt || new Date().toISOString();
  const client = options.client || new ReadOnlyLokswamiHttpClient();
  const store = options.store || new ContentSnapshotStore();
  const urls = buildEndpoints(limits);
  const endpoints = Object.values(urls);
  const errors: SnapshotError[] = [];

  const articlePayload = await getOptionalPayload(client, urls.articles, 'article', errors);
  let articles = uniqueBySourceId(parseArticleList(articlePayload, capturedAt)).slice(0, limits.articles);
  if (!articles.length) {
    throw new Error('Snapshot pull produced no valid public articles; refusing to write an unusable snapshot.');
  }
  articles = await hydrateArticleDetails(
    articles,
    client,
    limits.concurrency,
    capturedAt,
    endpoints,
    errors
  );

  const breakingPayload = limits.breaking
    ? await getOptionalPayload(client, urls.breaking, 'breaking', errors)
    : null;
  const videosPayload = limits.videos
    ? await getOptionalPayload(client, urls.videos, 'video', errors)
    : null;
  const shortsPayload = limits.shorts
    ? await getOptionalPayload(client, urls.shorts, 'short', errors)
    : null;
  const epapersPayload = limits.epapers
    ? await getOptionalPayload(client, urls.epapers, 'epaper', errors)
    : null;
  const homeFeedPayload = limits.emagazines
    ? await getOptionalPayload(client, urls.homeFeed, 'emagazine', errors)
    : null;

  let videos = uniqueBySourceId(parseVideos(videosPayload, capturedAt)).slice(0, limits.videos);
  let shorts = resolveShortArticleLinks(
    uniqueBySourceId(parseShorts(shortsPayload, capturedAt)).slice(0, limits.shorts),
    articles
  );
  let epapers = uniqueBySourceId(parseEpapers(epapersPayload, capturedAt)).slice(0, limits.epapers);
  let emagazines = uniqueBySourceId(parseHomeFeedEmagazines(homeFeedPayload, capturedAt)).slice(0, limits.emagazines);

  articles = await localizeArticles(articles, client, store, limits.concurrency, errors);
  videos = await localizeVideos(videos, client, store, limits.concurrency, errors);
  shorts = await localizeVideos(shorts, client, store, limits.concurrency, errors);
  epapers = await localizePublications(epapers, client, store, limits.concurrency, errors);
  emagazines = await localizePublications(emagazines, client, store, limits.concurrency, errors);

  const manifest: SnapshotManifest = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sourceHost: 'lokswami.com',
    sourceOrigin: LOKSWAMI_SOURCE_ORIGIN,
    pulledAt: capturedAt,
    readMethodsUsed: ['GET'],
    writeMethodsUsed: [],
    endpoints,
    limits,
    articles,
    breaking: uniqueBySourceId(parseBreaking(breakingPayload, capturedAt)).slice(0, limits.breaking),
    videos,
    shorts,
    epapers,
    emagazines,
    errors,
    assetSummary: { downloaded: 0, unavailable: 0 },
  };
  manifest.assetSummary = countAssets(manifest);
  await store.writeManifest(manifest);
  return manifest;
}

export function parsePullArgs(args: string[]): {
  limits: Partial<SnapshotLimits>;
  timeoutMs?: number;
  retries?: number;
} {
  const limits: Partial<SnapshotLimits> = {};
  let timeoutMs: number | undefined;
  let retries: number | undefined;
  const numericKeys = new Set(['articles', 'breaking', 'videos', 'shorts', 'epapers', 'emagazines', 'concurrency']);
  for (const arg of args) {
    const match = arg.match(/^--([a-z-]+)=(\d+)$/);
    if (!match) throw new Error(`Unsupported snapshot option: ${arg}`);
    const key = match[1];
    const value = Number.parseInt(match[2], 10);
    if (numericKeys.has(key)) {
      limits[key as keyof SnapshotLimits] = value;
    } else if (key === 'timeout-ms') {
      timeoutMs = value;
    } else if (key === 'retries') {
      retries = normalizeBoundedInteger(value, MAX_HTTP_RETRIES, 0, MAX_HTTP_RETRIES);
    } else {
      throw new Error(`Unsupported snapshot option: --${key}`);
    }
  }
  return { limits, timeoutMs, retries };
}

async function main() {
  try {
    const args = parsePullArgs(process.argv.slice(2));
    const client = new ReadOnlyLokswamiHttpClient({
      ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
      ...(args.retries === undefined ? {} : { retries: args.retries }),
    });
    const manifest = await pullContentSnapshot({ limits: args.limits, client });
    console.log(`LokSwami snapshot captured at ${manifest.pulledAt}.`);
    console.log(`Articles: ${manifest.articles.length}; videos: ${manifest.videos.length}; shorts: ${manifest.shorts.length}.`);
    console.log(`E-papers: ${manifest.epapers.length}; e-magazines: ${manifest.emagazines.length}.`);
    console.log(`Assets downloaded: ${manifest.assetSummary.downloaded}; unavailable: ${manifest.assetSummary.unavailable}.`);
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
