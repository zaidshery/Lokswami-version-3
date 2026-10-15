import type { ArticleSeo } from '@/lib/storage/articlesFile';

export type PublicArticleSource = 'mongo' | 'file';

export type PublicArticleCursor = {
  publishedAt: string;
  id: string;
};

export type PublicArticleListFilters = {
  category?: string;
  city?: string;
  query?: string;
};

export type PublicArticleListOptions = PublicArticleListFilters & {
  limit?: number;
  cursorPublishedAt?: string;
  cursorId?: string;
};

export type PublicArticleItem = {
  _id: string;
  id: string;
  slug: string;
  title: string;
  summary: string;
  image: string;
  category: string;
  author: string;
  authorMeta?: {
    name?: string;
    avatar?: string;
    programName?: string;
  };
  publishedAt: string;
  updatedAt: string;
  views: number;
  isBreaking: boolean;
  isTrending: boolean;
  city: string;
  href: string;
};

export type PublicArticleDetail = PublicArticleItem & {
  previousSlugs: string[];
  content: string;
  seo: ArticleSeo;
};

export type PublicArticleListResult = {
  items: PublicArticleItem[];
  source: PublicArticleSource;
  limit: number;
  filters: PublicArticleListFilters;
  hasMore: boolean;
  nextCursor: PublicArticleCursor | null;
};

export type PublicArticleDetailResult = {
  article: PublicArticleDetail;
  source: PublicArticleSource;
};

export type PublicArticleAuthority = {
  id: string;
  slug: string;
  previousSlugs: string[];
  title: string;
  summary: string;
  image: string;
  category: string;
  author: string;
  publishedAt: string;
  updatedAt: string;
  seo: ArticleSeo;
  href: string;
};

export type ResolvedPublicArticleToken = {
  kind: 'current' | 'previous' | 'legacyId';
  source: PublicArticleSource;
  article: PublicArticleAuthority;
  authoritativePath: string;
  isExactAuthority: boolean;
};

export type PublicArticleResolution =
  | ResolvedPublicArticleToken
  | { kind: 'missing' }
  | { kind: 'ambiguous' }
  | { kind: 'unavailable' };

export class PublicArticleResolutionError extends Error {
  constructor(public readonly resolution: 'ambiguous' | 'unavailable') {
    super(`Public article resolution ${resolution}`);
    this.name = 'PublicArticleResolutionError';
  }
}

export type PublicRelatedArticlesResult = {
  items: PublicArticleItem[];
  source: PublicArticleSource;
  limit: number;
};

export type LegacyFeedArticle = {
  _id: string;
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  image: string;
  category: string;
  author: string;
  authorMeta?: {
    name?: string;
    avatar?: string;
    programName?: string;
  };
  publishedAt: string;
  views: number;
  isBreaking: boolean;
  isTrending: boolean;
};

export type LegacyFeedCursor = {
  publishedAt: string;
  id: string;
  date: Date;
};

export type LegacyFeedPageResult = {
  items: LegacyFeedArticle[];
  limit: number;
  hasMore: boolean;
  nextCursor: {
    publishedAt: string;
    id: string;
  } | null;
};

export type PublicBreakingItem = {
  id: string;
  title: string;
  city?: string;
  category?: string;
  createdAt?: string;
  href: string;
  priority: number;
  ttsAudioUrl?: string;
  ttsReady?: boolean;
};

export type PublicCategoryItem = {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  href: string;
};

export type PublicCityItem = {
  slug: string;
  name: string;
  href: string;
};
