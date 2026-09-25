import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { isReporterDeskRole } from '@/lib/auth/roles';
import connectDB from '@/lib/db/mongoose';
import Media from '@/lib/models/Media';
import type { MediaRecord, MediaReference } from './mediaTypes';

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
      const dataDir = path.resolve(process.cwd(), 'data');
      await fs.mkdir(dataDir, { recursive: true });
      const dataPath = this.getJsonFilePath();
      let medias: MediaRecord[] = [];
      try {
        const raw = await fs.readFile(dataPath, 'utf-8');
        const parsed = JSON.parse(raw || '[]');
        medias = Array.isArray(parsed) ? (parsed as MediaRecord[]) : [];
      } catch {}

      const newMedia: MediaRecord = {
        ...data,
        _id: crypto.randomUUID(),
        filename, url, size, type, uploadedBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      medias.push(newMedia);
      await fs.writeFile(dataPath, JSON.stringify(medias, null, 2), 'utf-8');
      return newMedia;
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
      const records = await this.readFileRecords();
      const index = records.findIndex((record) => String(record._id) === id);
      if (index < 0) return null;
      records[index] = { ...records[index], ...normalized };
      await this.writeFileRecords(records);
      return records[index];
    }
    await connectDB();
    const record = await Media.findByIdAndUpdate(id, { $set: normalized }, { new: true }).lean();
    return record ? (record as unknown as MediaRecord) : null;
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
        return record.status === 'cleanup_pending' && updated <= before.getTime();
      });
    }
    await connectDB();
    const records = await Media.find({ status: 'cleanup_pending', updatedAt: { $lte: before } }).lean();
    return records as unknown as MediaRecord[];
  }

  private async readFileRecords(): Promise<MediaRecord[]> {
    try {
      const raw = await fs.readFile(this.getJsonFilePath(), 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? (parsed as MediaRecord[]) : [];
    } catch {
      return [];
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
