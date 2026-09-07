'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import type { Article } from '@/lib/mock/data';
import { buildArticleImageVariantUrl } from '@/lib/utils/articleMedia';
import { buildArticlePublicPath } from '@/lib/seo/articleSeo';
import ArticleMetaRow from './ArticleMetaRow';
import ReaderImage from './ReaderImage';

interface HeroCardProps {
  article: Article;
  parallax?: { x: number; y: number };
  variant?: 'editorial' | 'modern';
}

export default function HeroCard({ article, parallax = { x: 0, y: 0 }, variant = 'editorial' }: HeroCardProps) {
  const language = useAppStore((state) => state.language);
  const [isHydrated, setIsHydrated] = useState(false);
  const articleHref = article?.id ? buildArticlePublicPath({ id: article.id, slug: article.slug }) : '#';
  const heroImage = buildArticleImageVariantUrl(article?.image, 'hero');
  const imageTransform =
    variant === 'modern'
      ? 'translate3d(0, 0, 0)'
      : `translate3d(${parallax.x}px, ${parallax.y}px, 0) scale(1)`;

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diff < 60) {
      return language === 'hi' ? `${diff} min \u092a\u0939\u0932\u0947` : `${diff} min ago`;
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

  return (
    <article
      className="relative h-full group"
      data-reader-card="true"
    >
      <Link href={articleHref} className="reader-touch-link reader-focus-ring block h-full md:flex md:flex-col">
        <div
          className={`relative overflow-hidden ${
            variant === 'editorial'
              ? 'bg-[var(--newsroom-image-bg)] h-[clamp(156px,25vh,210px)] min-[420px]:h-[clamp(172px,27vh,226px)] sm:h-[clamp(210px,30vh,265px)] md:flex-1 md:min-h-0 md:aspect-auto rounded-t-lg rounded-b-none ring-1 ring-zinc-200/70 shadow-lg shadow-zinc-300/25 dark:ring-zinc-800 dark:shadow-black/30'
              : 'flex h-full flex-col rounded-[26.5px] bg-[var(--newsroom-hero-surface)] dark:bg-zinc-950'
          }`}
        >
          {variant === 'modern' ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="newsroom-image-bg relative aspect-[16/9] flex-none overflow-hidden rounded-t-[22px] sm:rounded-t-[30px]">
                <div
                  className="absolute inset-0 transition-transform duration-700 ease-out will-change-transform"
                  style={{ transform: imageTransform }}
                >
                  <ReaderImage
                    src={heroImage}
                    alt={article.title}
                    fill
                    className="object-contain object-center image-hover-zoom"
                    sizes="(max-width: 767px) 100vw, (max-width: 1279px) 66vw, 900px"
                    priority
                  />
                </div>
              </div>

              <div className="relative flex-none border-t border-zinc-200/80 bg-[var(--newsroom-hero-surface)] px-3 py-2.5 dark:border-zinc-800 sm:px-4 sm:py-3 lg:px-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h1 className="newsroom-hero-title-match max-w-[40rem] break-words text-[clamp(1.02rem,1.95vw,1.42rem)] text-zinc-950 transition-colors group-hover:text-red-600 dark:text-white dark:group-hover:text-gray-100">
                    {article.title}
                  </h1>

                  <div className="flex min-w-0 justify-end">
                    <ArticleMetaRow
                      article={article}
                      timeText={renderTime(article.publishedAt)}
                      language={language}
                      className="w-full max-w-[24rem] pt-0"
                      compact
                      compactDensity="tight"
                      withBorder={false}
                      showWhatsAppText
                      showEpaperButton
                      readPriority
                      actionLayout="three-columns"
                      secondaryLabelMode="always"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className="absolute inset-0 transition-transform duration-700 ease-out will-change-transform"
                style={{ transform: imageTransform }}
              >
                <ReaderImage
                  src={heroImage}
                  alt={article.title}
                  fill
                  className="object-cover object-center image-hover-zoom"
                  sizes="(max-width: 767px) 100vw, (max-width: 1279px) 66vw, 900px"
                  priority
                />
              </div>

              <div className="absolute inset-0 transition-opacity bg-gradient-to-t from-black/65 via-black/15 to-black/35 md:from-black/45 md:via-black/15 md:to-transparent group-hover:from-black/70 group-hover:via-black/25 md:group-hover:from-black/55 md:group-hover:via-black/20" />
            </>
          )}
        </div>
        {variant === 'editorial' ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.06 }}
            className="relative z-10 -mt-px rounded-b-2xl border border-t-0 border-zinc-200/80 bg-gradient-to-b from-white via-zinc-50 to-zinc-100 px-2.5 pb-1.5 pt-1.5 shadow-lg shadow-zinc-300/35 backdrop-blur-[1px] dark:border-zinc-800 dark:from-zinc-900/95 dark:via-zinc-950/95 dark:to-zinc-900 dark:shadow-black/25 md:hidden sm:px-3 sm:pb-2 sm:pt-2"
          >
            <span className="mb-2 block h-1.5 w-8 rounded-full bg-gradient-to-r from-red-500 to-red-400" />

            <div className="min-h-0">
              <h1 className="hi-heading line-clamp-2 text-[clamp(0.9rem,3.7vw,1.02rem)] font-semibold leading-[1.2] text-zinc-900 dark:text-white sm:text-[clamp(0.96rem,3.9vw,1.08rem)]">
                {article.title}
              </h1>
            </div>

            <ArticleMetaRow
              article={article}
              timeText={renderTime(article.publishedAt)}
              language={language}
              className="mt-1 !pt-0.5 sm:mt-1.5 sm:!pt-1"
              compact
              withBorder
              showWhatsAppText
              showEpaperButton
            />
          </motion.div>
        ) : null}

        {variant === 'editorial' ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
            className="relative z-10 -mt-px hidden rounded-b-2xl border border-t-0 border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50 px-4 pb-1 pt-3 shadow-lg shadow-zinc-200/35 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-900/80 dark:shadow-black/30 md:flex md:flex-col"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="h-1.5 w-10 rounded-full bg-gradient-to-r from-red-500 to-red-400" />
              <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                Top Pick <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </div>

            <div className="min-h-0 flex-1">
              <h1 className="hi-heading line-clamp-3 text-[1.2rem] font-semibold leading-[1.24] text-zinc-900 dark:text-zinc-100 lg:text-[1.34rem]">
                {article.title}
              </h1>
            </div>

            <ArticleMetaRow
              article={article}
              timeText={renderTime(article.publishedAt)}
              language={language}
              className="mt-1.5 !pt-1"
              withBorder
              showWhatsAppText
              showEpaperButton
            />
          </motion.div>
        ) : null}
      </Link>
    </article>
  );
}

