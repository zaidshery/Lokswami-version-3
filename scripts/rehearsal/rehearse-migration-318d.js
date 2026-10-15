#!/usr/bin/env node
'use strict';

/**
 * scripts/rehearsal/rehearse-migration-318d.js
 *
 * Phase 3.18D Migration Rehearsal & Idempotency Testing Engine.
 * 
 * Target: Isolated rehearsal namespace within staging MongoDB Atlas (`lokswami_staging`).
 * Source: Approved 1-month public snapshot (September - October 2026).
 *
 * Usage:
 *   node scripts/rehearsal/rehearse-migration-318d.js --validate
 *   node scripts/rehearsal/rehearse-migration-318d.js --execute
 *   node scripts/rehearsal/rehearse-migration-318d.js --reset
 *   node scripts/rehearsal/rehearse-migration-318d.js --reconcile
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const RELEASE_RC_COMMIT = '1cfc83c18583ba74dfe314c4a8283dfd05d639c2';
const SNAPSHOT_MANIFEST_PATH = path.resolve(
  'artifacts/phase3-qa/phase318c-office-20261013/archive-content-20261014/recovery-2026-10-13T20-25-43-073Z-fNEZgM/approved-public-snapshot/manifest.json'
);

const MIGRATION_OUT_DIR = path.resolve('artifacts/phase3-qa/3.18d-migration/migration');
const RECONCILIATION_OUT_DIR = path.resolve('artifacts/phase3-qa/3.18d-migration/reconciliation');

// Rehearsal collection names in lokswami_staging
const COLLECTIONS = {
  articles: 'rehearsal_318d_articles',
  epapers: 'rehearsal_318d_epapers',
  videos: 'rehearsal_318d_videos',
  categories: 'rehearsal_318d_categories',
  media: 'rehearsal_318d_media',
  rehearsalRuns: 'rehearsal_318d_runs'
};

function loadStagingEnv() {
  const envPath = path.resolve('.env.staging.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.staging.local not found. Cannot run staging migration rehearsal.');
  }
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  if (!parsed.MONGODB_URI) {
    throw new Error('MONGODB_URI missing from .env.staging.local');
  }
  return parsed;
}

function loadManifest() {
  if (!fs.existsSync(SNAPSHOT_MANIFEST_PATH)) {
    throw new Error(`Snapshot manifest not found at: ${SNAPSHOT_MANIFEST_PATH}`);
  }
  return JSON.parse(fs.readFileSync(SNAPSHOT_MANIFEST_PATH, 'utf8'));
}

async function connectToMongo(uri) {
  const conn = await mongoose.connect(uri);
  return conn;
}

async function validateManifestData(manifest) {
  console.log('--- Step 1: Validating Source Manifest Structure ---');
  const issues = [];

  const articleCount = (manifest.articles || []).length;
  const breakingCount = (manifest.breaking || []).length;
  const videoCount = (manifest.videos || []).length;
  const shortCount = (manifest.shorts || []).length;
  const epaperCount = (manifest.epapers || []).length;
  const emagazineCount = (manifest.emagazines || []).length;

  console.log(`Articles: ${articleCount}`);
  console.log(`Breaking: ${breakingCount}`);
  console.log(`Videos: ${videoCount}`);
  console.log(`Shorts: ${shortCount}`);
  console.log(`E-papers: ${epaperCount}`);
  console.log(`E-magazines: ${emagazineCount}`);

  if (articleCount === 0) issues.push('No articles found in manifest');
  if (epaperCount === 0) issues.push('No epapers found in manifest');

  // Verify unique slugs in source
  const articleSlugs = new Set();
  manifest.articles.forEach((a, idx) => {
    if (!a.slug) issues.push(`Article at index ${idx} lacks slug`);
    if (articleSlugs.has(a.slug)) issues.push(`Duplicate article slug: ${a.slug}`);
    articleSlugs.add(a.slug);
    if (!a.title) issues.push(`Article ${a.slug} lacks title`);
  });

  const videoSlugs = new Set();
  manifest.videos.forEach((v, idx) => {
    if (!v.slug && !v.title) issues.push(`Video at index ${idx} lacks slug and title`);
    const key = v.slug || v.title;
    if (videoSlugs.has(key)) issues.push(`Duplicate video: ${key}`);
    videoSlugs.add(key);
  });

  return {
    valid: issues.length === 0,
    issues,
    summary: {
      articles: articleCount,
      breaking: breakingCount,
      videos: videoCount,
      shorts: shortCount,
      epapers: epaperCount,
      emagazines: emagazineCount
    }
  };
}

async function executeMigration(db, manifest) {
  console.log('\n--- Step 2: Executing Data Migration into Rehearsal Namespace ---');
  const startTime = new Date();
  const logs = [];

  // 1. Ensure indexes for idempotency
  await db.collection(COLLECTIONS.articles).createIndex({ slug: 1 }, { unique: true });
  await db.collection(COLLECTIONS.epapers).createIndex({ citySlug: 1, publishDate: 1, publicationType: 1 }, { unique: true });
  await db.collection(COLLECTIONS.videos).createIndex({ slug: 1 }, { unique: true, sparse: true });
  await db.collection(COLLECTIONS.categories).createIndex({ slug: 1 }, { unique: true });
  await db.collection(COLLECTIONS.media).createIndex({ sha256: 1 }, { unique: true, sparse: true });

  // 2. Categories extraction & migration
  const categoryMap = new Map();
  manifest.articles.forEach(a => {
    if (a.category && !categoryMap.has(a.category)) {
      categoryMap.set(a.category, {
        name: a.category,
        slug: a.category.toLowerCase().replace(/\s+/g, '-'),
        source: 'article'
      });
    }
  });
  manifest.videos.forEach(v => {
    if (v.category && !categoryMap.has(v.category)) {
      categoryMap.set(v.category, {
        name: v.category,
        slug: v.category.toLowerCase().replace(/\s+/g, '-'),
        source: 'video'
      });
    }
  });

  let categoriesUpserted = 0;
  for (const [name, cat] of categoryMap.entries()) {
    await db.collection(COLLECTIONS.categories).updateOne(
      { slug: cat.slug },
      {
        $set: {
          nameEn: name,
          nameHi: name,
          slug: cat.slug,
          isActive: true,
          rehearsalBatch: '3.18D',
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    categoriesUpserted++;
  }
  logs.push(`Categories processed: ${categoriesUpserted}`);

  // 3. Media migration
  let mediaUpserted = 0;
  const processMediaItem = async (m, kind) => {
    if (!m || !m.sha256) return;
    await db.collection(COLLECTIONS.media).updateOne(
      { sha256: m.sha256 },
      {
        $set: {
          sha256: m.sha256,
          sourceUrl: m.sourceUrl,
          localPath: m.localPath,
          contentType: m.contentType,
          sizeBytes: m.sizeBytes,
          kind: m.kind || kind,
          status: m.status || 'verified',
          rehearsalBatch: '3.18D',
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    mediaUpserted++;
  };

  for (const a of manifest.articles) {
    if (a.image) await processMediaItem(a.image, 'image');
  }
  for (const e of manifest.epapers) {
    if (e.thumbnail) await processMediaItem(e.thumbnail, 'image');
    if (e.pdf) await processMediaItem(e.pdf, 'pdf');
  }
  for (const m of (manifest.emagazines || [])) {
    if (m.thumbnail) await processMediaItem(m.thumbnail, 'image');
    if (m.pdf) await processMediaItem(m.pdf, 'pdf');
  }
  for (const v of manifest.videos) {
    if (v.thumbnail) await processMediaItem(v.thumbnail, 'image');
  }
  for (const s of manifest.shorts) {
    if (s.thumbnail) await processMediaItem(s.thumbnail, 'image');
  }
  logs.push(`Media items processed: ${mediaUpserted}`);

  // 4. Articles migration
  let articlesUpserted = 0;
  const breakingSet = new Set((manifest.breaking || []).map(b => b.slug || b.title));

  for (const a of manifest.articles) {
    const isBreaking = breakingSet.has(a.slug) || breakingSet.has(a.title);
    await db.collection(COLLECTIONS.articles).updateOne(
      { slug: a.slug },
      {
        $set: {
          title: a.title,
          slug: a.slug,
          summary: a.summary || '',
          content: a.content || '',
          category: a.category || 'General',
          author: a.author || 'Desk',
          tags: a.tags || [],
          image: a.image ? a.image.sourceUrl : '',
          imageSha256: a.image ? a.image.sha256 : null,
          isBreaking: isBreaking,
          isTrending: false,
          status: 'published',
          publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
          updatedAt: a.updatedAt ? new Date(a.updatedAt) : new Date(),
          rehearsalBatch: '3.18D',
          rehearsalCommit: RELEASE_RC_COMMIT
        },
        $setOnInsert: {
          version: 1,
          views: 0,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    articlesUpserted++;
  }
  logs.push(`Articles processed: ${articlesUpserted}`);

  // 5. Epapers & Emagazines migration
  let epapersUpserted = 0;
  for (const e of manifest.epapers) {
    await db.collection(COLLECTIONS.epapers).updateOne(
      {
        citySlug: e.citySlug,
        publishDate: new Date(e.publishDate),
        publicationType: 'epaper'
      },
      {
        $set: {
          title: e.title,
          city: e.city,
          citySlug: e.citySlug,
          publicationType: 'epaper',
          publishDate: new Date(e.publishDate),
          pageCount: e.pageCount || 0,
          thumbnailUrl: e.thumbnail ? e.thumbnail.sourceUrl : '',
          thumbnailSha256: e.thumbnail ? e.thumbnail.sha256 : null,
          pdfUrl: e.pdf ? e.pdf.sourceUrl : '',
          pdfSha256: e.pdf ? e.pdf.sha256 : null,
          status: 'published',
          rehearsalBatch: '3.18D',
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    epapersUpserted++;
  }

  for (const m of (manifest.emagazines || [])) {
    await db.collection(COLLECTIONS.epapers).updateOne(
      {
        citySlug: m.citySlug,
        publishDate: new Date(m.publishDate),
        publicationType: 'emagazine'
      },
      {
        $set: {
          title: m.title,
          city: m.city,
          citySlug: m.citySlug,
          publicationType: 'emagazine',
          publishDate: new Date(m.publishDate),
          pageCount: m.pageCount || 0,
          thumbnailUrl: m.thumbnail ? m.thumbnail.sourceUrl : '',
          thumbnailSha256: m.thumbnail ? m.thumbnail.sha256 : null,
          pdfUrl: m.pdf ? m.pdf.sourceUrl : '',
          pdfSha256: m.pdf ? m.pdf.sha256 : null,
          status: 'published',
          rehearsalBatch: '3.18D',
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    epapersUpserted++;
  }
  logs.push(`Epapers & Emagazines processed: ${epapersUpserted}`);

  // 6. Videos & Shorts migration
  let videosUpserted = 0;
  for (const v of manifest.videos) {
    await db.collection(COLLECTIONS.videos).updateOne(
      { slug: v.slug || v.title },
      {
        $set: {
          title: v.title,
          slug: v.slug || v.title,
          description: v.description || '',
          category: v.category || 'National',
          provider: v.provider || 'youtube',
          videoUrl: v.publicUrl || '',
          duration: v.durationSeconds || 0,
          isShort: false,
          isPublished: true,
          thumbnail: v.thumbnail ? v.thumbnail.sourceUrl : '',
          thumbnailSha256: v.thumbnail ? v.thumbnail.sha256 : null,
          publishedAt: v.publishedAt ? new Date(v.publishedAt) : new Date(),
          rehearsalBatch: '3.18D',
          updatedAt: new Date()
        },
        $setOnInsert: {
          views: 0,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    videosUpserted++;
  }

  for (const s of manifest.shorts) {
    await db.collection(COLLECTIONS.videos).updateOne(
      { slug: s.slug || s.title },
      {
        $set: {
          title: s.title,
          slug: s.slug || s.title,
          description: s.description || '',
          category: s.category || 'National',
          provider: s.provider || 'spaces-mp4',
          videoUrl: s.publicUrl || '',
          duration: s.durationSeconds || 0,
          isShort: true,
          isPublished: true,
          thumbnail: s.thumbnail ? s.thumbnail.sourceUrl : '',
          thumbnailSha256: s.thumbnail ? s.thumbnail.sha256 : null,
          publishedAt: s.publishedAt ? new Date(s.publishedAt) : new Date(),
          rehearsalBatch: '3.18D',
          updatedAt: new Date()
        },
        $setOnInsert: {
          views: 0,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    videosUpserted++;
  }
  logs.push(`Videos & Shorts processed: ${videosUpserted}`);

  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  const executionRecord = {
    rehearsalId: `REHEARSAL-3.18D-${startTime.toISOString().replace(/[:.]/g, '-')}`,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMs,
    releaseCandidateCommit: RELEASE_RC_COMMIT,
    sourceHost: manifest.sourceHost,
    counts: {
      categories: categoriesUpserted,
      media: mediaUpserted,
      articles: articlesUpserted,
      epapersAndMagazines: epapersUpserted,
      videosAndShorts: videosUpserted
    },
    logs,
    status: 'SUCCESS'
  };

  // Record rehearsal execution run in mongo
  await db.collection(COLLECTIONS.rehearsalRuns).insertOne(executionRecord);

  // Write execution artifact
  fs.mkdirSync(MIGRATION_OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(MIGRATION_OUT_DIR, 'MIGRATION_EXECUTION.json'),
    JSON.stringify(executionRecord, null, 2)
  );

  return executionRecord;
}

async function reconcileMigration(db, manifest) {
  console.log('\n--- Step 3: Reconciling Destination with Source Manifest ---');
  const discrepancies = [];

  // 1. Article count & slug check
  const destArticles = await db.collection(COLLECTIONS.articles).find().toArray();
  const destArticleMap = new Map(destArticles.map(a => [a.slug, a]));

  if (destArticles.length !== manifest.articles.length) {
    discrepancies.push(`Article count mismatch: source=${manifest.articles.length}, dest=${destArticles.length}`);
  }

  for (const srcArticle of manifest.articles) {
    const dest = destArticleMap.get(srcArticle.slug);
    if (!dest) {
      discrepancies.push(`Missing article in destination: ${srcArticle.slug}`);
      continue;
    }
    if (dest.title !== srcArticle.title) {
      discrepancies.push(`Title discrepancy on ${srcArticle.slug}`);
    }
    if (srcArticle.image && dest.imageSha256 !== srcArticle.image.sha256) {
      discrepancies.push(`Image SHA256 mismatch on ${srcArticle.slug}`);
    }
  }

  // 2. Epapers & Emagazines check
  const destEpapers = await db.collection(COLLECTIONS.epapers).find().toArray();
  const expectedEpaperTotal = manifest.epapers.length + (manifest.emagazines ? manifest.emagazines.length : 0);

  if (destEpapers.length !== expectedEpaperTotal) {
    discrepancies.push(`Epaper/Magazine count mismatch: source=${expectedEpaperTotal}, dest=${destEpapers.length}`);
  }

  // 3. Videos & Shorts check
  const destVideos = await db.collection(COLLECTIONS.videos).find().toArray();
  const expectedVideoTotal = manifest.videos.length + manifest.shorts.length;

  if (destVideos.length !== expectedVideoTotal) {
    discrepancies.push(`Video/Short count mismatch: source=${expectedVideoTotal}, dest=${destVideos.length}`);
  }

  // 4. Media SHA256 Check
  const destMedia = await db.collection(COLLECTIONS.media).find().toArray();
  const destMediaMap = new Map(destMedia.map(m => [m.sha256, m]));

  const sourceMediaHashes = new Set();
  manifest.articles.forEach(a => { if (a.image && a.image.sha256) sourceMediaHashes.add(a.image.sha256); });
  manifest.epapers.forEach(e => {
    if (e.thumbnail && e.thumbnail.sha256) sourceMediaHashes.add(e.thumbnail.sha256);
    if (e.pdf && e.pdf.sha256) sourceMediaHashes.add(e.pdf.sha256);
  });
  (manifest.emagazines || []).forEach(m => {
    if (m.thumbnail && m.thumbnail.sha256) sourceMediaHashes.add(m.thumbnail.sha256);
    if (m.pdf && m.pdf.sha256) sourceMediaHashes.add(m.pdf.sha256);
  });
  manifest.videos.forEach(v => { if (v.thumbnail && v.thumbnail.sha256) sourceMediaHashes.add(v.thumbnail.sha256); });
  manifest.shorts.forEach(s => { if (s.thumbnail && s.thumbnail.sha256) sourceMediaHashes.add(s.thumbnail.sha256); });

  for (const hash of sourceMediaHashes) {
    if (!destMediaMap.has(hash)) {
      discrepancies.push(`Missing media asset hash in destination: ${hash}`);
    }
  }

  const reconciliationReport = {
    evaluatedAt: new Date().toISOString(),
    sourceHost: manifest.sourceHost,
    releaseCandidateCommit: RELEASE_RC_COMMIT,
    comparison: {
      articles: {
        source: manifest.articles.length,
        destination: destArticles.length,
        match: destArticles.length === manifest.articles.length
      },
      epapers: {
        source: manifest.epapers.length,
        destination: destEpapers.filter(e => e.publicationType === 'epaper').length,
        match: destEpapers.filter(e => e.publicationType === 'epaper').length === manifest.epapers.length
      },
      emagazines: {
        source: manifest.emagazines ? manifest.emagazines.length : 0,
        destination: destEpapers.filter(e => e.publicationType === 'emagazine').length,
        match: destEpapers.filter(e => e.publicationType === 'emagazine').length === (manifest.emagazines ? manifest.emagazines.length : 0)
      },
      videos: {
        source: manifest.videos.length,
        destination: destVideos.filter(v => !v.isShort).length,
        match: destVideos.filter(v => !v.isShort).length === manifest.videos.length
      },
      shorts: {
        source: manifest.shorts.length,
        destination: destVideos.filter(v => v.isShort).length,
        match: destVideos.filter(v => v.isShort).length === manifest.shorts.length
      },
      mediaHashes: {
        sourceDistinctCount: sourceMediaHashes.size,
        destinationCount: destMedia.length,
        match: sourceMediaHashes.size <= destMedia.length
      }
    },
    discrepancies,
    status: discrepancies.length === 0 ? 'PASSED_100_PERCENT' : 'FAILED',
    gateStatus: discrepancies.length === 0 ? 'STAGE4_EXIT_GATE_APPROVED' : 'BLOCKED'
  };

  fs.mkdirSync(RECONCILIATION_OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(RECONCILIATION_OUT_DIR, 'RECONCILIATION_REPORT.json'),
    JSON.stringify(reconciliationReport, null, 2)
  );

  return reconciliationReport;
}

async function resetRehearsalNamespace(db) {
  console.log('\n--- Destructive Action: Resetting Rehearsal Collections ---');
  const dropped = [];
  for (const [key, colName] of Object.entries(COLLECTIONS)) {
    try {
      await db.collection(colName).drop();
      dropped.push(colName);
      console.log(`Dropped collection: ${colName}`);
    } catch (e) {
      // Ignored if collection does not exist
      if (e.code !== 26) {
        console.warn(`Note on dropping ${colName}:`, e.message);
      }
    }
  }
  return dropped;
}

async function main() {
  const args = process.argv.slice(2);
  const isValidate = args.includes('--validate');
  const isExecute = args.includes('--execute');
  const isReset = args.includes('--reset');
  const isReconcile = args.includes('--reconcile');

  if (!isValidate && !isExecute && !isReset && !isReconcile) {
    console.log(`
LokSwami Phase 3.18D Rehearsal Engine
Options:
  --validate   Validate source manifest integrity
  --execute    Execute migration into isolated staging namespace
  --reset      Drop rehearsal collections (for disaster recovery testing)
  --reconcile  Perform 1:1 reconciliation between source and staging destination
`);
    process.exit(0);
  }

  const manifest = loadManifest();
  const env = loadStagingEnv();
  const mongooseInstance = await connectToMongo(env.MONGODB_URI);
  const db = mongooseInstance.connection.db;

  console.log(`Connected to staging database: ${db.databaseName}`);

  try {
    if (isReset) {
      const dropped = await resetRehearsalNamespace(db);
      console.log(`Reset completed. Dropped ${dropped.length} collections.`);
    }

    if (isValidate) {
      const val = await validateManifestData(manifest);
      if (!val.valid) {
        console.error('Validation failed:', val.issues);
        process.exit(1);
      }
      console.log('Manifest validation: PASS');
    }

    if (isExecute) {
      const exec = await executeMigration(db, manifest);
      console.log(`Migration execution completed in ${exec.durationMs}ms with status: ${exec.status}`);
      const rec = await reconcileMigration(db, manifest);
      console.log(`Reconciliation status: ${rec.status}`);
      if (rec.status !== 'PASSED_100_PERCENT') {
        console.error('Reconciliation failed discrepancies:', rec.discrepancies);
        process.exit(1);
      }
    } else if (isReconcile) {
      const rec = await reconcileMigration(db, manifest);
      console.log(`Reconciliation status: ${rec.status}`);
      if (rec.status !== 'PASSED_100_PERCENT') {
        console.error('Reconciliation failed discrepancies:', rec.discrepancies);
        process.exit(1);
      }
    }
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

main().catch(err => {
  console.error('Fatal rehearsal error:', err);
  process.exit(1);
});
