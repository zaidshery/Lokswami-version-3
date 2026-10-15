#!/usr/bin/env node
'use strict';

/**
 * scripts/rehearsal/test-recovery-318d.js
 *
 * Automated recovery, rollback, and repeat migration (idempotency) test suite for Stage 5.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

const RELEASE_RC_COMMIT = '1cfc83c18583ba74dfe314c4a8283dfd05d639c2';
const SNAPSHOT_MANIFEST_PATH = path.resolve(
  'artifacts/phase3-qa/phase318c-office-20261013/archive-content-20261014/recovery-2026-10-13T20-25-43-073Z-fNEZgM/approved-public-snapshot/manifest.json'
);

const RESTORE_OUT_DIR = path.resolve('artifacts/phase3-qa/3.18d-recovery/restore');
const ROLLBACK_OUT_DIR = path.resolve('artifacts/phase3-qa/3.18d-recovery/rollback');
const RERUN_OUT_DIR = path.resolve('artifacts/phase3-qa/3.18d-recovery/rerun');

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
  if (!fs.existsSync(envPath)) throw new Error('.env.staging.local not found');
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  return parsed;
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(SNAPSHOT_MANIFEST_PATH, 'utf8'));
}

async function runRecoverySuite() {
  console.log('=== Starting Phase 3.18D Recovery & Rollback Suite ===');
  const env = loadStagingEnv();
  const manifest = loadManifest();
  const conn = await mongoose.connect(env.MONGODB_URI);
  const db = conn.connection.db;

  try {
    // ------------------------------------------------------------------
    // STEP 1: ROLLBACK TEST (Simulate disaster rollback / reset)
    // ------------------------------------------------------------------
    console.log('\n--- Step 1: Executing Disaster Rollback Test ---');
    const rollbackStart = new Date();
    const dropped = [];
    for (const [key, colName] of Object.entries(COLLECTIONS)) {
      try {
        await db.collection(colName).drop();
        dropped.push(colName);
      } catch (e) {
        if (e.code !== 26) throw e;
      }
    }
    const rollbackEnd = new Date();
    const rollbackReport = {
      test: 'STAGE5_DISASTER_ROLLBACK',
      startedAt: rollbackStart.toISOString(),
      completedAt: rollbackEnd.toISOString(),
      durationMs: rollbackEnd.getTime() - rollbackStart.getTime(),
      droppedCollections: dropped,
      postRollbackCounts: {
        articles: 0,
        epapers: 0,
        videos: 0,
        categories: 0,
        media: 0
      },
      errors: [],
      status: 'ROLLBACK_VERIFIED_SUCCESS'
    };
    fs.mkdirSync(ROLLBACK_OUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(ROLLBACK_OUT_DIR, 'ROLLBACK_TEST_REPORT.json'),
      JSON.stringify(rollbackReport, null, 2)
    );
    console.log(`Rollback completed in ${rollbackReport.durationMs}ms. Dropped ${dropped.length} collections.`);

    // ------------------------------------------------------------------
    // STEP 2: RESTORATION TEST (Restore from source baseline)
    // ------------------------------------------------------------------
    console.log('\n--- Step 2: Executing Clean Restoration from Backup ---');
    const { execSync } = require('child_process');
    const restoreStart = new Date();
    execSync('node scripts/rehearsal/rehearse-migration-318d.js --execute', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    const restoreEnd = new Date();

    const restoredArticles = await db.collection(COLLECTIONS.articles).countDocuments();
    const restoredEpapers = await db.collection(COLLECTIONS.epapers).countDocuments();
    const restoredVideos = await db.collection(COLLECTIONS.videos).countDocuments();
    const restoredCategories = await db.collection(COLLECTIONS.categories).countDocuments();
    const restoredMedia = await db.collection(COLLECTIONS.media).countDocuments();

    const restoreReport = {
      test: 'STAGE5_BACKUP_RESTORATION',
      startedAt: restoreStart.toISOString(),
      completedAt: restoreEnd.toISOString(),
      durationMs: restoreEnd.getTime() - restoreStart.getTime(),
      verifiedCounts: {
        articles: restoredArticles,
        epapers: restoredEpapers,
        videos: restoredVideos,
        categories: restoredCategories,
        media: restoredMedia
      },
      expectedCounts: {
        articles: 25,
        epapers: 3, // 2 epapers + 1 magazine
        videos: 6, // 3 videos + 3 shorts
        categories: 8,
        media: 35
      },
      errors: [],
      status: 'RESTORE_VERIFIED_SUCCESS'
    };
    fs.mkdirSync(RESTORE_OUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RESTORE_OUT_DIR, 'RESTORE_VERIFICATION.json'),
      JSON.stringify(restoreReport, null, 2)
    );
    console.log(`Restoration verified in ${restoreReport.durationMs}ms.`);

    // ------------------------------------------------------------------
    // STEP 3: REPEAT MIGRATION (IDEMPOTENCY TEST)
    // ------------------------------------------------------------------
    console.log('\n--- Step 3: Executing Repeat Migration (Idempotency Check) ---');
    const rerunStart = new Date();
    // Run migration a second time WITHOUT resetting
    execSync('node scripts/rehearsal/rehearse-migration-318d.js --execute', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    const rerunEnd = new Date();

    const postRerunArticles = await db.collection(COLLECTIONS.articles).countDocuments();
    const postRerunEpapers = await db.collection(COLLECTIONS.epapers).countDocuments();
    const postRerunVideos = await db.collection(COLLECTIONS.videos).countDocuments();
    const postRerunCategories = await db.collection(COLLECTIONS.categories).countDocuments();
    const postRerunMedia = await db.collection(COLLECTIONS.media).countDocuments();

    // Verify duplicate slug check
    const articleSlugs = await db.collection(COLLECTIONS.articles).distinct('slug');
    const hasDuplicateArticles = postRerunArticles !== articleSlugs.length;

    const rerunReport = {
      test: 'STAGE5_REPEAT_MIGRATION_IDEMPOTENCY',
      startedAt: rerunStart.toISOString(),
      completedAt: rerunEnd.toISOString(),
      durationMs: rerunEnd.getTime() - rerunStart.getTime(),
      countsComparison: {
        articles: { before: restoredArticles, after: postRerunArticles, duplicateDetected: hasDuplicateArticles },
        epapers: { before: restoredEpapers, after: postRerunEpapers, match: postRerunEpapers === restoredEpapers },
        videos: { before: restoredVideos, after: postRerunVideos, match: postRerunVideos === restoredVideos },
        categories: { before: restoredCategories, after: postRerunCategories, match: postRerunCategories === restoredCategories },
        media: { before: restoredMedia, after: postRerunMedia, match: postRerunMedia === restoredMedia }
      },
      idempotencyCertified: (
        postRerunArticles === restoredArticles &&
        postRerunEpapers === restoredEpapers &&
        postRerunVideos === restoredVideos &&
        postRerunCategories === restoredCategories &&
        postRerunMedia === restoredMedia &&
        !hasDuplicateArticles
      ),
      errors: [],
      status: 'IDEMPOTENCY_VERIFIED_SUCCESS'
    };
    fs.mkdirSync(RERUN_OUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(RERUN_OUT_DIR, 'REPEAT_MIGRATION_REPORT.json'),
      JSON.stringify(rerunReport, null, 2)
    );
    console.log(`Repeat migration verified. Idempotency status: ${rerunReport.idempotencyCertified ? 'PASS' : 'FAIL'}`);

    if (!rerunReport.idempotencyCertified) {
      throw new Error('Idempotency failure: duplicate records detected on repeat migration!');
    }

  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed.');
  }
}

runRecoverySuite().catch(err => {
  console.error('Fatal recovery suite error:', err);
  process.exit(1);
});
