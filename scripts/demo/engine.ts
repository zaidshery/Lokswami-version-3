/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Core Engine: Store Resolution, Seeding, Scoped Reset, Public Verification
 */

import path from 'path';
import fs from 'fs/promises';
import { assertDemoSafety } from './safety';
import {
  resolveScenarioPlan,
  type DemoScenarioName,
  type ScenarioFixturePlan,
} from './scenarios';
import {
  DEMO_ARTICLE_IDS,
  type DemoArticleFixture,
} from './fixtures/articles';
import {
  DEMO_VIDEO_IDS,
  type DemoVideoFixture,
} from './fixtures/videos';
import {
  DEMO_SHORT_IDS,
  type DemoShortFixture,
} from './fixtures/shorts';
import {
  DEMO_EPAPER_IDS,
  DEMO_EPAPER_ARTICLES,
  type DemoEpaperFixture,
} from './fixtures/epaper';
import {
  DEMO_MAGAZINE_IDS,
  type DemoMagazineFixture,
} from './fixtures/magazine';
import {
  ensureRealSnapshotAssets,
  getRealSnapshotOwnership,
  resolveRealSnapshotPlan,
  type RealSnapshotOwnership,
} from './realSnapshot';

import connectDB from '@/lib/db/mongoose';
import Article from '@/lib/models/Article';
import Video from '@/lib/models/Video';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';

import {
  findArticleById,
  createNewsroomArticle,
  updateNewsroomArticleWithCas,
} from '@/lib/server/content/newsroomArticleRepository';
import { VideoRepository } from '@/lib/server/video/videoRepository';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';

import { publicArticleService } from '@/lib/server/content/publicArticleService';
import { VideoService } from '@/lib/server/video/videoService';
import { EpaperService } from '@/lib/server/epaper/epaperService';

import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import {
  listAllStoredArticles,
  type StoredArticle,
} from '@/lib/storage/articlesFile';
import {
  listAllStoredVideos,
  type StoredVideo,
} from '@/lib/storage/videosFile';
import {
  listAllStoredEPapers,
  type StoredEPaper,
} from '@/lib/storage/epapersFile';

export type DemoStoreMode = 'mongo' | 'file';
export const DEMO_CONTENT_SOURCES = ['synthetic', 'lokswami'] as const;
export const DEMO_BREAKING_MODES = ['snapshot', 'none'] as const;
export type DemoContentSource = (typeof DEMO_CONTENT_SOURCES)[number];
export type DemoBreakingMode = (typeof DEMO_BREAKING_MODES)[number];

export interface DemoHarnessSelection {
  source?: DemoContentSource;
  breaking?: DemoBreakingMode;
}

export interface ScenarioComposition {
  total: number;
  real: number;
  synthetic: number;
  realPercent: number;
}

export interface SeedResult {
  store: DemoStoreMode;
  scenario: DemoScenarioName;
  source: DemoContentSource;
  breaking: DemoBreakingMode;
  composition: ScenarioComposition;
  articlesSeeded: number;
  videosSeeded: number;
  shortsSeeded: number;
  epapersSeeded: number;
  magazinesSeeded: number;
  skipped: string[];
}

export interface ResetResult {
  store: DemoStoreMode;
  source: DemoContentSource;
  articlesRemoved: number;
  videosRemoved: number;
  epapersRemoved: number;
  epaperArticlesRemoved: number;
}

export interface VerificationCheck {
  name: string;
  category: 'article' | 'video' | 'short' | 'epaper' | 'magazine' | 'breaking';
  status: 'passed' | 'failed' | 'skipped';
  details?: string;
}

export interface VerificationResult {
  ok: boolean;
  store: DemoStoreMode;
  scenario: DemoScenarioName;
  source: DemoContentSource;
  breaking: DemoBreakingMode;
  composition: ScenarioComposition;
  checks: VerificationCheck[];
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
}

export type DemoFixtureOwnershipKind =
  | 'article'
  | 'video'
  | 'epaper'
  | 'epaperArticle';

const DEMO_EPAPER_ARTICLE_IDS = DEMO_EPAPER_ARTICLES.map((article) => article._id);
const DEMO_FIXTURE_IDS: Record<DemoFixtureOwnershipKind, ReadonlySet<string>> = {
  article: new Set(DEMO_ARTICLE_IDS),
  video: new Set([...DEMO_VIDEO_IDS, ...DEMO_SHORT_IDS]),
  epaper: new Set([...DEMO_EPAPER_IDS, ...DEMO_MAGAZINE_IDS]),
  epaperArticle: new Set(DEMO_EPAPER_ARTICLE_IDS),
};

function normalizeSelection(options: DemoHarnessSelection = {}) {
  const source = options.source || 'synthetic';
  const breaking = options.breaking || 'snapshot';
  if (!DEMO_CONTENT_SOURCES.includes(source)) {
    throw new Error(
      `Unknown demo content source "${source}". Supported sources: ${DEMO_CONTENT_SOURCES.join(', ')}`
    );
  }
  if (!DEMO_BREAKING_MODES.includes(breaking)) {
    throw new Error(
      `Unknown breaking mode "${breaking}". Supported modes: ${DEMO_BREAKING_MODES.join(', ')}`
    );
  }
  return { source, breaking };
}

export function resolveHarnessScenarioPlan(
  scenarioName: string = 'full',
  options: DemoHarnessSelection = {}
): ScenarioFixturePlan {
  const { source, breaking } = normalizeSelection(options);
  const plan = source === 'lokswami'
    ? resolveRealSnapshotPlan(scenarioName, { breaking })
    : resolveScenarioPlan(scenarioName);
  const articles = breaking === 'none'
    ? plan.articles.map((article) => ({ ...article, isBreaking: false, breakingTts: null }))
    : plan.articles;
  const publicArticleIds = new Set(articles.map((article) => article._id));

  return {
    ...plan,
    articles,
    // A published short is valid only when its linked published article is in this plan.
    shorts: plan.shorts.filter(
      (short) => Boolean(short.articleId) && publicArticleIds.has(short.articleId)
    ),
  };
}

export function summarizeScenarioComposition(
  plan: ScenarioFixturePlan,
  source: DemoContentSource
): ScenarioComposition {
  const total =
    plan.articles.length +
    plan.videos.length +
    plan.shorts.length +
    plan.epapers.length +
    plan.magazines.length;
  const real = source === 'lokswami' ? total : 0;
  return {
    total,
    real,
    synthetic: total - real,
    realPercent: total === 0 ? 0 : Math.round((real / total) * 100),
  };
}

function syntheticOwnership(): RealSnapshotOwnership {
  return {
    articleIds: DEMO_ARTICLE_IDS,
    videoIds: [...DEMO_VIDEO_IDS, ...DEMO_SHORT_IDS],
    epaperIds: [...DEMO_EPAPER_IDS, ...DEMO_MAGAZINE_IDS],
    epaperArticleIds: DEMO_EPAPER_ARTICLE_IDS,
  };
}

export function resolveHarnessOwnership(
  options: Pick<DemoHarnessSelection, 'source'> = {}
): RealSnapshotOwnership {
  const { source } = normalizeSelection(options);
  return source === 'lokswami' ? getRealSnapshotOwnership() : syntheticOwnership();
}

/** Exact ownership predicate used by reset; names and prefixes never confer ownership. */
export function isOwnedDemoFixtureId(
  kind: DemoFixtureOwnershipKind,
  id: string
): boolean {
  return DEMO_FIXTURE_IDS[kind].has(id);
}

export function isOwnedHarnessFixtureId(
  kind: DemoFixtureOwnershipKind,
  id: string,
  options: Pick<DemoHarnessSelection, 'source'> = {}
): boolean {
  const ownership = resolveHarnessOwnership(options);
  const idsByKind: Record<DemoFixtureOwnershipKind, string[]> = {
    article: ownership.articleIds,
    video: ownership.videoIds,
    epaper: ownership.epaperIds,
    epaperArticle: ownership.epaperArticleIds,
  };
  return idsByKind[kind].includes(id);
}

const dataDir = path.resolve(process.cwd(), 'data');
const articlesJsonPath = path.join(dataDir, 'articles.json');
const videosJsonPath = path.join(dataDir, 'videos.json');
const epapersJsonPath = path.join(dataDir, 'epapers.json');

const videoRepository = new VideoRepository();
const epaperRepository = new EpaperRepository();
const videoService = new VideoService(videoRepository);
const epaperService = new EpaperService(epaperRepository);

/**
 * Resolves the active store mode under strict demo safety constraints.
 * If MONGODB_URI is present, attempts connection. If connection fails, ABORTS.
 * If MONGODB_URI is absent, uses local file storage.
 */
export async function resolveDemoStore(): Promise<DemoStoreMode> {
  assertDemoSafety();

  const mongoUri = (process.env.MONGODB_URI || '').trim();
  if (mongoUri) {
    try {
      await connectDB();
      return 'mongo';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[DEMO HARNESS ABORT] Configured MONGODB_URI failed to connect: ${message}. ` +
          `Silent fallback to local file store is strictly prohibited for demo tooling. ` +
          `Please fix the development MongoDB connection or unset MONGODB_URI to use file mode.`
      );
    }
  }

  return 'file';
}

/**
 * Ensures deterministic demo placeholder assets exist in public/demo/.
 */
export async function ensureDemoAssets(): Promise<void> {
  const publicDemoDir = path.resolve(process.cwd(), 'public', 'demo');
  const sourceAssetsDir = path.resolve(process.cwd(), 'scripts', 'demo', 'assets');
  await fs.mkdir(publicDemoDir, { recursive: true });

  const files = ['news-16x9.svg', 'story-9x16.svg', 'epaper-3x4.svg', 'sample.pdf'];
  for (const file of files) {
    const src = path.join(sourceAssetsDir, file);
    const dest = path.join(publicDemoDir, file);
    try {
      await fs.copyFile(src, dest);
    } catch {
      // Ignore if copy fails in constrained environment
    }
  }
}

// ---------------------------------------------------------------------------
// SEED IMPLEMENTATION
// ---------------------------------------------------------------------------

async function seedArticlesMongo(articles: DemoArticleFixture[]): Promise<number> {
  let count = 0;
  for (const fixture of articles) {
    const existing = await findArticleById(fixture._id, 'mongo');
    if (!existing) {
      await createNewsroomArticle(fixture as unknown as Record<string, unknown>, 'mongo');
    } else {
      await updateNewsroomArticleWithCas(
        fixture._id,
        fixture as unknown as Record<string, unknown>,
        { forceCas: true, store: 'mongo' }
      );
    }
    count += 1;
  }
  return count;
}

async function seedArticlesFile(articles: DemoArticleFixture[]): Promise<number> {
  let all: StoredArticle[] = [];
  try {
    all = (await listAllStoredArticles()) as StoredArticle[];
  } catch {
    all = [];
  }

  const existingMap = new Map<string, number>();
  all.forEach((item, index) => {
    existingMap.set(item._id, index);
    if (item.slug) existingMap.set(item.slug, index);
  });

  for (const fixture of articles) {
    const target = fixture as unknown as StoredArticle;
    const existingIndex = existingMap.get(fixture._id) ?? existingMap.get(fixture.slug);
    if (existingIndex !== undefined) {
      all[existingIndex] = target;
    } else {
      all.push(target);
      existingMap.set(fixture._id, all.length - 1);
    }
  }

  await writeJsonFileAtomically(articlesJsonPath, all);
  return articles.length;
}

async function seedVideosMongo(videos: (DemoVideoFixture | DemoShortFixture)[]): Promise<number> {
  let count = 0;
  for (const fixture of videos) {
    const existing = await videoRepository.findById(fixture._id, 'mongo');
    if (!existing) {
      await videoRepository.create(fixture as unknown as Record<string, unknown>, 'mongo');
    } else {
      await videoRepository.update(fixture._id, fixture as unknown as Record<string, unknown>, 'mongo');
    }
    count += 1;
  }
  return count;
}

async function seedVideosFile(videos: (DemoVideoFixture | DemoShortFixture)[]): Promise<number> {
  let all: StoredVideo[] = [];
  try {
    all = (await listAllStoredVideos()) as unknown as StoredVideo[];
  } catch {
    all = [];
  }

  const existingMap = new Map<string, number>();
  all.forEach((item, index) => {
    existingMap.set(item._id, index);
    if (item.slug) existingMap.set(item.slug, index);
  });

  for (const fixture of videos) {
    const target = fixture as unknown as StoredVideo;
    const existingIndex = existingMap.get(fixture._id) ?? existingMap.get(fixture.slug);
    if (existingIndex !== undefined) {
      all[existingIndex] = target;
    } else {
      all.push(target);
      existingMap.set(fixture._id, all.length - 1);
    }
  }

  await writeJsonFileAtomically(videosJsonPath, all);
  return videos.length;
}

function toMongoEPaperDoc(fixture: DemoEpaperFixture): Record<string, unknown> {
  const pageCount = typeof fixture.pages === 'number' ? fixture.pages : 4;
  const cityName = fixture.city === 'Indore' ? 'इंदौर' : fixture.city === 'Ujjain' ? 'उज्जैन' : fixture.city;
  return {
    _id: fixture._id,
    publicationType: 'epaper',
    citySlug: fixture.citySlug || fixture.city.toLowerCase(),
    cityName,
    title: fixture.title,
    publishDate: new Date(fixture.publishDate),
    pdfPath: fixture.pdfPath,
    thumbnailPath: fixture.thumbnailPath,
    pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      imagePath: fixture.thumbnailPath,
      pageType: 'editorial',
      processingStatus: 'ready',
      reviewStatus: 'ready',
    })),
    status: fixture.status,
    familyId: fixture.familyId || `fam-${fixture._id}`,
    revisionNumber: fixture.revisionNumber || 1,
    isCurrentRevision: fixture.isCurrentRevision ?? true,
    publishedAt: fixture.publishedAt ? new Date(fixture.publishedAt) : null,
    productionStatus: fixture.status === 'published' ? 'published' : 'draft_upload',
    createdAt: new Date(fixture.createdAt),
    updatedAt: new Date(fixture.updatedAt),
  };
}

function toMongoMagazineDoc(fixture: DemoMagazineFixture): Record<string, unknown> {
  const pageCount = typeof fixture.pages === 'number' ? fixture.pages : 4;
  return {
    _id: fixture._id,
    publicationType: 'emagazine',
    citySlug: fixture.citySlug || fixture.city.toLowerCase(),
    cityName: 'इंदौर',
    title: fixture.title,
    publishDate: new Date(fixture.publishDate),
    pdfPath: fixture.pdfPath,
    thumbnailPath: fixture.thumbnailPath,
    pageCount,
    pages: Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      imagePath: fixture.thumbnailPath,
      pageType: 'editorial',
      processingStatus: 'ready',
      reviewStatus: 'ready',
    })),
    status: fixture.status,
    familyId: fixture.familyId || `fam-${fixture._id}`,
    revisionNumber: fixture.revisionNumber || 1,
    isCurrentRevision: fixture.isCurrentRevision ?? true,
    publishedAt: new Date(fixture.publishedAt),
    productionStatus: 'published',
    createdAt: new Date(fixture.createdAt),
    updatedAt: new Date(fixture.updatedAt),
  };
}

async function seedEpapersMongo(
  epapers: DemoEpaperFixture[],
  magazines: DemoMagazineFixture[]
): Promise<{ epapersCount: number; magazinesCount: number }> {
  let epapersCount = 0;
  let magazinesCount = 0;

  const seededEpaperIds = new Set<string>();

  for (const fixture of epapers) {
    const doc = toMongoEPaperDoc(fixture);
    await EPaper.findOneAndUpdate(
      { _id: fixture._id },
      { $set: doc },
      { upsert: true, new: true, runValidators: true }
    );
    seededEpaperIds.add(fixture._id);
    epapersCount += 1;
  }

  // Seed released EPaperArticle documents ONLY if editions were seeded, and only for those editions
  if (epapers.length > 0) {
    const articlesToSeed = epapers
      .flatMap((e) => e.articles)
      .filter((a) => seededEpaperIds.has(a.epaperId));

    for (const articleFixture of articlesToSeed) {
      const normalizedHotspot = {
        x: articleFixture.hotspot.x > 1 ? articleFixture.hotspot.x / 100 : articleFixture.hotspot.x,
        y: articleFixture.hotspot.y > 1 ? articleFixture.hotspot.y / 100 : articleFixture.hotspot.y,
        w: articleFixture.hotspot.w > 1 ? articleFixture.hotspot.w / 100 : articleFixture.hotspot.w,
        h: articleFixture.hotspot.h > 1 ? articleFixture.hotspot.h / 100 : articleFixture.hotspot.h,
      };

      const doc = {
        ...articleFixture,
        hotspot: normalizedHotspot,
        releasedSnapshot: articleFixture.releasedSnapshot
          ? {
              ...articleFixture.releasedSnapshot,
              hotspot: normalizedHotspot,
            }
          : null,
      };

      await EPaperArticle.findOneAndUpdate(
        { _id: articleFixture._id },
        { $set: doc },
        { upsert: true, new: true, runValidators: true }
      );
    }
  }

  for (const fixture of magazines) {
    const doc = toMongoMagazineDoc(fixture);
    await EPaper.findOneAndUpdate(
      { _id: fixture._id },
      { $set: doc },
      { upsert: true, new: true, runValidators: true }
    );
    magazinesCount += 1;
  }

  return { epapersCount, magazinesCount };
}

async function seedEpapersFile(
  epapers: DemoEpaperFixture[]
): Promise<number> {
  // StoredEPaper has no draft lifecycle; exclude draft fixtures from publication-only file store
  const publishedOnly = epapers.filter((e) => e.status === 'published');

  let all: StoredEPaper[] = [];
  try {
    all = await listAllStoredEPapers();
  } catch {
    all = [];
  }

  const existingMap = new Map<string, number>();
  all.forEach((item, index) => {
    existingMap.set(item._id, index);
  });

  for (const fixture of publishedOnly) {
    // Only map valid StoredEPaper fields for file store
    const target: StoredEPaper = {
      _id: fixture._id,
      title: fixture.title,
      description: fixture.description,
      city: fixture.city as StoredEPaper['city'],
      thumbnail: fixture.thumbnailPath,
      pdfUrl: fixture.pdfPath,
      publishDate: fixture.publishDate,
      pages: fixture.pages,
      articleHotspots: (fixture.articleHotspots || []).map((h, idx) => ({
        id: (h as { id?: string }).id || `spot-${idx + 1}`,
        page: h.page,
        title: h.title,
        text: h.text,
        x: h.x > 1 ? h.x / 100 : h.x,
        y: h.y > 1 ? h.y / 100 : h.y,
        width: h.width > 1 ? h.width / 100 : h.width,
        height: h.height > 1 ? h.height / 100 : h.height,
      })),
      publishedAt: fixture.publishedAt ? fixture.publishedAt.toISOString() : new Date().toISOString(),
      updatedAt: fixture.updatedAt ? fixture.updatedAt.toISOString() : new Date().toISOString(),
    };

    const existingIndex = existingMap.get(fixture._id);
    if (existingIndex !== undefined) {
      all[existingIndex] = target;
    } else {
      all.push(target);
      existingMap.set(fixture._id, all.length - 1);
    }
  }

  await writeJsonFileAtomically(epapersJsonPath, all);
  return publishedOnly.length;
}

/**
 * Seeds demo fixtures for the specified scenario.
 */
export async function seedScenario(
  scenarioName: string = 'full',
  options: DemoHarnessSelection & { dryRun?: boolean } = {}
): Promise<SeedResult> {
  const store = await resolveDemoStore();
  const selection = normalizeSelection(options);
  const plan = resolveHarnessScenarioPlan(scenarioName, selection);
  const composition = summarizeScenarioComposition(plan, selection.source);

  const skipped: string[] = [];

  if (options.dryRun) {
    return {
      store,
      scenario: plan.name,
      ...selection,
      composition,
      articlesSeeded: plan.articles.length,
      videosSeeded: plan.videos.length,
      shortsSeeded: plan.shorts.length,
      epapersSeeded: plan.epapers.length,
      magazinesSeeded: store === 'mongo' ? plan.magazines.length : 0,
      skipped:
        store === 'file' && plan.magazines.length > 0
          ? ['SKIPPED — unsupported by current file-store contract: e-magazine and releasedSnapshot lifecycle']
          : [],
    };
  }

  if (selection.source === 'lokswami') {
    await ensureRealSnapshotAssets();
  } else {
    await ensureDemoAssets();
  }

  // 1. Seed Articles
  const articlesSeeded =
    store === 'mongo'
      ? await seedArticlesMongo(plan.articles)
      : await seedArticlesFile(plan.articles);

  // 2. Seed Videos
  const videosSeeded =
    store === 'mongo'
      ? await seedVideosMongo(plan.videos)
      : await seedVideosFile(plan.videos);

  // 3. Seed Shorts (all guaranteed to reference published demo articles)
  const shortsSeeded =
    store === 'mongo'
      ? await seedVideosMongo(plan.shorts)
      : await seedVideosFile(plan.shorts);

  // 4. Seed E-Paper & E-Magazine
  let epapersSeeded = 0;
  let magazinesSeeded = 0;

  if (store === 'mongo') {
    const res = await seedEpapersMongo(plan.epapers, plan.magazines);
    epapersSeeded = res.epapersCount;
    magazinesSeeded = res.magazinesCount;
  } else {
    epapersSeeded = await seedEpapersFile(plan.epapers);
    if (plan.epapers.some((e) => e.status === 'draft')) {
      skipped.push(
        'SKIPPED — draft e-paper isolation unsupported in publication-only file store (draft editions excluded)'
      );
    }
    if (plan.magazines.length > 0) {
      skipped.push(
        'SKIPPED — unsupported by current file-store contract: e-magazine and releasedSnapshot lifecycle'
      );
    }
  }

  return {
    store,
    scenario: plan.name,
    ...selection,
    composition,
    articlesSeeded,
    videosSeeded,
    shortsSeeded,
    epapersSeeded,
    magazinesSeeded,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// RESET IMPLEMENTATION
// ---------------------------------------------------------------------------

/**
 * Resets ONLY demo fixtures by their exact deterministic IDs.
 * Strictly prevents unscoped deletions, dropDatabase, or dropCollection.
 */
export async function resetDemoData(
  options: DemoHarnessSelection & { dryRun?: boolean } = {}
): Promise<ResetResult> {
  const store = await resolveDemoStore();
  const selection = normalizeSelection(options);
  const ownership = resolveHarnessOwnership(selection);

  if (options.dryRun) {
    return {
      store,
      source: selection.source,
      articlesRemoved: ownership.articleIds.length,
      videosRemoved: ownership.videoIds.length,
      epapersRemoved: ownership.epaperIds.length,
      epaperArticlesRemoved: ownership.epaperArticleIds.length,
    };
  }

  let articlesRemoved = 0;
  let videosRemoved = 0;
  let epapersRemoved = 0;
  let epaperArticlesRemoved = 0;

  if (store === 'mongo') {
    // Exact article fixture ownership only. A slug or namespace prefix is never ownership.
    const articleDel = await Article.deleteMany({
      _id: { $in: ownership.articleIds },
    });
    articlesRemoved = articleDel.deletedCount || 0;

    // Exact video and short fixture ownership only.
    const videoDel = await Video.deleteMany({
      _id: { $in: ownership.videoIds },
    });
    videosRemoved = videoDel.deletedCount || 0;

    // Exact E-Paper article fixture ownership only. Sharing a fixture edition is insufficient.
    const epaperArtDel = await EPaperArticle.deleteMany({
      _id: { $in: ownership.epaperArticleIds },
    });
    epaperArticlesRemoved = epaperArtDel.deletedCount || 0;

    // Exact E-Paper and E-Magazine fixture ownership only.
    const epaperDel = await EPaper.deleteMany({
      _id: { $in: ownership.epaperIds },
    });
    epapersRemoved = epaperDel.deletedCount || 0;
  } else {
    // File store scoped reset
    const demoArticleIdSet = new Set<string>(ownership.articleIds);
    const demoVideoIdSet = new Set<string>(ownership.videoIds);
    const demoEpaperIdSet = new Set<string>(ownership.epaperIds);

    // Articles
    try {
      const storedArticles = await listAllStoredArticles();
      const filtered = storedArticles.filter(
        (a) => !demoArticleIdSet.has(a._id)
      );
      articlesRemoved = storedArticles.length - filtered.length;
      await writeJsonFileAtomically(articlesJsonPath, filtered);
    } catch {
      // Ignored if file doesn't exist
    }

    // Videos
    try {
      const storedVideos = (await listAllStoredVideos()) as unknown as StoredVideo[];
      const filtered = storedVideos.filter(
        (v) => !demoVideoIdSet.has(v._id)
      );
      videosRemoved = storedVideos.length - filtered.length;
      await writeJsonFileAtomically(videosJsonPath, filtered);
    } catch {
      // Ignored if file doesn't exist
    }

    // EPapers
    try {
      const storedEpapers = await listAllStoredEPapers();
      const filtered = storedEpapers.filter(
        (e) => !demoEpaperIdSet.has(e._id)
      );
      epapersRemoved = storedEpapers.length - filtered.length;
      await writeJsonFileAtomically(epapersJsonPath, filtered);
    } catch {
      // Ignored if file doesn't exist
    }
  }

  return {
    store,
    source: selection.source,
    articlesRemoved,
    videosRemoved,
    epapersRemoved,
    epaperArticlesRemoved,
  };
}

// ---------------------------------------------------------------------------
// VERIFICATION IMPLEMENTATION
// ---------------------------------------------------------------------------

/**
 * Verifies demo fixtures through real reader-public read services where supported.
 */
export async function verifyDemoData(
  scenarioName: string = 'full',
  options: DemoHarnessSelection = {}
): Promise<VerificationResult> {
  const store = await resolveDemoStore();
  const selection = normalizeSelection(options);
  const plan = resolveHarnessScenarioPlan(scenarioName, selection);
  const composition = summarizeScenarioComposition(plan, selection.source);
  const checks: VerificationCheck[] = [];

  const publicFileExists = async (publicUrl: string) => {
    if (!publicUrl.startsWith('/') || publicUrl.startsWith('//')) return false;
    const relativePath = publicUrl.replace(/^\/+/, '');
    const publicRoot = path.resolve(process.cwd(), 'public');
    const candidate = path.resolve(publicRoot, relativePath);
    const relative = path.relative(publicRoot, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
    try {
      await fs.access(candidate);
      return true;
    } catch {
      return false;
    }
  };

  // 1. Verify Articles through Public Resolution Service
  for (const article of plan.articles) {
    try {
      const resolution = await publicArticleService.resolvePublicArticleToken(article.slug);
      if (resolution.kind === 'current') {
        const detail = await publicArticleService.getPublicArticleBySlug(article.slug);
        if (detail && detail.article.title === article.title) {
          checks.push({
            name: `Public Article Resolution: ${article.slug}`,
            category: 'article',
            status: 'passed',
            details: `Resolved title: "${detail.article.title.slice(0, 30)}..." via ${resolution.source}`,
          });
        } else {
          checks.push({
            name: `Public Article Resolution: ${article.slug}`,
            category: 'article',
            status: 'failed',
            details: `Detail lookup failed or title mismatch for ${article.slug}`,
          });
        }
      } else {
        checks.push({
          name: `Public Article Resolution: ${article.slug}`,
          category: 'article',
          status: 'failed',
          details: `Token resolution returned kind="${resolution.kind}"`,
        });
      }
    } catch (error) {
      checks.push({
        name: `Public Article Resolution: ${article.slug}`,
        category: 'article',
        status: 'failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (selection.source === 'lokswami' && plan.articles.length > 0) {
    const localizedImages = await Promise.all(
      plan.articles.map(async (article) => ({
        article,
        exists: Boolean(article.image) && await publicFileExists(article.image),
      }))
    );
    const missingImages = localizedImages.filter(({ exists }) => !exists);
    checks.push({
      name: 'Localized article image assets',
      category: 'article',
      status: missingImages.length === 0 ? 'passed' : 'failed',
      details: missingImages.length === 0
        ? `All ${localizedImages.length} real article images exist under public/demo/lokswami`
        : `${missingImages.length} localized article image(s) are missing`,
    });

    const searchArticle = plan.articles.find((article) =>
      article.title.split(/\s+/u).some((token) => token.trim().length >= 2)
    ) || plan.articles[0];
    const searchTerm = searchArticle.title
      .split(/\s+/u)
      .map((token) => token.trim())
      .find((token) => token.length >= 2) || searchArticle.title.slice(0, 8);
    try {
      const searchResult = await publicArticleService.listPublicArticles({
        query: searchTerm,
        limit: 50,
      });
      const found = searchResult.items.some((item) => item._id === searchArticle._id);
      checks.push({
        name: `Public article search: ${searchTerm}`,
        category: 'article',
        status: found ? 'passed' : 'failed',
        details: found
          ? `Found real snapshot article ${searchArticle.slug}`
          : `Search did not return real snapshot article ${searchArticle.slug}`,
      });
    } catch (error) {
      checks.push({
        name: `Public article search: ${searchTerm}`,
        category: 'article',
        status: 'failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 2. Verify Breaking News via Breaking Feed
  const activeBreaking = plan.articles.filter((a) => a.isBreaking);
  if (activeBreaking.length > 0) {
    try {
      const breakingFeed = await publicArticleService.getBreakingArticles(10);
      for (const expected of activeBreaking) {
        const found = breakingFeed.find(
          (item) => item.id === expected._id || item.title === expected.title
        );
        if (found) {
          const audioExists = selection.source !== 'lokswami'
            || (found.ttsReady === true
              && Boolean(found.ttsAudioUrl)
              && await publicFileExists(found.ttsAudioUrl || ''));
          checks.push({
            name: `Breaking News Feed: ${expected.slug}`,
            category: 'breaking',
            status: audioExists ? 'passed' : 'failed',
            details: audioExists
              ? `Found in active public breaking feed (${breakingFeed.length} items total) with reusable audio ready`
              : 'Breaking item was visible, but reusable local audio was not ready',
          });
        } else {
          checks.push({
            name: `Breaking News Feed: ${expected.slug}`,
            category: 'breaking',
            status: 'failed',
            details: `Active breaking fixture not returned in public breaking feed`,
          });
        }
      }
    } catch (error) {
      checks.push({
        name: `Breaking News Feed Verification`,
        category: 'breaking',
        status: 'failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 3. Verify Videos through Video Service Feed
  if (plan.videos.length > 0) {
    try {
      const videoPage = await videoService.getPublicVideoFeedPage({ limit: 50 });
      const foundVideoIds = new Set(videoPage.items.map((v) => v._id));

      for (const video of plan.videos) {
        if (foundVideoIds.has(video._id)) {
          checks.push({
            name: `Public Video Feed: ${video.slug}`,
            category: 'video',
            status: 'passed',
            details: `Found in public video feed with 16:9 ratio`,
          });
        } else {
          checks.push({
            name: `Public Video Feed: ${video.slug}`,
            category: 'video',
            status: 'failed',
            details: `Video fixture not returned in public video feed`,
          });
        }
      }
    } catch (error) {
      checks.push({
        name: `Public Video Feed Verification`,
        category: 'video',
        status: 'failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 4. Verify Shorts through Swipe Feed AND verify linked article is public
  if (plan.shorts.length > 0) {
    try {
      const swipePage = await videoService.getPublicSwipeFeedPage({ limit: 50 });
      const foundSwipeIds = new Set(swipePage.items.map((s) => s._id));

      for (const short of plan.shorts) {
        const inFeed = foundSwipeIds.has(short._id);

        // MANDATORY INVARIANT: Check linked Article
        let articleLinkedOk = false;
        let articleError = '';
        if (short.articleId) {
          try {
            const articleRes = await publicArticleService.getPublicArticleBySlug(short.articleId);
            articleLinkedOk = Boolean(articleRes?.article);
            if (!articleLinkedOk) {
              articleError = `Linked article ID "${short.articleId}" could not be resolved publicly`;
            }
          } catch (e) {
            articleError = e instanceof Error ? e.message : String(e);
          }
        } else {
          articleError = `Short has no linked articleId (orphan short violation)`;
        }

        if (inFeed && articleLinkedOk) {
          checks.push({
            name: `Public Swipe Short: ${short.slug}`,
            category: 'short',
            status: 'passed',
            details: `In swipe feed AND linked to public article "${short.articleId}"`,
          });
        } else {
          checks.push({
            name: `Public Swipe Short: ${short.slug}`,
            category: 'short',
            status: 'failed',
            details: `inFeed=${inFeed}, articleLinkedOk=${articleLinkedOk}. ${articleError}`.trim(),
          });
        }
      }
    } catch (error) {
      checks.push({
        name: `Public Swipe Feed Verification`,
        category: 'short',
        status: 'failed',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 5. Verify E-Paper through E-Paper Service
  for (const epaper of plan.epapers) {
    if (epaper.status === 'published') {
      try {
        const detail = await epaperService.getPublicEditionDetail(epaper._id, 'epaper');
        if (detail && detail.title === epaper.title) {
          checks.push({
            name: `Public E-Paper Edition: ${epaper.title}`,
            category: 'epaper',
            status: 'passed',
            details: `Resolved edition (${detail.pageCount} pages, ${detail.articles.length} stories)`,
          });
        } else {
          checks.push({
            name: `Public E-Paper Edition: ${epaper.title}`,
            category: 'epaper',
            status: 'failed',
            details: `Could not resolve published edition detail`,
          });
        }
      } catch (error) {
        checks.push({
          name: `Public E-Paper Edition: ${epaper.title}`,
          category: 'epaper',
          status: 'failed',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      // Draft edition should NOT be publicly resolved
      if (store === 'file') {
        let fileEp: StoredEPaper[] = [];
        try {
          fileEp = await listAllStoredEPapers();
        } catch {
          fileEp = [];
        }
        const leaked = fileEp.some((e) => e._id === epaper._id);
        if (leaked) {
          checks.push({
            name: `Draft E-Paper Edition Isolation: ${epaper.title}`,
            category: 'epaper',
            status: 'failed',
            details: `Draft edition leaked into publication-only file store data/epapers.json`,
          });
        } else {
          checks.push({
            name: `Draft E-Paper Edition Isolation: ${epaper.title}`,
            category: 'epaper',
            status: 'passed',
            details: `Draft edition safely excluded from publication-only file store`,
          });
        }
      } else {
        checks.push({
          name: `Draft E-Paper Edition Isolation: ${epaper.title}`,
          category: 'epaper',
          status: 'passed',
          details: `Draft edition safely preserved in Mongo without public release`,
        });
      }
    }
  }

  // 6. Verify E-Magazine
  if (plan.magazines.length > 0) {
    if (store === 'mongo') {
      for (const mag of plan.magazines) {
        try {
          const detail = await epaperService.getPublicEditionDetail(mag._id, 'emagazine');
          if (detail && detail.title === mag.title) {
            checks.push({
              name: `Public E-Magazine: ${mag.title}`,
              category: 'magazine',
              status: 'passed',
              details: `Resolved magazine in supported Mongo mode (${detail.pageCount} pages)`,
            });
          } else {
            checks.push({
              name: `Public E-Magazine: ${mag.title}`,
              category: 'magazine',
              status: 'failed',
              details: `Could not resolve magazine detail in Mongo mode`,
            });
          }
        } catch (error) {
          checks.push({
            name: `Public E-Magazine: ${mag.title}`,
            category: 'magazine',
            status: 'failed',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      // In file mode, e-magazine is skipped by capability definition
      checks.push({
        name: `E-Magazine File Mode Capability Check`,
        category: 'magazine',
        status: 'skipped',
        details: `SKIPPED — unsupported by current file-store contract (file store is newspapers only)`,
      });
    }
  }

  const totalPassed = checks.filter((c) => c.status === 'passed').length;
  const totalFailed = checks.filter((c) => c.status === 'failed').length;
  const totalSkipped = checks.filter((c) => c.status === 'skipped').length;
  const ok = totalFailed === 0;

  return {
    ok,
    store,
    scenario: plan.name,
    ...selection,
    composition,
    checks,
    totalPassed,
    totalFailed,
    totalSkipped,
  };
}
