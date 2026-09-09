import fs from 'fs/promises';
import path from 'path';
import Category from '@/lib/models/Category';
import { NEWS_CATEGORIES } from '@/lib/constants/newsCategories';
import { isMongoAvailable } from '@/lib/db/mongoAvailability';

export type CategoryRecord = {
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
};

const DEFAULT_CMS_CATEGORIES: Omit<CategoryRecord, '_id'>[] = NEWS_CATEGORIES.map(
  (category) => ({
    name: category.nameEn,
    slug: category.slug,
    description: `${category.nameEn} news and updates`,
    icon: category.icon,
  })
);

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function sortCategories(items: CategoryRecord[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function findMissingDefaults(existing: CategoryRecord[]) {
  const existingNames = new Set(
    existing
      .map((item) => (typeof item.name === 'string' ? normalize(item.name) : ''))
      .filter(Boolean)
  );
  const existingSlugs = new Set(
    existing
      .map((item) => (typeof item.slug === 'string' ? normalize(item.slug) : ''))
      .filter(Boolean)
  );

  return DEFAULT_CMS_CATEGORIES.filter(
    (item) =>
      !existingNames.has(normalize(item.name)) &&
      !existingSlugs.has(normalize(item.slug))
  );
}

function buildFileCategory(defaultCategory: Omit<CategoryRecord, '_id'>): CategoryRecord {
  return {
    _id: `default-${defaultCategory.slug}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`,
    ...defaultCategory,
  };
}

export async function shouldUseFileStore(): Promise<boolean> {
  if (!process.env.MONGODB_URI) return true;
  return !(await isMongoAvailable({ label: 'admin taxonomy service' }));
}

export async function getAdminCategories(): Promise<CategoryRecord[]> {
  if (await shouldUseFileStore()) {
    const dataPath = path.resolve(process.cwd(), 'data', 'categories.json');
    const dataDir = path.dirname(dataPath);
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch {
      // Ignore filesystem write restrictions and continue with in-memory defaults.
    }

    let cats: CategoryRecord[] = [];
    try {
      const raw = await fs.readFile(dataPath, 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      cats = Array.isArray(parsed) ? parsed : [];
    } catch {
      cats = [];
    }

    const missingDefaults = findMissingDefaults(cats);
    if (missingDefaults.length) {
      const seeded = [
        ...cats,
        ...missingDefaults.map((item) => buildFileCategory(item)),
      ];
      try {
        await fs.writeFile(dataPath, JSON.stringify(sortCategories(seeded), null, 2), 'utf-8');
      } catch {
        // File may be read-only in restricted environments; still return seeded data.
      }
      cats = seeded;
    }

    return sortCategories(cats);
  }

  let cats = (await Category.find().sort({ name: 1 }).lean()) as unknown as CategoryRecord[];
  const missingDefaults = findMissingDefaults(cats);

  if (missingDefaults.length) {
    try {
      await Category.insertMany(missingDefaults, { ordered: false });
    } catch {
      // Ignore duplicate insert races and continue with refreshed list.
    }

    cats = (await Category.find().sort({ name: 1 }).lean()) as unknown as CategoryRecord[];
  }

  return cats;
}

export async function createAdminCategory(body: {
  name?: string;
  description?: string;
}): Promise<CategoryRecord> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!name) {
    const error = new Error('Name required');
    (error as unknown as { status?: number }).status = 400;
    throw error;
  }

  if (await shouldUseFileStore()) {
    const dataDir = path.resolve(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const dataPath = path.join(dataDir, 'categories.json');
    let cats: CategoryRecord[] = [];
    try {
      const raw = await fs.readFile(dataPath, 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      cats = Array.isArray(parsed) ? (parsed as CategoryRecord[]) : [];
    } catch {}

    if (cats.find((c) => c.name.toLowerCase() === name.toLowerCase())) {
      const error = new Error('Category already exists');
      (error as unknown as { status?: number }).status = 400;
      throw error;
    }

    const newCat: CategoryRecord = {
      _id: Date.now().toString(),
      name,
      description,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
    };
    cats.push(newCat);
    await fs.writeFile(dataPath, JSON.stringify(cats, null, 2), 'utf-8');
    return newCat;
  }

  const existing = await Category.findOne({ name });
  if (existing) {
    const error = new Error('Category already exists');
    (error as unknown as { status?: number }).status = 400;
    throw error;
  }

  const cat = new Category({ name, description });
  await cat.save();
  return (typeof (cat as { toObject?: () => unknown }).toObject === 'function'
    ? (cat as { toObject: () => unknown }).toObject()
    : cat) as CategoryRecord;
}

export async function deleteAdminCategory(id: string): Promise<boolean> {
  if (await shouldUseFileStore()) {
    const dataPath = path.resolve(process.cwd(), 'data', 'categories.json');
    try {
      const raw = await fs.readFile(dataPath, 'utf-8');
      const parsed = JSON.parse(raw || '[]');
      const cats = Array.isArray(parsed) ? (parsed as CategoryRecord[]) : [];
      const idx = cats.findIndex((c) => c._id === id);
      if (idx === -1) return false;
      cats.splice(idx, 1);
      await fs.writeFile(dataPath, JSON.stringify(cats, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  const cat = await Category.findByIdAndDelete(id);
  return Boolean(cat);
}
