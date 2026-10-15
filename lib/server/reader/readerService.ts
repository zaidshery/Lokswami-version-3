import { hashPassword, verifyPassword } from '@/lib/auth/jwt';
import { normalizeWhatsAppNumber } from '@/lib/utils/phone';
import {
  readerRepository,
  type ReaderPersistenceRecord,
  type ReaderRepository,
} from './readerRepository';
import {
  ReaderNotFoundError,
  ReaderStoreUnavailableError,
  ReaderValidationError,
  type ReaderProfile,
  type ReaderProfileUpdateInput,
  type ReaderSessionIdentity,
} from './readerTypes';

type SessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
  whatsappNumber?: string | null;
  optInDailyEpaper?: boolean;
  preferredLanguage?: string;
  savedArticles?: string[];
  createdAt?: string;
};

function profileFromRaw(user: ReaderPersistenceRecord): ReaderProfile {
  return {
    id: user._id === undefined ? user.id : String(user._id),
    name: String(user.name || ''),
    email: String(user.email || ''),
    whatsappNumber: user.whatsappNumber || null,
    image: user.image || null,
    role: String(user.role || 'reader'),
    optInDailyEpaper: user.optInDailyEpaper !== false,
    preferredLanguage: user.preferredLanguage === 'en' ? 'en' : 'hi',
    preferredCategories: user.preferredCategories || [],
    readCount: user.readCount || 0,
    savedArticlesCount: Array.isArray(user.savedArticles) ? user.savedArticles.length : 0,
    createdAt: user.createdAt,
    hasPassword: Boolean(user.passwordHash),
  };
}

function updateResult(user: ReaderPersistenceRecord) {
  return {
    name: String(user.name || ''),
    email: String(user.email || ''),
    whatsappNumber: user.whatsappNumber,
    optInDailyEpaper: user.optInDailyEpaper,
    preferredLanguage: user.preferredLanguage,
  };
}

export class ReaderService {
  constructor(private readonly repository: ReaderRepository = readerRepository) {}

  async getProfile(sessionUser: SessionUser): Promise<ReaderProfile> {
    const email = String(sessionUser.email).toLowerCase();
    try {
      const mongo = await this.repository.getMongoProfile(email);
      if (mongo) return profileFromRaw(mongo);
    } catch (error) {
      console.warn('[Profile API] MongoDB read fallback:', error);
    }
    const stored = await this.repository.getStoredProfile(email);
    if (stored) return profileFromRaw(stored);
    return profileFromRaw({
      id: sessionUser.id,
      name: sessionUser.name || 'Reader',
      email: sessionUser.email || '',
      whatsappNumber: sessionUser.whatsappNumber || undefined,
      image: sessionUser.image || undefined,
      role: sessionUser.role || 'reader',
      optInDailyEpaper: sessionUser.optInDailyEpaper !== false,
      preferredLanguage: 'hi',
      preferredCategories: [],
      readCount: 0,
      savedArticles: sessionUser.savedArticles || [],
      createdAt: sessionUser.createdAt,
    });
  }

  async updateProfile(email: string, input: ReaderProfileUpdateInput) {
    const updates: Record<string, unknown> = {};
    if (typeof input.name === 'string' && input.name.trim().length >= 2) updates.name = input.name.trim();
    if (input.whatsappNumber !== undefined) {
      if (input.whatsappNumber === '' || input.whatsappNumber === null) updates.whatsappNumber = '';
      else {
        const normalized = normalizeWhatsAppNumber(String(input.whatsappNumber));
        if (!normalized) throw new ReaderValidationError('Invalid WhatsApp number format. Must be 10 digits.');
        updates.whatsappNumber = normalized;
      }
    }
    if (typeof input.optInDailyEpaper === 'boolean') updates.optInDailyEpaper = input.optInDailyEpaper;
    if (input.preferredLanguage === 'hi' || input.preferredLanguage === 'en') updates.preferredLanguage = input.preferredLanguage;
    if (Array.isArray(input.preferredCategories)) updates.preferredCategories = input.preferredCategories.map(String);

    if (input.newPassword) {
      if (String(input.newPassword).length < 6) throw new ReaderValidationError('New password must be at least 6 characters.');
      let existing: ReaderPersistenceRecord | null;
      try {
        existing = await this.repository.getMongoProfile(email);
      } catch (error) {
        console.warn('[Profile API PATCH] MongoDB unavailable for password change verification:', error);
        throw new ReaderStoreUnavailableError('Password changes are temporarily unavailable. Please try again shortly.');
      }
      if (!existing) throw new ReaderNotFoundError('User profile not found.');
      if (existing.passwordHash) {
        if (!input.currentPassword) throw new ReaderValidationError('Current password is required to set a new password.');
        if (!(await verifyPassword(String(input.currentPassword), existing.passwordHash))) {
          throw new ReaderValidationError('Current password does not match.');
        }
      }
      updates.passwordHash = await hashPassword(String(input.newPassword));
      updates.passwordSetAt = new Date();
      let updated: ReaderPersistenceRecord | null;
      try {
        updated = await this.repository.updateMongoProfile(email, updates);
      } catch (error) {
        console.warn('[Profile API PATCH] MongoDB write failed during password change:', error);
        throw new ReaderStoreUnavailableError('Password changes are temporarily unavailable. Please try again shortly.');
      }
      if (!updated) throw new ReaderNotFoundError('User profile not found.');
      try {
        await this.repository.syncStoredProfile(updated);
      } catch (error) {
        console.warn('[Profile API PATCH] File store sync warning:', error);
      }
      return updateResult(updated);
    }

    try {
      const updated = await this.repository.updateMongoProfile(email, updates);
      if (updated) {
        void this.repository.syncStoredProfile(updated);
        return updateResult(updated);
      }
    } catch (error) {
      console.warn('[Profile API PATCH] MongoDB write fallback for non-password updates:', error);
    }
    const stored = await this.repository.updateStoredProfile(email, updates);
    if (!stored) throw new ReaderNotFoundError('User profile not found.');
    return updateResult(stored);
  }

  async listSavedArticles(identity: ReaderSessionIdentity) {
    const result = await this.repository.getSavedArticles(identity);
    if (!result) throw new ReaderNotFoundError();
    return { savedArticleIds: result.ids, savedArticles: result.articles, count: result.articles.length };
  }

  async toggleSavedArticle(identity: ReaderSessionIdentity, rawArticleId: unknown) {
    const articleId = String(rawArticleId || '').trim();
    if (!articleId || !this.repository.isValidObjectId(articleId)) throw new ReaderValidationError('Valid articleId is required');
    const result = await this.repository.toggleSavedArticle(identity, articleId);
    if (result.kind === 'article-missing') throw new ReaderNotFoundError('Article not found');
    if (result.kind === 'user-missing') throw new ReaderNotFoundError();
    return { articleId, saved: result.saved, savedArticleIds: result.ids, count: result.ids.length };
  }

  async getReadingStats(identity: ReaderSessionIdentity) {
    const user = await this.repository.getReadingStats(identity);
    if (!user) throw new ReaderNotFoundError();
    const history = Array.isArray(user.readHistory) ? user.readHistory : [];
    const total = history.reduce((sum: number, entry: Record<string, unknown>) => {
      const value = Number(entry.completionPercent);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    return {
      userId: String(user._id),
      readCount: typeof user.readCount === 'number' && Number.isFinite(user.readCount) ? user.readCount : 0,
      readHistoryCount: history.length,
      averageCompletionPercent: history.length ? Math.round(total / history.length) : 0,
      lastActiveAt: user.lastActiveAt instanceof Date
        ? user.lastActiveAt.toISOString()
        : this.toIso(user.lastActiveAt),
    };
  }

  async trackRead(identity: ReaderSessionIdentity, rawArticleId: unknown, rawCompletion: unknown) {
    const articleId = String(rawArticleId || '').trim();
    if (!articleId || !this.repository.isValidObjectId(articleId)) throw new ReaderValidationError('Valid articleId is required');
    const parsed = Number(rawCompletion);
    const completion = Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;
    const { user, now } = await this.repository.trackRead(identity, articleId, completion);
    if (!user) throw new ReaderNotFoundError();
    return {
      userId: String(user._id),
      readCount: typeof user.readCount === 'number' ? user.readCount : 0,
      lastActiveAt: user.lastActiveAt instanceof Date
        ? user.lastActiveAt.toISOString()
        : this.toIso(user.lastActiveAt) || now.toISOString(),
    };
  }

  private toIso(value: unknown): string {
    if (typeof value !== 'string') return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }
}

export const readerService = new ReaderService();
