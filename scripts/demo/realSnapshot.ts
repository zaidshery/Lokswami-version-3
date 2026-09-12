import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { buildBreakingTtsExpectation } from '@/lib/server/breakingTts';
import type { SnapshotManifest, SnapshotMediaReference } from '@/scripts/content-snapshot/types';
import type { DemoArticleFixture } from './fixtures/articles';
import type { DemoVideoFixture } from './fixtures/videos';
import type { DemoShortFixture } from './fixtures/shorts';
import type { DemoEpaperFixture } from './fixtures/epaper';
import type { DemoMagazineFixture } from './fixtures/magazine';
import type { DemoScenarioName, ScenarioFixturePlan } from './scenarios';

export const REAL_SNAPSHOT_DEFAULT_ROOT = path.resolve(
  process.cwd(),
  '.local',
  'content-snapshots',
  'lokswami'
);

const PUBLIC_SNAPSHOT_DIR = path.resolve(process.cwd(), 'public', 'demo', 'lokswami');
const BREAKING_AUDIO_RELATIVE_PATH = 'uploads/breaking-audio/lokswami-qa-silent.wav';
const BREAKING_AUDIO_PUBLIC_URL = `/${BREAKING_AUDIO_RELATIVE_PATH}`;

export type RealScenarioName = DemoScenarioName | `real-${DemoScenarioName}` | 'stress';

export type RealSnapshotOwnership = {
  articleIds: string[];
  videoIds: string[];
  epaperIds: string[];
  epaperArticleIds: string[];
};

function snapshotRoot() {
  const configured = String(process.env.LOKSWAMI_SNAPSHOT_DIR || '').trim();
  return configured ? path.resolve(configured) : REAL_SNAPSHOT_DEFAULT_ROOT;
}

function assertInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Snapshot asset path escapes the configured snapshot root: ${candidate}`);
  }
}

export function loadRealSnapshotManifest(): SnapshotManifest {
  const root = snapshotRoot();
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `LokSwami snapshot manifest not found at ${manifestPath}. Run npm run content:snapshot:pull first.`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SnapshotManifest;
  if (parsed.sourceHost !== 'lokswami.com' || parsed.writeMethodsUsed.length !== 0) {
    throw new Error('Snapshot manifest failed the LokSwami read-only provenance check.');
  }
  return parsed;
}

function localSourcePath(reference?: SnapshotMediaReference) {
  if (!reference || reference.status !== 'downloaded' || !reference.localPath) return null;
  const root = snapshotRoot();
  const candidate = path.isAbsolute(reference.localPath)
    ? path.resolve(reference.localPath)
    : path.resolve(root, reference.localPath);
  assertInside(root, candidate);
  return candidate;
}

function publicAssetPath(reference: SnapshotMediaReference | undefined, fallback: string) {
  const source = localSourcePath(reference);
  return source ? `/demo/lokswami/${path.basename(source)}` : fallback;
}

function asDate(value: string, fallback: string) {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback) : date;
}

function provider(value: string, publicUrl: string): 'youtube' | 'spaces-mp4' {
  return value.toLowerCase().includes('youtube') || publicUrl.includes('youtube.com')
    ? 'youtube'
    : 'spaces-mp4';
}

function scenarioBaseName(name: string): DemoScenarioName {
  const normalized = name.trim().toLowerCase().replace(/^real-/, '');
  const supported: DemoScenarioName[] = [
    'full',
    'shell',
    'homepage',
    'article',
    'video',
    'epaper',
    'breaking-short',
    'breaking-long',
  ];
  if (!supported.includes(normalized as DemoScenarioName)) {
    throw new Error(
      `Unknown real snapshot scenario "${name}". Supported: ${supported.join(', ')}`
    );
  }
  return normalized as DemoScenarioName;
}

function breakingArticleIds(manifest: SnapshotManifest, scenario: DemoScenarioName) {
  const linked = manifest.breaking
    .filter((item) => item.articleLocalId)
    .sort((a, b) => a.title.length - b.title.length);
  if (scenario === 'breaking-short' || scenario === 'shell') {
    return new Set(linked.slice(0, 1).map((item) => item.articleLocalId as string));
  }
  if (scenario === 'breaking-long') {
    return new Set(linked.slice(-1).map((item) => item.articleLocalId as string));
  }
  return new Set(linked.map((item) => item.articleLocalId as string));
}

function toArticleFixtures(
  manifest: SnapshotManifest,
  scenario: DemoScenarioName,
  breaking: 'snapshot' | 'none'
): DemoArticleFixture[] {
  const breakingIds = breaking === 'none' ? new Set<string>() : breakingArticleIds(manifest, scenario);
  return manifest.articles.map((article) => {
    const publishedAt = asDate(article.publishedAt, manifest.pulledAt);
    const updatedAt = asDate(article.updatedAt, article.publishedAt || manifest.pulledAt);
    const isBreaking = breakingIds.has(article.localId);
    const expected = isBreaking ? buildBreakingTtsExpectation({ title: article.title }) : null;
    return {
      _id: article.localId,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      content: article.content,
      image: publicAssetPath(article.image, ''),
      category: article.category,
      author: article.author,
      views: 0,
      isBreaking,
      isTrending: false,
      tags: article.tags,
      publishedAt,
      updatedAt,
      workflow: { status: 'published', publishedAt },
      editorial: { storyType: 'standard', factCheckStatus: 'verified' },
      reporterMeta: { reporterId: article.localId, reporterName: article.author },
      seo: {
        metaTitle: article.title,
        metaDescription: article.summary,
        focusKeyword: article.tags[0] || article.category,
      },
      breakingTts: expected
        ? {
            audioUrl: BREAKING_AUDIO_PUBLIC_URL,
            textHash: expected.textHash,
            languageCode: expected.languageCode === 'en-IN' ? 'en-IN' : 'hi-IN',
            voice: 'manual',
            model: 'manual',
            mimeType: 'audio/wav',
            generatedAt: asDate(manifest.pulledAt, new Date().toISOString()),
          }
        : null,
    };
  });
}

function toVideoFixtures(manifest: SnapshotManifest): DemoVideoFixture[] {
  return manifest.videos.map((video) => {
    const publishedAt = asDate(video.publishedAt, manifest.pulledAt);
    return {
      _id: video.localId,
      slug: video.slug,
      title: video.title,
      description: video.description,
      thumbnail: publicAssetPath(video.thumbnail, ''),
      videoUrl: video.publicUrl,
      duration: video.durationSeconds,
      category: video.category,
      isShort: false,
      isPublished: true,
      aspectRatio: '16:9',
      views: 0,
      mediaProvider: provider(video.provider, video.publicUrl),
      processingStatus: 'ready',
      createdAt: publishedAt,
      publishedAt,
      updatedAt: publishedAt,
    };
  });
}

function toShortFixtures(manifest: SnapshotManifest): DemoShortFixture[] {
  return manifest.shorts
    .filter((short) => short.supported && short.articleLocalId)
    .map((short, index) => {
      const publishedAt = asDate(short.publishedAt, manifest.pulledAt);
      return {
        _id: short.localId,
        slug: short.slug,
        title: short.title,
        description: short.description,
        thumbnail: publicAssetPath(short.thumbnail, ''),
        videoUrl: short.publicUrl,
        duration: short.durationSeconds,
        category: short.category,
        isShort: true,
        isPublished: true,
        aspectRatio: '9:16',
        shortsRank: index + 1,
        views: 0,
        articleId: short.articleLocalId as string,
        mediaProvider: provider(short.provider, short.publicUrl),
        processingStatus: 'ready',
        createdAt: publishedAt,
        publishedAt,
        updatedAt: publishedAt,
      };
    });
}

function toEpaperFixtures(manifest: SnapshotManifest): DemoEpaperFixture[] {
  return manifest.epapers.map((issue) => {
    const publishedAt = asDate(issue.publishDate, manifest.pulledAt);
    return {
      _id: issue.localId,
      publicationType: 'epaper',
      city: issue.city,
      citySlug: issue.citySlug,
      title: issue.title,
      description: `LokSwami public E-Paper snapshot captured from ${issue.sourceUrl}`,
      publishDate: issue.publishDate.slice(0, 10),
      thumbnailPath: publicAssetPath(issue.thumbnail, '/demo/epaper-3x4.svg'),
      pdfPath: publicAssetPath(issue.pdf, '/demo/sample.pdf'),
      pages: issue.pageCount,
      status: 'published',
      productionStatus: 'published',
      familyId: `snapshot-${issue.localId}`,
      revisionNumber: 1,
      isCurrentRevision: true,
      publishedAt,
      createdAt: publishedAt,
      updatedAt: publishedAt,
      articleHotspots: [],
      articles: [],
    };
  });
}

function toMagazineFixtures(manifest: SnapshotManifest): DemoMagazineFixture[] {
  return manifest.emagazines.map((issue) => {
    const publishedAt = asDate(issue.publishDate, manifest.pulledAt);
    return {
      _id: issue.localId,
      publicationType: 'emagazine',
      city: issue.city,
      citySlug: issue.citySlug,
      title: issue.title,
      description: `LokSwami public E-Magazine snapshot captured from ${issue.sourceUrl}`,
      publishDate: issue.publishDate.slice(0, 10),
      thumbnailPath: publicAssetPath(issue.thumbnail, '/demo/epaper-3x4.svg'),
      pdfPath: publicAssetPath(issue.pdf, '/demo/sample.pdf'),
      pages: issue.pageCount,
      status: 'published',
      productionStatus: 'published',
      familyId: `snapshot-${issue.localId}`,
      revisionNumber: 1,
      isCurrentRevision: true,
      publishedAt,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    };
  });
}

export function resolveRealSnapshotPlan(
  scenarioName: string = 'full',
  options: { breaking?: 'snapshot' | 'none' } = {}
): ScenarioFixturePlan {
  const manifest = loadRealSnapshotManifest();
  const scenario = scenarioBaseName(scenarioName);
  const allArticles = toArticleFixtures(manifest, scenario, options.breaking || 'snapshot');
  const allVideos = toVideoFixtures(manifest);
  const allShorts = toShortFixtures(manifest);
  const allEpapers = toEpaperFixtures(manifest);
  const allMagazines = toMagazineFixtures(manifest);

  const plan: ScenarioFixturePlan = {
    name: scenario,
    description: `Real LokSwami public snapshot (${manifest.pulledAt})`,
    articles: allArticles,
    videos: allVideos,
    shorts: allShorts,
    epapers: allEpapers,
    magazines: allMagazines,
  };

  if (scenario === 'article') return { ...plan, videos: [], shorts: [], epapers: [], magazines: [] };
  if (scenario === 'video') return { ...plan, epapers: [], magazines: [] };
  if (scenario === 'epaper') return { ...plan, articles: [], videos: [], shorts: [] };
  if (scenario === 'homepage') {
    return {
      ...plan,
      articles: allArticles.slice(0, 16),
      videos: allVideos.slice(0, 6),
      shorts: allShorts.slice(0, 6),
      epapers: allEpapers.slice(0, 1),
      magazines: allMagazines.slice(0, 1),
    };
  }
  if (scenario === 'shell') {
    return {
      ...plan,
      articles: allArticles.slice(0, 20),
      videos: allVideos.slice(0, 6),
      shorts: allShorts.slice(0, 6),
      epapers: allEpapers.slice(0, 1),
      magazines: allMagazines.slice(0, 1),
    };
  }
  if (scenario === 'breaking-short' || scenario === 'breaking-long') {
    return { ...plan, videos: [], shorts: [], epapers: [], magazines: [] };
  }
  return plan;
}

function allMedia(manifest: SnapshotManifest) {
  return [
    ...manifest.articles.flatMap((item) => item.image ? [item.image] : []),
    ...manifest.videos.flatMap((item) => item.thumbnail ? [item.thumbnail] : []),
    ...manifest.shorts.flatMap((item) => item.thumbnail ? [item.thumbnail] : []),
    ...manifest.epapers.flatMap((item) => [item.thumbnail, item.pdf, ...item.pages].filter(Boolean) as SnapshotMediaReference[]),
    ...manifest.emagazines.flatMap((item) => [item.thumbnail, item.pdf, ...item.pages].filter(Boolean) as SnapshotMediaReference[]),
  ];
}

function makeSilentWav() {
  const sampleRate = 8_000;
  const samples = 2_000;
  const dataBytes = samples * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

export async function ensureRealSnapshotAssets(manifest = loadRealSnapshotManifest()) {
  await fsp.mkdir(PUBLIC_SNAPSHOT_DIR, { recursive: true });
  let copied = 0;
  for (const reference of allMedia(manifest)) {
    const source = localSourcePath(reference);
    if (!source) continue;
    await fsp.copyFile(source, path.join(PUBLIC_SNAPSHOT_DIR, path.basename(source)));
    copied += 1;
  }

  const breakingAudioPath = path.resolve(process.cwd(), 'public', BREAKING_AUDIO_RELATIVE_PATH);
  await fsp.mkdir(path.dirname(breakingAudioPath), { recursive: true });
  await fsp.writeFile(breakingAudioPath, makeSilentWav());
  return { copied, breakingAudioPath };
}

export function getRealSnapshotOwnership(
  manifest = loadRealSnapshotManifest()
): RealSnapshotOwnership {
  return {
    articleIds: manifest.articles.map((item) => item.localId),
    videoIds: [
      ...manifest.videos.map((item) => item.localId),
      ...manifest.shorts.filter((item) => item.supported).map((item) => item.localId),
    ],
    epaperIds: [
      ...manifest.epapers.map((item) => item.localId),
      ...manifest.emagazines.map((item) => item.localId),
    ],
    epaperArticleIds: [],
  };
}
