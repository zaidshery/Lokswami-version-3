import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../lib/db/mongoose';
import Video from '../lib/models/Video';
import { listAllStoredVideos, updateStoredVideo } from '../lib/storage/videosFile';
import {
  buildVideoSlug,
  buildCollisionSafeVideoSlug,
  inferVideoMediaProvider,
  normalizeVideoAspectRatio,
  normalizeVideoProcessingStatus,
  normalizeVideoSlug,
} from '../lib/content/videoPublication';

const write = process.argv.includes('--write');
const videosFilePath = path.resolve(process.cwd(), 'data', 'videos.json');

function loadMigrationEnvironment() {
  for (const fileName of [
    '.env.hostinger',
    '.env.production',
    '.env',
    '.env.local',
    '.env.production.local',
  ]) {
    dotenv.config({
      path: path.resolve(process.cwd(), fileName),
      override: false,
      quiet: true,
    });
  }
}

function migrationUpdate(source: Record<string, unknown>, usedSlugs: Set<string>) {
  const id = String(source._id || source.id || '').trim();
  const title = String(source.title || '').trim();
  const thumbnail = String(source.thumbnail || '').trim();
  const videoUrl = String(source.videoUrl || '').trim();
  const playbackUrl = String(source.playbackUrl || '').trim() || videoUrl;
  return {
    slug: buildCollisionSafeVideoSlug({
      title,
      identity: id,
      preferred: normalizeVideoSlug(source.slug) || buildVideoSlug(title, id),
      usedSlugs,
    }),
    posterUrl: String(source.posterUrl || '').trim() || thumbnail,
    playbackUrl,
    mediaProvider: inferVideoMediaProvider(source.mediaProvider || playbackUrl),
    aspectRatio: normalizeVideoAspectRatio(source.aspectRatio),
    processingStatus: normalizeVideoProcessingStatus(source.processingStatus),
  };
}

async function migrateFileStore() {
  const normalizedRows = await listAllStoredVideos();
  let rawRows: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(await fs.readFile(videosFilePath, 'utf8')) as unknown;
    rawRows = Array.isArray(parsed)
      ? parsed.filter(
          (row): row is Record<string, unknown> => typeof row === 'object' && row !== null
        )
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const normalizedById = new Map(normalizedRows.map((row) => [row._id, row]));
  const usedSlugs = new Set<string>();
  let changed = 0;
  for (const rawRow of rawRows) {
    const id = String(rawRow._id || rawRow.id || '').trim();
    if (!id || !normalizedById.has(id)) {
      throw new Error(`Cannot safely migrate file-store video without a valid persisted ID: ${id || '<missing>'}`);
    }
    const update = migrationUpdate(rawRow, usedSlugs);
    const differs = Object.entries(update).some(([key, value]) => rawRow[key] !== value);
    if (!differs) continue;
    changed += 1;
    if (write) await updateStoredVideo(id, update);
  }
  return { scanned: rawRows.length, changed };
}

async function migrateMongo() {
  if (!process.env.MONGODB_URI?.trim()) return { scanned: 0, changed: 0 };
  await connectDB();
  const rows = (await Video.find({}).lean()) as Array<Record<string, unknown>>;
  const usedSlugs = new Set<string>();
  const operations = rows
    .map((row) => ({ row, update: migrationUpdate(row, usedSlugs) }))
    .filter(({ row, update }) => Object.entries(update).some(([key, value]) => row[key] !== value))
    .map(({ row, update }) => ({
      updateOne: { filter: { _id: row._id }, update: { $set: update } },
    }));
  if (write && operations.length) await Video.bulkWrite(operations, { ordered: false });
  return { scanned: rows.length, changed: operations.length };
}

async function main() {
  try {
    loadMigrationEnvironment();
    const [fileStore, mongo] = await Promise.all([migrateFileStore(), migrateMongo()]);
    process.stdout.write(`${JSON.stringify({ mode: write ? 'write' : 'dry-run', fileStore, mongo }, null, 2)}\n`);
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
