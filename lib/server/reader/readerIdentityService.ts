import { hashPassword, verifyPassword } from '@/lib/auth/jwt';
import { isReaderRole } from '@/lib/auth/roles';
import { normalizeWhatsAppNumber } from '@/lib/utils/phone';
import { readerRepository, type ReaderRepository } from './readerRepository';
import {
  ReaderConflictError,
  ReaderStoreUnavailableError,
  ReaderValidationError,
  type ReaderAuthResult,
  type ReaderRegistrationInput,
} from './readerTypes';

export class ReaderIdentityService {
  constructor(private readonly repository: ReaderRepository = readerRepository) {}

  async authorize(input: { loginId?: string; password?: string }): Promise<ReaderAuthResult | null> {
    const identifier = (input.loginId || '').trim();
    const password = String(input.password || '');
    if (!identifier || !password) return null;

    try {
      const user = await this.repository.findCredential(identifier);
      if (!user || !user.isActive || !isReaderRole(user.role) || !user.passwordHash) return null;
      if (!(await verifyPassword(password, user.passwordHash))) return null;

      try {
        await user.touchLastLogin();
      } catch (error) {
        console.warn('[Auth] Failed to update reader lastLoginAt in MongoDB:', error);
      }

      return {
        id: user.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: 'reader',
        isActive: user.isActive,
        whatsappNumber: user.whatsappNumber,
        optInDailyEpaper: user.optInDailyEpaper,
        createdAt: user.createdAt?.toISOString(),
        savedArticles: user.savedArticles,
      };
    } catch (error) {
      console.warn('[Auth] MongoDB unavailable during reader auth, failing closed:', error);
      return null;
    }
  }

  async register(input: ReaderRegistrationInput) {
    const name = String(input.fullName || '').trim();
    if (name.length < 2) {
      throw new ReaderValidationError('Full name must be at least 2 characters long.');
    }
    const email = input.email ? String(input.email).trim().toLowerCase() : '';
    const phone = input.whatsappNumber
      ? normalizeWhatsAppNumber(String(input.whatsappNumber))
      : null;
    if (!email && !phone) {
      throw new ReaderValidationError('Please provide either a valid email address or WhatsApp number.');
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ReaderValidationError('Please enter a valid email address.');
    }
    if (input.whatsappNumber && !phone) {
      throw new ReaderValidationError('Please enter a valid 10-digit mobile or WhatsApp number.');
    }
    const password = String(input.password || '');
    if (password.length < 6) {
      throw new ReaderValidationError('Password must be at least 6 characters long.');
    }

    const passwordHash = await hashPassword(password);
    const safeEmail = email || `${phone?.replace('+', '')}@lokswami.reader`;
    try {
      const duplicate = await this.repository.findRegistrationDuplicate(safeEmail, phone);
      if (duplicate) {
        throw new ReaderConflictError(
          duplicate.email === safeEmail
            ? 'An account with this email already exists.'
            : 'An account with this WhatsApp number already exists.'
        );
      }
      const user = await this.repository.createReader({
        name,
        email: safeEmail,
        whatsappNumber: phone || undefined,
        passwordHash,
        passwordSetAt: new Date(),
        role: 'reader',
        optInDailyEpaper:
          input.optInDailyEpaper === undefined ? true : Boolean(input.optInDailyEpaper),
        preferredLanguage: input.languagePreference === 'en' ? 'en' : 'hi',
        isActive: true,
        lastLoginAt: new Date(),
      });
      try {
        await this.repository.syncStoredProfile(user);
      } catch (error) {
        console.warn('[Register] Secondary file store sync failed (Mongo remains authoritative):', error);
      }
      return {
        id: String(user._id),
        name: String(user.name),
        email: String(user.email),
        whatsappNumber: user.whatsappNumber,
        role: user.role,
      };
    } catch (error) {
      if (error instanceof ReaderConflictError) throw error;
      console.error('[Register] MongoDB account creation failed, failing closed:', error);
      throw new ReaderStoreUnavailableError(
        'Registration is temporarily unavailable. Please try again shortly.'
      );
    }
  }
}

export const readerIdentityService = new ReaderIdentityService();
