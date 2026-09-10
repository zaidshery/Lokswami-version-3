import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import User from '@/lib/models/User';
import Article from '@/lib/models/Article';
import { resolveArticleEditorialFlags } from '@/lib/content/articleEditorial';
import { isPubliclyPublishedArticle } from '@/lib/content/articlePublication';
import { normalizeWhatsAppNumber } from '@/lib/utils/phone';
import { normalizeUserRole } from '@/lib/auth/roles';
import { findStoredUserByEmail, upsertStoredUser } from '@/lib/storage/usersFile';
import type {
  ReaderProfileProjection,
  ReaderSessionIdentity,
  SavedArticle,
} from './readerTypes';

export type ReaderPersistenceRecord = Record<string, unknown> & {
  _id?: unknown;
  id?: string;
  name?: string;
  email?: string;
  whatsappNumber?: string;
  image?: string;
  role?: unknown;
  isActive?: boolean;
  optInDailyEpaper?: boolean;
  preferredLanguage?: string;
  preferredCategories?: string[];
  readCount?: number;
  readHistory?: Array<Record<string, unknown>>;
  savedArticles?: unknown[];
  createdAt?: Date | string;
  lastActiveAt?: Date | string | null;
  passwordHash?: string;
  slug?: string;
  title?: string;
  summary?: string;
  category?: string;
  author?: string;
  publishedAt?: Date | string;
  isBreaking?: boolean;
  isTrending?: boolean;
  editorial?: unknown;
  workflow?: unknown;
};

type RawUser = ReaderPersistenceRecord;

export type ReaderCredentialRecord = {
  id: string;
  name: string;
  email: string;
  image: string;
  role: unknown;
  isActive: boolean;
  whatsappNumber?: string;
  optInDailyEpaper: boolean;
  createdAt?: Date;
  savedArticles: string[];
  passwordHash?: string;
  touchLastLogin: () => Promise<void>;
};

function toUserQuery(identity: ReaderSessionIdentity) {
  return Types.ObjectId.isValid(identity.userId)
    ? { _id: identity.userId }
    : { email: identity.email };
}

function normalizeIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(String).filter((id) => Types.ObjectId.isValid(id))
    : [];
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return '';
}

export function projectReaderProfile(value: RawUser): ReaderProfileProjection {
  return {
    _id: value._id === undefined ? undefined : String(value._id),
    name: typeof value.name === 'string' ? value.name : undefined,
    email: String(value.email || '').trim().toLowerCase(),
    whatsappNumber: typeof value.whatsappNumber === 'string' ? value.whatsappNumber : undefined,
    image: typeof value.image === 'string' ? value.image : undefined,
    role: normalizeUserRole(value.role) || 'reader',
    isActive: value.isActive !== false,
    optInDailyEpaper: value.optInDailyEpaper !== false,
    preferredLanguage: value.preferredLanguage === 'en' ? 'en' : 'hi',
    preferredCategories: Array.isArray(value.preferredCategories)
      ? value.preferredCategories.map(String)
      : [],
    readCount: typeof value.readCount === 'number' ? value.readCount : 0,
    savedArticles: Array.isArray(value.savedArticles) ? value.savedArticles.map(String) : [],
    createdAt: value.createdAt ? iso(value.createdAt) : undefined,
  };
}

export class ReaderRepository {
  isValidObjectId(value: string): boolean {
    return Types.ObjectId.isValid(value);
  }

  async findCredential(identifier: string): Promise<ReaderCredentialRecord | null> {
    const normalizedPhone = normalizeWhatsAppNumber(identifier);
    const normalizedEmail = identifier.toLowerCase();
    await connectDB();
    const user = await User.findOne({
      $or: [
        { email: normalizedEmail },
        ...(normalizedPhone ? [{ whatsappNumber: normalizedPhone }] : []),
        { whatsappNumber: identifier },
        { loginId: normalizedEmail },
      ],
    });
    if (!user) return null;
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      image: user.image || '',
      role: user.role,
      isActive: user.isActive !== false,
      whatsappNumber: user.whatsappNumber,
      optInDailyEpaper: user.optInDailyEpaper !== false,
      createdAt: user.createdAt,
      savedArticles: Array.isArray(user.savedArticles) ? user.savedArticles.map(String) : [],
      passwordHash: user.passwordHash,
      touchLastLogin: async () => {
        user.lastLoginAt = new Date();
        await user.save();
      },
    };
  }

  async findRegistrationDuplicate(email: string, phone: string | null): Promise<RawUser | null> {
    await connectDB();
    const duplicateQuery: Record<string, unknown>[] = [{ email }];
    if (phone) duplicateQuery.push({ whatsappNumber: phone });
    const found = await User.findOne({ $or: duplicateQuery });
    return found ? { email: found.email, whatsappNumber: found.whatsappNumber } : null;
  }

  async createReader(data: RawUser): Promise<RawUser> {
    await connectDB();
    const created = await User.create(data);
    return {
      _id: created._id.toString(),
      name: created.name,
      email: created.email,
      whatsappNumber: created.whatsappNumber,
      role: created.role,
      isActive: created.isActive,
      optInDailyEpaper: created.optInDailyEpaper,
      preferredLanguage: created.preferredLanguage,
      preferredCategories: created.preferredCategories,
    };
  }

  async getMongoProfile(email: string): Promise<RawUser | null> {
    await connectDB();
    return User.findOne({ email }).lean();
  }

  async getStoredProfile(email: string): Promise<ReaderProfileProjection | null> {
    const found = await findStoredUserByEmail(email);
    return found ? projectReaderProfile(found as unknown as RawUser) : null;
  }

  async syncStoredProfile(value: RawUser): Promise<ReaderProfileProjection> {
    const projected = projectReaderProfile(value);
    const stored = await upsertStoredUser(projected);
    return projectReaderProfile(stored as unknown as RawUser);
  }

  async updateMongoProfile(email: string, updates: RawUser): Promise<RawUser | null> {
    await connectDB();
    return User.findOneAndUpdate({ email }, { $set: updates }, { new: true }).lean();
  }

  async updateStoredProfile(email: string, updates: RawUser): Promise<ReaderProfileProjection | null> {
    const existing = await findStoredUserByEmail(email);
    if (!existing) return null;
    return this.syncStoredProfile({ ...existing, ...updates, email });
  }

  async getSavedArticles(identity: ReaderSessionIdentity): Promise<{ ids: string[]; articles: SavedArticle[] } | null> {
    await connectDB();
    const user = await User.findOne(toUserQuery(identity)).select('_id savedArticles').lean<RawUser | null>();
    if (!user) return null;
    const ids = normalizeIds(user.savedArticles);
    if (!ids.length) return { ids: [], articles: [] };
    const rows = await Article.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select('_id slug title summary image category author publishedAt isBreaking isTrending editorial workflow.status workflow.publishedAt')
      .lean<RawUser[]>();
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    const articles = ids
      .map((id) => byId.get(id))
      .filter((row): row is RawUser => Boolean(row) && isPubliclyPublishedArticle(row))
      .map((row) => {
        const flags = resolveArticleEditorialFlags(row);
        return {
          id: String(row._id), slug: String(row.slug || '').trim(), title: String(row.title || '').trim(),
          summary: String(row.summary || '').trim(), image: String(row.image || '').trim(),
          category: String(row.category || '').trim(), author: String(row.author || '').trim(),
          publishedAt: iso(row.publishedAt), isBreaking: flags.isBreaking, isTrending: flags.isTrending,
        };
      });
    return { ids: articles.map((article) => article.id), articles };
  }

  async toggleSavedArticle(identity: ReaderSessionIdentity, articleId: string) {
    await connectDB();
    const targetId = new Types.ObjectId(articleId);
    if (!(await Article.exists({ _id: targetId }))) return { kind: 'article-missing' as const };
    const user = await User.findOne(toUserQuery(identity)).select('_id savedArticles').lean<RawUser | null>();
    if (!user) return { kind: 'user-missing' as const };
    const wasSaved = normalizeIds(user.savedArticles).includes(articleId);
    const update = wasSaved
      ? { $pull: { savedArticles: targetId }, $set: { lastActiveAt: new Date() } }
      : { $addToSet: { savedArticles: targetId }, $set: { lastActiveAt: new Date() } };
    const updated = await User.findOneAndUpdate(toUserQuery(identity), update, {
      new: true, projection: { _id: 1, savedArticles: 1 },
    }).lean<RawUser | null>();
    if (!updated) return { kind: 'user-missing' as const };
    return { kind: 'ok' as const, saved: !wasSaved, ids: normalizeIds(updated.savedArticles) };
  }

  async getReadingStats(identity: ReaderSessionIdentity): Promise<RawUser | null> {
    await connectDB();
    return User.findOne(toUserQuery(identity)).select('_id readCount readHistory lastActiveAt').lean<RawUser | null>();
  }

  async trackRead(identity: ReaderSessionIdentity, articleId: string, completionPercent: number) {
    await connectDB();
    const now = new Date();
    const user = await User.findOneAndUpdate(
      toUserQuery(identity),
      {
        $inc: { readCount: 1 },
        $push: { readHistory: { $each: [{ articleId: new Types.ObjectId(articleId), readAt: now, completionPercent }], $slice: -50 } },
        $set: { lastActiveAt: now },
      },
      { new: true, projection: { _id: 1, readCount: 1, lastActiveAt: 1 } }
    ).lean<RawUser | null>();
    return { user, now };
  }
}

export const readerRepository = new ReaderRepository();
