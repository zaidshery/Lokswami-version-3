import fs from 'fs/promises';
import path from 'path';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import { isReporterDeskRole } from '@/lib/auth/roles';
import connectDB from '@/lib/db/mongoose';
import Media from '@/lib/models/Media';
import type { MediaRecord } from './mediaTypes';

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
        return sortMediaByCreatedAt(filterMediaForUser(medias, user));
      } catch {
        return [];
      }
    }

    await connectDB();
    const query = isReporterDeskRole(user.role) ? { uploadedBy: user.email } : {};
    const medias = await Media.find(query).sort({ createdAt: -1 }).lean();
    return medias as unknown as MediaRecord[];
  }

  async createMedia(data: {
    filename: string;
    url: string;
    size?: number;
    type?: string;
    uploadedBy?: string;
  }): Promise<MediaRecord> {
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
        _id: Date.now().toString(),
        filename,
        url,
        size,
        type,
        uploadedBy,
        createdAt: new Date(),
      };
      medias.push(newMedia);
      await fs.writeFile(dataPath, JSON.stringify(medias, null, 2), 'utf-8');
      return newMedia;
    }

    await connectDB();
    const media = new Media({
      filename,
      url,
      size,
      type,
      uploadedBy,
    });
    await media.save();
    return media.toObject() as MediaRecord;
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
