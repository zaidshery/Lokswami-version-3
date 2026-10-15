import type { UserRole } from '@/lib/auth/roles';

export type ReaderSessionIdentity = {
  userId: string;
  email: string;
};

export type ReaderRegistrationInput = {
  fullName?: unknown;
  email?: unknown;
  whatsappNumber?: unknown;
  password?: unknown;
  optInDailyEpaper?: unknown;
  languagePreference?: unknown;
};

export type ReaderProfileUpdateInput = {
  name?: unknown;
  whatsappNumber?: unknown;
  optInDailyEpaper?: unknown;
  preferredLanguage?: unknown;
  preferredCategories?: unknown;
  currentPassword?: unknown;
  newPassword?: unknown;
};

export type ReaderProfile = {
  id: string | undefined;
  name: string;
  email: string;
  whatsappNumber: string | null;
  image: string | null;
  role: string;
  optInDailyEpaper: boolean;
  preferredLanguage: 'hi' | 'en';
  preferredCategories: string[];
  readCount: number;
  savedArticlesCount: number;
  createdAt: unknown;
  hasPassword: boolean;
};

export type ReaderProfileProjection = {
  _id?: string;
  name?: string;
  email: string;
  whatsappNumber?: string;
  image?: string;
  role?: UserRole;
  isActive?: boolean;
  optInDailyEpaper?: boolean;
  preferredLanguage?: 'hi' | 'en';
  preferredCategories?: string[];
  readCount?: number;
  savedArticles?: string[];
  createdAt?: string;
};

export type ReaderAuthResult = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string;
  role: 'reader';
  isActive: boolean;
  whatsappNumber?: string;
  optInDailyEpaper: boolean;
  createdAt?: string;
  savedArticles: string[];
};

export type SavedArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  image: string;
  category: string;
  author: string;
  publishedAt: string;
  isBreaking: boolean;
  isTrending: boolean;
};

export class ReaderDomainError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ReaderDomainError';
  }
}

export class ReaderValidationError extends ReaderDomainError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ReaderValidationError';
  }
}

export class ReaderNotFoundError extends ReaderDomainError {
  constructor(message = 'User not found') {
    super(message, 404);
    this.name = 'ReaderNotFoundError';
  }
}

export class ReaderConflictError extends ReaderDomainError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ReaderConflictError';
  }
}

export class ReaderStoreUnavailableError extends ReaderDomainError {
  constructor(message: string) {
    super(message, 503);
    this.name = 'ReaderStoreUnavailableError';
  }
}

export function toReaderSessionIdentity(user: {
  id?: string;
  userId?: string;
  email?: string | null;
} | null | undefined): ReaderSessionIdentity | null {
  const email = user?.email?.trim().toLowerCase() || '';
  if (!user || !email) return null;
  return { userId: (user.userId || user.id || '').trim(), email };
}
