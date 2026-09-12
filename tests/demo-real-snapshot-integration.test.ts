import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isOwnedHarnessFixtureId,
  resolveHarnessOwnership,
  resolveHarnessScenarioPlan,
  summarizeScenarioComposition,
} from '@/scripts/demo/engine';
import {
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotManifest,
} from '@/scripts/content-snapshot/types';

const originalSnapshotDir = process.env.LOKSWAMI_SNAPSHOT_DIR;
let temporaryDirectories: string[] = [];

function makeTemporarySnapshotDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lokswami-real-snapshot-'));
  temporaryDirectories.push(directory);
  return directory;
}

function makeManifest(): SnapshotManifest {
  const pulledAt = '2026-09-12T10:00:00.000Z';
  const articleOneId = '760000000000000000000001';
  const articleTwoId = '760000000000000000000002';

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    sourceHost: 'lokswami.com',
    sourceOrigin: 'https://lokswami.com',
    pulledAt,
    readMethodsUsed: ['GET'],
    writeMethodsUsed: [],
    endpoints: ['https://lokswami.com/main'],
    limits: {
      articles: 25,
      breaking: 2,
      videos: 8,
      shorts: 8,
      epapers: 3,
      emagazines: 1,
      concurrency: 2,
    },
    articles: [
      {
        type: 'article',
        sourceId: 'source-article-1',
        sourceUrl: 'https://lokswami.com/main/article/real-one',
        sourceCapturedAt: pulledAt,
        localId: articleOneId,
        slug: 'real-one',
        title: 'वास्तविक समाचार एक',
        summary: 'वास्तविक सारांश',
        content: '<p>वास्तविक लेख सामग्री</p>',
        category: 'Regional',
        author: 'लोकस्वामी डेस्क',
        tags: ['इंदौर'],
        publishedAt: pulledAt,
        updatedAt: pulledAt,
      },
      {
        type: 'article',
        sourceId: 'source-article-2',
        sourceUrl: 'https://lokswami.com/main/article/real-two',
        sourceCapturedAt: pulledAt,
        localId: articleTwoId,
        slug: 'real-two',
        title: 'वास्तविक समाचार दो',
        summary: 'दूसरा वास्तविक सारांश',
        content: '<p>दूसरे लेख की सामग्री</p>',
        category: 'National',
        author: 'लोकस्वामी डेस्क',
        tags: ['भारत'],
        publishedAt: pulledAt,
        updatedAt: pulledAt,
      },
    ],
    breaking: [
      {
        type: 'breaking',
        sourceId: 'source-breaking-1',
        sourceUrl: 'https://lokswami.com/main/article/real-one',
        sourceCapturedAt: pulledAt,
        localId: '760000000000000000000101',
        title: 'वास्तविक ब्रेकिंग समाचार',
        articleSourceId: 'source-article-1',
        articleLocalId: articleOneId,
        category: 'Regional',
        city: 'Indore',
        publishedAt: pulledAt,
      },
    ],
    videos: [
      {
        type: 'video',
        sourceId: 'source-video-1',
        sourceUrl: 'https://lokswami.com/main/videos',
        sourceCapturedAt: pulledAt,
        localId: '760000000000000000000201',
        slug: 'real-video',
        title: 'वास्तविक वीडियो',
        description: 'वीडियो विवरण',
        category: 'Regional',
        provider: 'youtube',
        publicUrl: 'https://www.youtube.com/watch?v=lokswami',
        durationSeconds: 60,
        publishedAt: pulledAt,
      },
    ],
    shorts: [
      {
        type: 'short',
        sourceId: 'source-short-valid',
        sourceUrl: 'https://lokswami.com/main/videos',
        sourceCapturedAt: pulledAt,
        localId: '760000000000000000000301',
        slug: 'real-short-valid',
        title: 'लेख से जुड़ा शॉर्ट',
        description: 'शॉर्ट विवरण',
        category: 'Regional',
        provider: 'youtube',
        publicUrl: 'https://www.youtube.com/shorts/lokswami',
        durationSeconds: 30,
        publishedAt: pulledAt,
        articleSourceId: 'source-article-1',
        articleLocalId: articleOneId,
        supported: true,
      },
      {
        type: 'short',
        sourceId: 'source-short-orphan',
        sourceUrl: 'https://lokswami.com/main/videos',
        sourceCapturedAt: pulledAt,
        localId: '760000000000000000000302',
        slug: 'real-short-orphan',
        title: 'गायब लेख वाला शॉर्ट',
        description: 'यह प्रकाशित नहीं होना चाहिए',
        category: 'Regional',
        provider: 'youtube',
        publicUrl: 'https://www.youtube.com/shorts/orphan',
        durationSeconds: 20,
        publishedAt: pulledAt,
        articleLocalId: '760000000000000000009999',
        supported: true,
      },
      {
        type: 'short',
        sourceId: 'source-short-unsupported',
        sourceUrl: 'https://lokswami.com/main/videos',
        sourceCapturedAt: pulledAt,
        localId: '760000000000000000000303',
        slug: 'real-short-unsupported',
        title: 'असमर्थित शॉर्ट',
        description: 'यह भी प्रकाशित नहीं होना चाहिए',
        category: 'Regional',
        provider: 'youtube',
        publicUrl: 'https://www.youtube.com/shorts/unsupported',
        durationSeconds: 15,
        publishedAt: pulledAt,
        articleLocalId: articleTwoId,
        supported: false,
        unsupportedReason: 'No public relationship',
      },
    ],
    epapers: [
      {
        type: 'epaper',
        sourceId: 'source-epaper-1',
        sourceUrl: 'https://lokswami.com/main/epaper',
        sourceCapturedAt: pulledAt,
        localId: '760000000000000000000401',
        title: 'लोकस्वामी इंदौर संस्करण',
        city: 'Indore',
        citySlug: 'indore',
        publishDate: '2026-09-12',
        pageCount: 2,
        publicUrl: 'https://lokswami.com/main/epaper',
        pages: [],
      },
    ],
    emagazines: [
      {
        type: 'emagazine',
        sourceId: 'source-magazine-1',
        sourceUrl: 'https://lokswami.com/main/epaper',
        sourceCapturedAt: pulledAt,
        localId: '760000000000000000000501',
        title: 'लोकस्वामी मासिक',
        city: 'Indore',
        citySlug: 'indore',
        publishDate: '2026-09-01',
        pageCount: 4,
        publicUrl: 'https://lokswami.com/main/epaper',
        pages: [],
      },
    ],
    errors: [],
    assetSummary: { downloaded: 0, unavailable: 0 },
  };
}

function writeManifest(directory: string, manifest = makeManifest()) {
  fs.writeFileSync(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
}

beforeEach(() => {
  temporaryDirectories = [];
});

afterEach(() => {
  if (originalSnapshotDir === undefined) {
    delete process.env.LOKSWAMI_SNAPSHOT_DIR;
  } else {
    process.env.LOKSWAMI_SNAPSHOT_DIR = originalSnapshotDir;
  }
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('real snapshot demo harness integration', () => {
  it('maps a full LokSwami manifest, omits orphan shorts, and reports 100% real content', () => {
    const directory = makeTemporarySnapshotDirectory();
    writeManifest(directory);
    process.env.LOKSWAMI_SNAPSHOT_DIR = directory;

    const plan = resolveHarnessScenarioPlan('real-full', { source: 'lokswami' });
    const composition = summarizeScenarioComposition(plan, 'lokswami');

    expect(plan.articles.map((article) => article.slug)).toEqual(['real-one', 'real-two']);
    expect(plan.videos.map((video) => video.slug)).toEqual(['real-video']);
    expect(plan.shorts.map((short) => short.slug)).toEqual(['real-short-valid']);
    expect(plan.epapers).toHaveLength(1);
    expect(plan.magazines).toHaveLength(1);
    expect(composition).toEqual({ total: 6, real: 6, synthetic: 0, realPercent: 100 });
  });

  it('composes breaking=none without changing the source snapshot', () => {
    const directory = makeTemporarySnapshotDirectory();
    const manifest = makeManifest();
    writeManifest(directory, manifest);
    process.env.LOKSWAMI_SNAPSHOT_DIR = directory;

    const plan = resolveHarnessScenarioPlan('full', {
      source: 'lokswami',
      breaking: 'none',
    });

    expect(plan.articles.every((article) => article.isBreaking === false)).toBe(true);
    expect(makeManifest().breaking).toEqual(manifest.breaking);
  });

  it('derives reset ownership from exact manifest IDs only', () => {
    const directory = makeTemporarySnapshotDirectory();
    writeManifest(directory);
    process.env.LOKSWAMI_SNAPSHOT_DIR = directory;

    const ownership = resolveHarnessOwnership({ source: 'lokswami' });
    expect(ownership.articleIds).toEqual([
      '760000000000000000000001',
      '760000000000000000000002',
    ]);
    expect(isOwnedHarnessFixtureId('article', ownership.articleIds[0], { source: 'lokswami' })).toBe(true);
    expect(isOwnedHarnessFixtureId('article', 'demo-unrelated-article', { source: 'lokswami' })).toBe(false);
    expect(isOwnedHarnessFixtureId('video', 'demo-unrelated-video', { source: 'lokswami' })).toBe(false);
    expect(isOwnedHarnessFixtureId('epaper', 'demo-unrelated-epaper', { source: 'lokswami' })).toBe(false);
  });

  it('refuses LokSwami source selection when the manifest is missing', () => {
    const directory = makeTemporarySnapshotDirectory();
    process.env.LOKSWAMI_SNAPSHOT_DIR = directory;

    expect(() => resolveHarnessScenarioPlan('full', { source: 'lokswami' })).toThrow(
      /snapshot manifest not found/i
    );
  });
});
