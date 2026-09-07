import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { writeJsonFileAtomically } from '@/lib/storage/atomicStorage';
import type { EPaperCity } from '@/lib/constants/epaperCities';
import {
  normalizeArticleHotspots,
  type EPaperArticleHotspot,
} from '@/lib/utils/epaperHotspots';

export interface StoredEPaper {
  _id: string;
  title: string;
  description: string;
  city: EPaperCity;
  thumbnail: string;
  pdfUrl: string;
  publishDate: string;
  pages: number;
  articleHotspots: EPaperArticleHotspot[];
  publishedAt: string;
  updatedAt: string;
}

export interface CreateEPaperInput {
  title: string;
  description: string;
  city: EPaperCity;
  thumbnail: string;
  pdfUrl: string;
  publishDate: string;
  pages: number;
  articleHotspots?: EPaperArticleHotspot[];
}

const dataDir = path.resolve(process.cwd(), 'data');
const dataPath = path.join(dataDir, 'epapers.json');

async function readAllEPapers(): Promise<StoredEPaper[]> {
  try {
    const raw = await fs.readFile(dataPath, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const source =
        typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
      return {
        ...source,
        articleHotspots: normalizeArticleHotspots(source.articleHotspots, {
          maxPages: Number.parseInt(String(source.pages ?? ''), 10),
        }),
      };
    }) as StoredEPaper[];
  } catch {
    return [];
  }
}

async function writeAllEPapers(epapers: StoredEPaper[]) {
  await writeJsonFileAtomically(dataPath, epapers);
}

export async function listStoredEPapers(params: {
  city?: string | null;
  publishDate?: string | null;
  limit: number;
  page: number;
}) {
  const { city, publishDate, limit, page } = params;
  const all = await readAllEPapers();

  let filtered = all;
  if (city && city !== 'all') {
    filtered = filtered.filter((item) => item.city === city);
  }
  if (publishDate) {
    filtered = filtered.filter((item) => item.publishDate === publishDate);
  }

  filtered.sort((a, b) => {
    const byPublishDate =
      new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
    if (byPublishDate !== 0) return byPublishDate;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);
  return { data, total: filtered.length };
}

export async function listAllStoredEPapers() {
  return readAllEPapers();
}

export async function getStoredEPaperById(id: string) {
  const all = await readAllEPapers();
  return all.find((item) => item._id === id) || null;
}

export async function createStoredEPaper(input: CreateEPaperInput) {
  const all = await readAllEPapers();
  const now = new Date().toISOString();

  const epaper: StoredEPaper = {
    _id:
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    title: input.title,
    description: input.description,
    city: input.city,
    thumbnail: input.thumbnail,
    pdfUrl: input.pdfUrl,
    publishDate: input.publishDate,
    pages: input.pages,
    articleHotspots: normalizeArticleHotspots(input.articleHotspots, {
      maxPages: input.pages,
    }),
    publishedAt: new Date(input.publishDate).toISOString(),
    updatedAt: now,
  };

  if (Number.isNaN(new Date(epaper.publishedAt).getTime())) {
    epaper.publishedAt = now;
  }

  all.push(epaper);
  await writeAllEPapers(all);
  return epaper;
}

export async function updateStoredEPaper(
  id: string,
  updates: Partial<CreateEPaperInput> & { publishedAt?: string }
) {
  const all = await readAllEPapers();
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return null;

  const current = all[index];
  const next: StoredEPaper = {
    ...current,
    ...updates,
    articleHotspots:
      updates.articleHotspots !== undefined
        ? normalizeArticleHotspots(updates.articleHotspots, {
            maxPages: Number.parseInt(String(updates.pages ?? current.pages), 10),
          })
        : normalizeArticleHotspots(current.articleHotspots, {
            maxPages: Number.parseInt(String(updates.pages ?? current.pages), 10),
          }),
    updatedAt: new Date().toISOString(),
  };

  if (typeof updates.publishDate === 'string') {
    const publishedAt = new Date(updates.publishDate);
    if (!Number.isNaN(publishedAt.getTime())) {
      next.publishedAt = publishedAt.toISOString();
    }
  }

  if (
    typeof updates.publishedAt === 'string' &&
    !Number.isNaN(new Date(updates.publishedAt).getTime())
  ) {
    next.publishedAt = new Date(updates.publishedAt).toISOString();
  }

  all[index] = next;
  await writeAllEPapers(all);
  return next;
}

export async function deleteStoredEPaper(id: string) {
  const all = await readAllEPapers();
  const index = all.findIndex((item) => item._id === id);
  if (index === -1) return false;

  all.splice(index, 1);
  await writeAllEPapers(all);
  return true;
}
