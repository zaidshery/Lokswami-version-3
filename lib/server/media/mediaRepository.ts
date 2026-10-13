import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { isReporterDeskRole } from '@/lib/auth/roles';
import connectDB from '@/lib/db/mongoose';
import Media from '@/lib/models/Media';
import Article from '@/lib/models/Article';
import Story from '@/lib/models/Story';
import Video from '@/lib/models/Video';
import EPaper from '@/lib/models/EPaper';
import Author from '@/lib/models/Author';
import User from '@/lib/models/User';
import type { MediaAssetStatus, MediaRecord, MediaReference } from './mediaTypes';

let mediaFileQueue: Promise<unknown> = Promise.resolve();
function withMediaFileLock<T>(work: () => Promise<T>): Promise<T> {
  const result = mediaFileQueue.then(work, work);
  mediaFileQueue = result.then(() => undefined, () => undefined);
  return result;
}

function filterMediaForUser(records: MediaRecord[], user: AdminSessionIdentity): MediaRecord[] {
  if (!isReporterDeskRole(user.role)) {
    return records;
  }

  const normalizedEmail = user.email.trim().toLowerCase();
  return records.filter((record) => record.uploadedBy?.trim().toLowerCase() === normalizedEmail);
}

function sortMediaByCreatedAt(records: MediaRecord[]): MediaRecord[] {
  return [...records].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export class MediaRepository {
  /** Includes all persisted current/revision references, irrespective of registry completeness. */
  async hasPersistedReference(record: MediaRecord): Promise<boolean> {
    return this.hasPersistedArticleImageReference(record);
  }

  async transitionStatus(id: string, from: MediaAssetStatus, updates: Partial<MediaRecord>): Promise<MediaRecord | null> {
    if (!process.env.MONGODB_URI) {
      // Serialize read/compare/write across repository instances in this process.
      return withMediaFileLock(async () => {
        const records = await this.readFileRecords();
        const record = records.find((item) => String(item._id) === id && item.status === from);
        if (!record) return null;
        Object.assign(record, updates, { updatedAt: new Date() });
        await this.writeFileRecords(records);
        return record;
      });
    }
    await connectDB();
    return await Media.findOneAndUpdate({ _id: id, status: from },
      { $set: { ...updates, updatedAt: new Date() } }, { new: true }).lean() as MediaRecord | null;
  }

  /** Old article uploads have no registry links; validate persisted uses before repairing that state. */
  async hasPersistedArticleImageReference(record: MediaRecord): Promise<boolean> {
    const urls = [record.url, ...Object.values(record.variants || {})]
      .filter((value): value is string => Boolean(value));
    const paths = urls.flatMap((url) => {
      try { return [new URL(url).pathname.replace(/^\/+/, '')]; }
      catch { return []; }
    });
    const needles = [...new Set([String(record._id || ''), record.objectKey, ...urls, ...paths]
      .filter((value): value is string => Boolean(value)))];
    if (!needles.length) throw new Error('Media reference identity is unavailable.');

    if (!process.env.MONGODB_URI) {
      const containsReference = (value: unknown): boolean => {
        if (typeof value === 'string') return needles.some((needle) => value.includes(needle));
        if (Array.isArray(value)) return value.some(containsReference);
        if (value && typeof value === 'object') return Object.values(value).some(containsReference);
        return false;
      };
      for (const filename of ['articles.json', 'stories.json', 'videos.json', 'epapers.json', 'authors.json', 'users.json']) {
        let raw: string;
        try { raw = await fs.readFile(path.resolve(process.cwd(), 'data', filename), 'utf-8'); }
        catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
          throw error;
        }
        if (containsReference(JSON.parse(raw))) return true;
      }
      return false;
    }

    await connectDB();
    const pattern = needles.map((needle) => needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const variants = ['landscape16x9', 'standard4x3', 'square1x1', 'webp', 'avif'];
    const articleFields = ['image', 'content', 'contentJson.blocks.html', 'contentJson.blocks.attrs.src',
      'media.sourceMediaId', 'seo.ogImage', 'seo.authorAvatarUrl', ...variants.map((name) => `media.variants.${name}`)];
    const exists = (model: typeof Article, fields: string[]) => model.exists({
      $or: fields.map((field) => ({ [field]: { $regex: pattern } })),
    });
    // Include private content and restorable revisions, not only published discovery records.
    return Boolean(await exists(Article, [...articleFields, ...articleFields.map((field) => `revisions.${field}`)]) ||
      await exists(Story as unknown as typeof Article, ['thumbnail', 'mediaUrl', 'mediaKey', 'mediaAssets.url', 'mediaAssets.key', 'mediaAssets.assetId',
        'revisions.thumbnail', 'revisions.mediaUrl', 'revisions.mediaKey', 'revisions.mediaAssets.url', 'revisions.mediaAssets.key', 'revisions.mediaAssets.assetId']) ||
      await exists(Video as unknown as typeof Article, ['thumbnail', 'videoUrl', 'posterUrl', 'playbackUrl', 'hlsUrl', 'captionUrl', 'sourceAssetId']) ||
      await exists(EPaper as unknown as typeof Article, ['thumbnail', 'thumbnailPath', 'pdfUrl', 'pdfPath', 'pages.imagePath']) ||
      await exists(Author as unknown as typeof Article, ['avatar']) ||
      await exists(User as unknown as typeof Article, ['image']));
  }

  private getJsonFilePath(): string {
    return path.resolve(process.cwd(), 'data', 'media.json');
  }

  async listMedia(user: AdminSessionIdentity): Promise<MediaRecord[]> {
    if (!process.env.MONGODB_URI) {
      const dataPath = this.getJsonFilePath();
      try {
        const raw = await fs.readFile(dataPath, 'utf-8');
        const parsed = JSON.parse(raw || '[]');
        const medias = Array.isArray(parsed) ? (parsed as MediaRecord[]) : [];
        return sortMediaByCreatedAt(
          filterMediaForUser(medias.filter((record) => record.status !== 'deleted'), user)
        );
      } catch {
        return [];
      }
    }

    await connectDB();
    const query = {
      ...(isReporterDeskRole(user.role) ? { uploadedBy: user.email } : {}),
      status: { $ne: 'deleted' },
    };
    const medias = await Media.find(query).sort({ createdAt: -1 }).lean();
    return medias as unknown as MediaRecord[];
  }

  async createMedia(data: Omit<MediaRecord, '_id' | 'createdAt' | 'updatedAt'>): Promise<MediaRecord> {
    const { filename, url, size = 0, type = 'image/*', uploadedBy = 'admin' } = data;

    if (!process.env.MONGODB_URI) {
      return withMediaFileLock(async () => {
        const medias = await this.readFileRecords();
        const newMedia: MediaRecord = {
          ...data,
          _id: crypto.randomUUID(),
          filename, url, size, type, uploadedBy,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        medias.push(newMedia);
        await this.writeFileRecords(medias);
        return newMedia;
      });
    }

    await connectDB();
    const media = new Media({ ...data, filename, url, size, type, uploadedBy });
    await media.save();
    return media.toObject() as MediaRecord;
  }

  async getMediaById(id: string): Promise<MediaRecord | null> {
    if (!process.env.MONGODB_URI) {
      const records = await this.readFileRecords();
      return records.find((record) => String(record._id) === id) || null;
    }
    await connectDB();
    const record = await Media.findById(id).lean();
    return record ? (record as unknown as MediaRecord) : null;
  }

  async findMediaByUrl(url: string): Promise<MediaRecord | null> {
    if (!process.env.MONGODB_URI) {
      const records = await this.readFileRecords();
      return records.find((record) => record.url === url && record.status !== 'deleted') || null;
    }
    await connectDB();
    const record = await Media.findOne({ url, status: { $ne: 'deleted' } }).lean();
    return record ? (record as unknown as MediaRecord) : null;
  }

  async updateMediaById(id: string, updates: Partial<MediaRecord>): Promise<MediaRecord | null> {
    const normalized = { ...updates, updatedAt: new Date() };
    if (!process.env.MONGODB_URI) {
      return withMediaFileLock(async () => {
        const records = await this.readFileRecords();
        const index = records.findIndex((record) => String(record._id) === id);
        if (index < 0) return null;
        records[index] = { ...records[index], ...normalized };
        await this.writeFileRecords(records);
        return records[index];
      });
    }
    await connectDB();
    const record = await Media.findByIdAndUpdate(id, { $set: normalized }, { new: true }).lean();
    return record ? (record as unknown as MediaRecord) : null;
  }

  async attachRestoredStoryReference(id: string, storyId: string): Promise<MediaRecord | null> {
    const reference: MediaReference = { ownerType: 'story', ownerId: storyId, field: 'mediaAssets', attachedAt: new Date() };
    if (!process.env.MONGODB_URI) {
      return withMediaFileLock(async () => {
        const records = await this.readFileRecords();
        const record = records.find((item) => String(item._id) === id);
        if (!record || !['verified', 'attached', 'cleanup_pending'].includes(String(record.status))
          || !record.verifiedAt || record.cancelledAt || record.deletedAt
          || record.ownerType !== 'story' || (record.ownerId && record.ownerId !== storyId)
          || (record.references || []).some((item) => item.ownerType === 'story' && item.ownerId !== storyId)) return null;
        const references = record.references || [];
        if (!references.some((item) => item.ownerType === 'story' && item.ownerId === storyId && item.field === 'mediaAssets')) {
          references.push(reference);
        }
        Object.assign(record, { references, status: 'attached', referenceTrackingComplete: true, updatedAt: new Date() });
        await this.writeFileRecords(records);
        return record;
      });
    }
    await connectDB();
    // A single conditional update prevents cancellation/deletion or a foreign owner
    // from racing the reference attachment. Preserve historical cleanupError.
    return await Media.findOneAndUpdate({ _id: id, ownerType: 'story',
      ownerId: { $in: ['', storyId, null] }, status: { $in: ['verified', 'attached', 'cleanup_pending'] },
      verifiedAt: { $ne: null }, cancelledAt: null, deletedAt: null,
      references: { $not: { $elemMatch: { ownerType: 'story', ownerId: { $ne: storyId } } } },
    }, [{ $set: {
      references: { $cond: [
        { $anyElementTrue: { $map: { input: { $ifNull: ['$references', []] }, as: 'ref', in: {
          $and: [{ $eq: ['$$ref.ownerType', 'story'] }, { $eq: ['$$ref.ownerId', storyId] }, { $eq: ['$$ref.field', 'mediaAssets'] }],
        } } } },
        '$references', { $concatArrays: [{ $ifNull: ['$references', []] }, [reference]] },
      ] }, status: 'attached', referenceTrackingComplete: true, updatedAt: new Date(),
    } }], { new: true }).lean() as MediaRecord | null;
  }

  async addReference(id: string, reference: MediaReference): Promise<MediaRecord | null> {
    const record = await this.getMediaById(id);
    if (!record) return null;
    const references = record.references || [];
    const exists = references.some(
      (item) => item.ownerType === reference.ownerType && item.ownerId === reference.ownerId && item.field === reference.field
    );
    return this.updateMediaById(id, {
      references: exists ? references : [...references, reference],
      status: 'attached',
      referenceTrackingComplete: true,
    });
  }

  async removeReference(id: string, ownerType: string, ownerId: string): Promise<MediaRecord | null> {
    const record = await this.getMediaById(id);
    if (!record) return null;
    const references = (record.references || []).filter(
      (item) => item.ownerType !== ownerType || item.ownerId !== ownerId
    );
    return this.updateMediaById(id, {
      references,
      status: references.length ? 'attached' : 'cleanup_pending',
      referenceTrackingComplete: true,
    });
  }

  async listCleanupCandidates(before: Date): Promise<MediaRecord[]> {
    if (!process.env.MONGODB_URI) {
      return (await this.readFileRecords()).filter((record) => {
        const updated = new Date(record.updatedAt || record.createdAt || 0).getTime();
        return ['cleanup_pending', 'cancelled'].includes(String(record.status)) && updated <= before.getTime();
      });
    }
    await connectDB();
    const records = await Media.find({ status: { $in: ['cleanup_pending', 'cancelled'] }, updatedAt: { $lte: before } }).lean();
    return records as unknown as MediaRecord[];
  }

  private async readFileRecords(): Promise<MediaRecord[]> {
    try {
      const raw = await fs.readFile(this.getJsonFilePath(), 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      if (!Array.isArray(parsed)) throw new Error('Invalid media registry.');
      return parsed as MediaRecord[];
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  private async writeFileRecords(records: MediaRecord[]): Promise<void> {
    const dataPath = this.getJsonFilePath();
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, JSON.stringify(records, null, 2), 'utf-8');
  }

  async deleteMediaById(id: string): Promise<boolean> {
    if (!process.env.MONGODB_URI) {
      const dataPath = this.getJsonFilePath();
      try {
        const raw = await fs.readFile(dataPath, 'utf-8');
        const parsed = JSON.parse(raw || '[]');
        const medias = Array.isArray(parsed) ? (parsed as MediaRecord[]) : [];
        const idx = medias.findIndex((m) => m._id === id);
        if (idx === -1) return false;
        medias.splice(idx, 1);
        await fs.writeFile(dataPath, JSON.stringify(medias, null, 2), 'utf-8');
        return true;
      } catch {
        return false;
      }
    }

    await connectDB();
    const deleted = await Media.findByIdAndDelete(id);
    return Boolean(deleted);
  }
}

export const mediaRepository = new MediaRepository();
