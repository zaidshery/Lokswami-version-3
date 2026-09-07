'use client';

import { type MouseEvent, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Share2, Bookmark, TrendingUp } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import type { Article } from '@/lib/mock/data';
import { buildArticleImageVariantUrl } from '@/lib/utils/articleMedia';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import ArticleMetaRow from './ArticleMetaRow';
import ReaderImage from './ReaderImage';

interface NewsCardProps {
  article: Article;
  variant?: 'default' | 'compact' | 'featured' | 'horizontal';
  size?: 'default' | 'sm';
  index?: number;
}

export default function NewsCard({ article, variant = 'default', size = 'default', index = 0 }: NewsCardProps) {
  const router = useRouter();
  const language = useAppStore((state) => state.language);
  const currentUser = useAppStore((state) => state.currentUser);
  const savedArticleIds = currentUser?.savedArticles ?? null;
  const [isHydrated, setIsHydrated] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const isSignedIn = Boolean(currentUser);
  const isSavedInProfile = Boolean(article?.id && Array.isArray(savedArticleIds) && savedArticleIds.includes(article.id));
  const isSmall = size === 'sm';
  const articleHref = article?.id ? buildArticlePublicPath({ id: article.id, slug: article.slug }) : '#';
  const canSaveArticle = Boolean(article?.id && /^[a-fA-F0-9]{24}$/.test(article.id));
  const horizontalImage = buildArticleImageVariantUrl(article?.image, 'thumb');
  const featuredImage = buildArticleImageVariantUrl(article?.image, 'featured');
  const defaultCardImage = buildArticleImageVariantUrl(article?.image, 'card');
  const articleImageClassName =
    'object-cover object-center transition-transform duration-500 group-hover:scale-105';

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setIsBookmarked(isSavedInProfile);
  }, [isSavedInProfile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSavedArticleEvent = (
      event: Event
    ) => {
      const payload = (event as CustomEvent<{
        articleId?: string;
        saved?: boolean;
      }>).detail;

      if (!payload || !article?.id || payload.articleId !== article.id || typeof payload.saved !== 'boolean') {
        return;
      }

      setIsBookmarked(payload.saved);
    };

    window.addEventListener(
      'lokswami:saved-article-updated',
      handleSavedArticleEvent as EventListener
    );

    return () => {
      window.removeEventListener(
        'lokswami:saved-article-updated',
        handleSavedArticleEvent as EventListener
      );
    };
  }, [article?.id]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diff < 60) {
      return language === 'hi' ? `${diff} \u092e\u093f\u0928\u091f \u092a\u0939\u0932\u0947` : `${diff} min ago`;
    } else if (diff < 1440) {
      const hours = Math.floor(diff / 60);
      return language === 'hi' ? `${hours} \u0918\u0902\u091f\u0947 \u092a\u0939\u0932\u0947` : `${hours} hours ago`;
    } else {
      const days = Math.floor(diff / 1440);
      return language === 'hi' ? `${days} \u0926\u093f\u0928 \u092a\u0939\u0932\u0947` : `${days} days ago`;
    }
  };

  const renderTime = (dateString: string) =>
    isHydrated ? formatTime(dateString) : language === 'hi' ? '\u0939\u093e\u0932 \u0939\u0940 \u092e\u0947\u0902' : 'recently';

  const cardVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.24,
        delay: index * 0.06,
      },
    },
  };

  const handleBookmarkClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isSignedIn) {
      router.push('/signin?redirect=/main/saved');
      return;
    }

    if (!canSaveArticle || isSavingBookmark) return;

    setIsSavingBookmark(true);

    try {
      const response = await fetch('/api/user/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ articleId: article.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: {
          saved?: boolean;
          savedArticleIds?: string[];
        };
      };

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error('Failed to toggle bookmark');
      }

      const nextSaved = Boolean(payload.data.saved);
      setIsBookmarked(nextSaved);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('lokswami:saved-article-updated', {
            detail: {
              articleId: article.id,
              saved: nextSaved,
              savedArticleIds: Array.isArray(payload.data.savedArticleIds)
                ? payload.data.savedArticleIds
                : undefined,
            },
          })
        );
      }
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    } finally {
      setIsSavingBookmark(false);
    }
  };

  if (variant === 'horizontal') {
    return (
      <motion.article variants={cardVariants} initial="hidden" animate="visible" className="group cnp-card cnp-card-hover relative overflow-hidden p-0" data-reader-card="true">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <Link href={articleHref} className="reader-touch-link reader-focus-ring flex gap-2.5 rounded-xl p-3 transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-800 sm:gap-4 sm:p-4">
          <div className="relative h-[72px] w-[88px] flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-950 sm:h-24 sm:w-28 md:h-28 md:w-36">
            <ReaderImage
              src={horizontalImage}
              alt={article.title}
              fill
              className={articleImageClassName}
              sizes="(max-width: 639px) 96px, (max-width: 767px) 112px, 144px"
            />
            {article.isBreaking ? (
              <div className="absolute left-1.5 top-1.5 animate-pulse rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white dark:bg-orange-500 sm:left-2 sm:top-2 sm:px-3 sm:py-1 sm:text-xs">LIVE</div>
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 sm:meta-text">{article.category}</span>
            <h3 className="mt-1 line-clamp-1 text-[0.96rem] font-semibold leading-snug text-gray-900 transition-colors group-hover:text-orange-600 dark:text-gray-100 dark:group-hover:text-orange-400 sm:mt-2 sm:line-clamp-2 sm:card-title">
              {article.title}
            </h3>
            <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-gray-600 dark:text-gray-400 sm:hidden">
              {article.summary}
            </p>
            <ArticleMetaRow
              article={article}
              timeText={renderTime(article.publishedAt)}
              language={language}
              className="mt-1.5 sm:mt-3"
              compact
              withBorder={false}
              showWhatsAppButton
              showEpaperButton
            />
          </div>
        </Link>
      </motion.article>
    );
  }

  if (variant === 'compact') {
    return (
      <motion.article variants={cardVariants} initial="hidden" animate="visible" className="group cnp-card cnp-card-hover relative overflow-hidden p-0" data-reader-card="true">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <Link href={articleHref} className="reader-touch-link reader-focus-ring block rounded-xl p-3.5 transition-all duration-300 sm:p-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="relative h-[64px] w-[82px] flex-shrink-0 overflow-hidden rounded-xl bg-zinc-100 shadow-sm dark:bg-zinc-800 sm:h-[72px] sm:w-[96px]">
              <ReaderImage
                src={horizontalImage}
                alt={article.title}
                fill
                className={articleImageClassName}
                sizes="(max-width: 639px) 82px, 96px"
              />
              {article.isBreaking ? (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-orange-600 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white dark:bg-orange-500">
                  {language === 'hi' ? 'लाइव' : 'LIVE'}
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-1 text-[0.95rem] font-semibold leading-snug transition-colors group-hover:text-orange-600 dark:group-hover:text-orange-400 sm:line-clamp-2 sm:card-title">{article.title}</h3>
              <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-gray-600 dark:text-gray-400 sm:hidden">
                {article.summary}
              </p>
              <div className="mt-1.5 inline-flex sm:mt-2">
                <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-600 dark:bg-orange-950/30 dark:text-orange-400 sm:px-2 sm:text-xs">
                  {article.category}
                </span>
              </div>
            </div>
          </div>
          <ArticleMetaRow
            article={article}
            timeText={renderTime(article.publishedAt)}
            language={language}
            className="mt-2.5 sm:mt-3"
            compact
            withBorder
            showWhatsAppButton
            showEpaperButton
            actionLayout="three-columns"
          />
        </Link>
      </motion.article>
    );
  }

  if (variant === 'featured') {
    return (
      <motion.article variants={cardVariants} initial="hidden" animate="visible" className="group relative card-hover overflow-hidden rounded-xl border border-zinc-200/80 transition-all duration-300 hover:border-red-500/60 hover:shadow-[0_12px_32px_-8px_rgba(220,38,38,0.28)] dark:border-zinc-800" data-reader-card="true">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[2.5px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-500" />
        <Link href={articleHref} className="reader-touch-link reader-focus-ring block">
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-zinc-950 md:rounded-xl">
            <ReaderImage
              src={featuredImage}
              alt={article.title}
              fill
              className={articleImageClassName}
              sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/5 group-hover:from-black group-hover:via-black/50" />
            {article.isBreaking ? (
              <div className="absolute left-4 top-4 animate-pulse rounded-full bg-orange-600 px-3 py-1.5 text-xs font-black text-white shadow-lg shadow-orange-600/50 dark:bg-orange-500 dark:shadow-orange-500/30">
                BREAKING
              </div>
            ) : null}
            <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
              <span className="meta-text text-orange-400 dark:text-orange-300 font-semibold uppercase tracking-wide">{article.category}</span>
              <h3 className="mt-2 line-clamp-2 text-base font-bold leading-tight text-white transition-colors group-hover:text-gray-100 md:text-lg">
                {article.title}
              </h3>
              <ArticleMetaRow
                article={article}
                timeText={renderTime(article.publishedAt)}
                language={language}
                className="mt-3"
                compact
                withBorder={false}
                inverted
                showWhatsAppButton
                showEpaperButton
              />
            </div>
          </div>
        </Link>
      </motion.article>
    );
  }

  return (
    <motion.article variants={cardVariants} initial="hidden" animate="visible" className="group cnp-card cnp-card-hover relative overflow-hidden p-0" data-reader-card="true">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <Link href={articleHref} className="reader-touch-link reader-focus-ring flex h-full flex-col">
        <div className={`relative overflow-hidden bg-zinc-100 dark:bg-zinc-950 ${isSmall ? 'aspect-[16/9]' : 'aspect-[16/10]'}`}>
          <ReaderImage
            src={defaultCardImage}
            alt={article.title}
            fill
            className={articleImageClassName}
            sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 420px"
          />

          {article.isBreaking ? (
            <div className={`absolute rounded-full bg-orange-600 font-semibold text-white shadow-sm dark:bg-orange-500 ${isSmall ? 'left-2.5 top-2.5 px-2 py-0.5 text-[9px]' : 'left-3 top-3 px-2 py-1 text-[10px]'}`}>
              {language === 'hi' ? '\u0932\u093e\u0907\u0935' : 'LIVE'}
            </div>
          ) : null}

          {article.isTrending ? (
            <div className={`absolute flex items-center rounded-full bg-gray-900 font-bold text-orange-500 shadow-sm backdrop-blur-sm dark:bg-gray-800/80 dark:text-orange-400 ${isSmall ? 'right-2.5 top-2.5 gap-1 px-2 py-1 text-[10px]' : 'right-3 top-3 gap-1.5 px-3 py-1.5 text-xs'}`}>
              <TrendingUp className={isSmall ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
              {language === 'hi' ? '\u091f\u094d\u0930\u0947\u0902\u0921\u093f\u0902\u0917' : 'Trending'}
            </div>
          ) : null}

          <div className={`absolute hidden gap-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100 md:flex ${isSmall ? 'bottom-2.5 right-2.5' : 'bottom-3 right-3'}`}>
            <button
              className={`reader-touch-button reader-focus-ring flex items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg transition-all hover:bg-orange-600 hover:text-white hover:shadow-orange-600/30 dark:bg-gray-800/90 dark:text-gray-100 dark:hover:bg-orange-500 dark:hover:shadow-orange-500/20 ${isSmall ? 'h-10 w-10' : 'h-11 w-11'}`}
              onClick={(e) => e.preventDefault()}
              aria-label="Share"
              data-reader-action="true"
            >
              <Share2 className={isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            </button>
            <button
              className={`reader-touch-button reader-focus-ring flex items-center justify-center rounded-full shadow-lg transition-all ${isBookmarked ? 'bg-orange-600 text-white hover:bg-orange-700 hover:shadow-orange-600/30 dark:bg-orange-500 dark:hover:bg-orange-500 dark:hover:shadow-orange-500/20' : 'bg-white/90 text-gray-900 hover:bg-orange-600 hover:text-white hover:shadow-orange-600/30 dark:bg-gray-800/90 dark:text-gray-100 dark:hover:bg-orange-500 dark:hover:shadow-orange-500/20'} ${isSmall ? 'h-10 w-10' : 'h-11 w-11'} ${!canSaveArticle || isSavingBookmark ? 'cursor-not-allowed opacity-60' : ''}`}
              onClick={handleBookmarkClick}
              disabled={!canSaveArticle || isSavingBookmark}
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              data-reader-action="true"
              title={
                !canSaveArticle
                  ? language === 'hi'
                    ? '\u0921\u0947\u092e\u094b \u0938\u094d\u091f\u094b\u0930\u0940 \u0915\u094b \u0938\u0947\u0935 \u0928\u0939\u0940\u0902 \u0915\u093f\u092f\u093e \u091c\u093e \u0938\u0915\u0924\u093e'
                    : 'Demo stories cannot be saved'
                  : undefined
              }
            >
              <Bookmark className={`${isSmall ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${isBookmarked ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>

        <div className={`flex flex-1 flex-col ${isSmall ? 'p-3.5 sm:p-4' : 'p-4 sm:p-5 md:p-6'}`}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400 sm:meta-text">{article.category}</span>
          <h3 className={`mt-1.5 line-clamp-1 transition-colors group-hover:text-orange-600 dark:group-hover:text-orange-400 ${isSmall ? 'text-[0.98rem] font-semibold leading-snug sm:line-clamp-2' : 'text-[1rem] font-semibold leading-snug sm:line-clamp-2 sm:card-title'}`}>
            {article.title}
          </h3>
          <p className={`mt-1.5 line-clamp-1 text-gray-600 dark:text-gray-400 ${isSmall ? 'text-[13px] leading-snug sm:line-clamp-2' : 'text-sm leading-snug sm:line-clamp-2 sm:subtitle-text'}`}>{article.summary}</p>
          <ArticleMetaRow
            article={article}
            timeText={renderTime(article.publishedAt)}
            language={language}
            className={`mt-auto ${isSmall ? 'pt-2.5' : 'pt-3 sm:pt-4'}`}
            compact={isSmall}
            withBorder
            showWhatsAppButton
            showEpaperButton
          />
        </div>
      </Link>
    </motion.article>
  );
}
