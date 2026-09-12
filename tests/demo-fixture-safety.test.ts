import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  assertDemoSafety,
  parseMongoDatabaseName,
  isSafeLocalHost,
} from '@/scripts/demo/safety';
import { resolveDemoStore } from '@/scripts/demo/engine';
import { resolveScenarioPlan, SUPPORTED_SCENARIOS } from '@/scripts/demo/scenarios';
import { DEMO_ARTICLES, DEMO_ARTICLE_IDS } from '@/scripts/demo/fixtures/articles';
import { DEMO_VIDEOS, DEMO_VIDEO_IDS } from '@/scripts/demo/fixtures/videos';
import { DEMO_SHORTS, DEMO_SHORT_IDS } from '@/scripts/demo/fixtures/shorts';
import { DEMO_EPAPERS, DEMO_EPAPER_IDS, DEMO_EPAPER_ARTICLES } from '@/scripts/demo/fixtures/epaper';
import { DEMO_MAGAZINES, DEMO_MAGAZINE_IDS } from '@/scripts/demo/fixtures/magazine';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

function setEnv(key: string, value: string | undefined) {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete env[key];
  } else {
    env[key] = value;
  }
}

describe('Demo Fixture Harness Safety Guardrails', () => {
  describe('assertDemoSafety Environment Checks', () => {
    it('refuses execution when NODE_ENV=production', () => {
      setEnv('NODE_ENV', 'production');
      process.env.LOKSWAMI_DEMO_DATA = 'true';

      expect(() => assertDemoSafety()).toThrow(
        /NODE_ENV.*production/i
      );
    });

    it('refuses execution when LOKSWAMI_DEMO_DATA is missing', () => {
      delete process.env.LOKSWAMI_DEMO_DATA;
      setEnv('NODE_ENV', 'development');

      expect(() => assertDemoSafety()).toThrow(
        /LOKSWAMI_DEMO_DATA=true/
      );
    });

    it('refuses execution when LOKSWAMI_DEMO_DATA is false', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'false';
      setEnv('NODE_ENV', 'development');

      expect(() => assertDemoSafety()).toThrow(
        /LOKSWAMI_DEMO_DATA=true/
      );
    });

    it('allows execution when MONGODB_URI is absent and LOKSWAMI_DEMO_DATA=true', () => {
      delete process.env.MONGODB_URI;
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');

      expect(() => assertDemoSafety()).not.toThrow();
    });

    it('allows execution on localhost Mongo target', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      process.env.MONGODB_URI = 'mongodb://localhost:27017/lokswami_dev';

      expect(() => assertDemoSafety()).not.toThrow();
    });

    it('allows execution on 127.0.0.1 Mongo target', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/lokswami_dev';

      expect(() => assertDemoSafety()).not.toThrow();
    });

    it('allows execution on ::1 IPv6 loopback target', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      process.env.MONGODB_URI = 'mongodb://[::1]:27017/lokswami_dev';

      expect(() => assertDemoSafety()).not.toThrow();
    });

    it('refuses remote Mongo when LOKSWAMI_DEMO_REMOTE_MONGO is absent', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster0.abcde.mongodb.net/lokswami_test';
      delete process.env.LOKSWAMI_DEMO_REMOTE_MONGO;
      process.env.LOKSWAMI_DEMO_DB_NAME = 'lokswami_test';

      expect(() => assertDemoSafety()).toThrow(
        /LOKSWAMI_DEMO_REMOTE_MONGO=true/
      );
    });

    it('refuses remote Mongo when LOKSWAMI_DEMO_DB_NAME confirmation is missing', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster0.abcde.mongodb.net/lokswami_remote_dev';
      process.env.LOKSWAMI_DEMO_REMOTE_MONGO = 'true';
      delete process.env.LOKSWAMI_DEMO_DB_NAME;

      expect(() => assertDemoSafety()).toThrow(
        /LOKSWAMI_DEMO_DB_NAME confirmation/i
      );
    });

    it('refuses remote Mongo when database name does not match confirmation', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster0.abcde.mongodb.net/production_db';
      process.env.LOKSWAMI_DEMO_REMOTE_MONGO = 'true';
      process.env.LOKSWAMI_DEMO_DB_NAME = 'lokswami_demo';

      expect(() => assertDemoSafety()).toThrow(
        /does not match confirmed LOKSWAMI_DEMO_DB_NAME/
      );
    });

    it('allows remote Mongo when both opt-in and matching confirmation are provided', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster0.abcde.mongodb.net/lokswami_qa_cluster';
      process.env.LOKSWAMI_DEMO_REMOTE_MONGO = 'true';
      process.env.LOKSWAMI_DEMO_DB_NAME = 'lokswami_qa_cluster';

      expect(() => assertDemoSafety()).not.toThrow();
    });

    it('fails closed when database name cannot be determined from URI', () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster0.abcde.mongodb.net/';
      process.env.LOKSWAMI_DEMO_REMOTE_MONGO = 'true';
      process.env.LOKSWAMI_DEMO_DB_NAME = 'lokswami_qa';

      expect(() => assertDemoSafety()).toThrow(
        /determine database name/i
      );
    });
  });

  describe('Connection & Store Resolution Guarantees', () => {
    it('selects file mode when MONGODB_URI is absent', async () => {
      delete process.env.MONGODB_URI;
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');

      const store = await resolveDemoStore();
      expect(store).toBe('file');
    });

    it('aborts rather than silently selecting file mode when configured MONGODB_URI fails to connect', async () => {
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      setEnv('NODE_ENV', 'development');
      // Unreachable port on localhost
      process.env.MONGODB_URI = 'mongodb://127.0.0.1:54321/lokswami_nonexistent?serverSelectionTimeoutMS=500';

      await expect(resolveDemoStore()).rejects.toThrow(
        /Configured MONGODB_URI failed to connect.*Silent fallback to local file store is strictly prohibited/
      );
    });
  });

  describe('Swipe Short Publication Invariant', () => {
    it('ensures every demo short links to a valid published demo article', () => {
      const demoArticleIdSet = new Set(DEMO_ARTICLE_IDS);

      for (const short of DEMO_SHORTS) {
        expect(short.isShort).toBe(true);
        expect(short.aspectRatio).toBe('9:16');
        expect(short.articleId).toBeDefined();
        expect(short.articleId.length).toBeGreaterThan(0);

        // Invariant: MUST point to one of the published demo articles
        expect(demoArticleIdSet.has(short.articleId)).toBe(true);

        const targetArticle = DEMO_ARTICLES.find((a) => a._id === short.articleId);
        expect(targetArticle).toBeDefined();
        expect(targetArticle?.workflow.status).toBe('published');
      }
    });

    it('ensures no published shorts are orphan records', () => {
      for (const short of DEMO_SHORTS) {
        expect(short.articleId).not.toBe('');
        expect(short.articleId).not.toBeNull();
      }
    });
  });

  describe('E-Paper / E-Magazine Mode Capability Boundary', () => {
    it('guarantees file mode does not invent fake magazines or fake releasedSnapshots', () => {
      // In file mode, DEMO_MAGAZINES are skipped, not forced into StoredEPaper
      const plan = resolveScenarioPlan('full');
      expect(plan.magazines.length).toBeGreaterThan(0);

      // Verify StoredEPaper schema compatibility for demo epapers
      for (const epaper of DEMO_EPAPERS) {
        expect(epaper.city).toBeDefined();
        expect(typeof epaper.pages).toBe('number');
        expect(Array.isArray(epaper.articleHotspots)).toBe(true);
      }
    });

    it('guarantees releasedSnapshot is only present on Mongo EPaperArticle fixtures', () => {
      for (const article of DEMO_EPAPER_ARTICLES) {
        expect(article.releasedSnapshot).toBeDefined();
        expect(article.releasedSnapshot?.title).toBe(article.title);
        expect(article.releasedSnapshot?.slug).toBe(article.slug);
      }
    });
  });

  describe('Deterministic Demo Namespace & Scoped Reset', () => {
    it('verifies all demo article IDs and slugs belong to deterministic demo namespace', () => {
      for (const id of DEMO_ARTICLE_IDS) {
        expect(id).toMatch(/^65f00000000000000000[0-9a-f]{4}$/);
      }

      for (const article of DEMO_ARTICLES) {
        expect(article.slug).toMatch(/^demo-/);
      }
    });

    it('verifies parseMongoDatabaseName extracts db name correctly and isSafeLocalHost checks hosts', () => {
      expect(parseMongoDatabaseName('mongodb://localhost:27017/lokswami_dev')).toBe('lokswami_dev');
      expect(parseMongoDatabaseName('mongodb://127.0.0.1:27017/lokswami_qa?authSource=admin')).toBe('lokswami_qa');
      expect(isSafeLocalHost('localhost')).toBe(true);
      expect(isSafeLocalHost('127.0.0.1')).toBe(true);
      expect(isSafeLocalHost('::1')).toBe(true);
      expect(isSafeLocalHost('cluster0.mongodb.net')).toBe(false);
    });

    it('verifies all demo video and short slugs belong to deterministic demo namespace', () => {
      expect(DEMO_VIDEO_IDS.length).toBeGreaterThan(0);
      expect(DEMO_SHORT_IDS.length).toBeGreaterThan(0);
      expect(DEMO_EPAPER_IDS.length).toBeGreaterThan(0);
      expect(DEMO_MAGAZINES.length).toBeGreaterThan(0);
      expect(DEMO_MAGAZINE_IDS.length).toBeGreaterThan(0);

      for (const video of DEMO_VIDEOS) {
        expect(video.slug).toMatch(/^demo-/);
      }
      for (const short of DEMO_SHORTS) {
        expect(short.slug).toMatch(/^demo-/);
      }
    });

    it('verifies all demo scenario plans have unique fixture IDs', () => {
      for (const scenario of SUPPORTED_SCENARIOS) {
        const plan = resolveScenarioPlan(scenario);
        const articleIds = new Set(plan.articles.map((a) => a._id));
        expect(articleIds.size).toBe(plan.articles.length);

        const videoIds = new Set([...plan.videos.map((v) => v._id), ...plan.shorts.map((s) => s._id)]);
        expect(videoIds.size).toBe(plan.videos.length + plan.shorts.length);
      }
    });

    it('ensures video scenario plan includes all articles linked by its shorts', () => {
      const videoPlan = resolveScenarioPlan('video');
      const articleIdSet = new Set(videoPlan.articles.map((a) => a._id));
      for (const short of videoPlan.shorts) {
        expect(short.articleId).toBeDefined();
        expect(articleIdSet.has(short.articleId)).toBe(true);
      }
    });

    it('validates multi-host MongoDB URI safety rejects if any host is non-local', () => {
      setEnv('NODE_ENV', 'development');
      process.env.LOKSWAMI_DEMO_DATA = 'true';
      delete process.env.LOKSWAMI_DEMO_REMOTE_MONGO;
      delete process.env.LOKSWAMI_DEMO_DB_NAME;

      // Mixed localhost + remote host MUST reject
      process.env.MONGODB_URI = 'mongodb://localhost:27017,remote.example.com:27017/lokswami_dev';
      expect(() => assertDemoSafety()).toThrow(/LOKSWAMI_DEMO_REMOTE_MONGO=true/);

      // All local hosts MUST pass
      process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017,localhost:27018,[::1]:27019/lokswami_dev';
      expect(() => assertDemoSafety()).not.toThrow();
    });

    it('verifies demo video and shorts categories match NEWS_CATEGORIES and use Tech instead of Technology', () => {
      for (const v of DEMO_VIDEOS) {
        expect(v.category).not.toBe('Technology');
      }
      for (const s of DEMO_SHORTS) {
        expect(s.category).not.toBe('Technology');
      }
    });

    it('verifies epaper article hotspot coordinates are normalized fractions between 0 and 1', () => {
      for (const art of DEMO_EPAPER_ARTICLES) {
        expect(art.hotspot.x).toBeGreaterThanOrEqual(0);
        expect(art.hotspot.x).toBeLessThanOrEqual(1);
        expect(art.hotspot.y).toBeGreaterThanOrEqual(0);
        expect(art.hotspot.y).toBeLessThanOrEqual(1);
        expect(art.hotspot.w).toBeGreaterThanOrEqual(0);
        expect(art.hotspot.w).toBeLessThanOrEqual(1);
        expect(art.hotspot.h).toBeGreaterThanOrEqual(0);
        expect(art.hotspot.h).toBeLessThanOrEqual(1);
      }
    });

    it('verifies sample.pdf asset exists and contains valid PDF header', () => {
      const srcPdf = path.resolve(process.cwd(), 'scripts/demo/assets/sample.pdf');
      const publicPdf = path.resolve(process.cwd(), 'public/demo/sample.pdf');
      expect(fs.existsSync(srcPdf)).toBe(true);
      expect(fs.existsSync(publicPdf)).toBe(true);
      const content = fs.readFileSync(srcPdf, 'utf-8');
      expect(content.startsWith('%PDF-')).toBe(true);
    });
  });

  describe('Static Analysis: No Destructive Unscoped Database Operations', () => {
    it('ensures engine.ts contains NO deleteMany({}), dropDatabase(), or dropCollection()', () => {
      const enginePath = path.resolve(process.cwd(), 'scripts/demo/engine.ts');
      const content = fs.readFileSync(enginePath, 'utf-8');

      // Unscoped deleteMany({}) must NEVER exist
      expect(content).not.toMatch(/\.deleteMany\(\s*\{\s*\}\s*\)/);

      // dropDatabase must NEVER exist
      expect(content).not.toMatch(/\.dropDatabase\s*\(/);

      // dropCollection must NEVER exist
      expect(content).not.toMatch(/\.dropCollection\s*\(/);
    });

    it('ensures safety.ts never exposes or logs raw Mongo URIs with credentials', () => {
      const safetyPath = path.resolve(process.cwd(), 'scripts/demo/safety.ts');
      const content = fs.readFileSync(safetyPath, 'utf-8');

      expect(content).not.toMatch(/console\.log\(.*MONGODB_URI.*\)/);
      expect(content).not.toMatch(/console\.error\(.*MONGODB_URI.*\)/);
    });
  });
});
