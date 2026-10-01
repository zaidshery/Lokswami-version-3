import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Article } from '@/lib/mock/data';
import { getNewsCategoryHref, resolveNewsCategory } from '@/lib/constants/newsCategories';
import { formatReaderDateTime } from '@/lib/utils/dateFormat';
import styles from './ArticleReader.module.css';

type HeaderArticle = Pick<Article,
  'title' | 'summary' | 'category' | 'author' | 'publishedAt' | 'isBreaking' | 'isTrending'
> & { updatedAt?: string };

function dateLabel(value: string | undefined, language: 'hi' | 'en') {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    iso: date.toISOString(),
    timestamp: date.getTime(),
    text: formatReaderDateTime(date, language),
  };
}

export default function ArticleReaderHeader({
  article, language, readMinutes, onAuthorClick, children, media, notice, showCategory = true,
}: {
  article: HeaderArticle;
  language: 'hi' | 'en';
  readMinutes: number;
  onAuthorClick: () => void;
  children: ReactNode;
  media?: ReactNode;
  notice?: ReactNode;
  showCategory?: boolean;
}) {
  const category = resolveNewsCategory(article.category);
  const categoryLabel = category
    ? language === 'hi' ? category.name : category.nameEn
    : article.category;
  const published = dateLabel(article.publishedAt, language);
  const updated = dateLabel(article.updatedAt, language);
  const showUpdated = published && updated && updated.timestamp - published.timestamp >= 60_000;
  const authorName = article.author.name.trim();
  const categoryClass = 'reader-focus-ring inline-flex min-h-11 items-center font-bold text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300';

  return (
    <>
    <header className={styles.header}>
      {showCategory || article.isBreaking || article.isTrending ? <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {showCategory ? category ? (
          <Link href={getNewsCategoryHref(category.slug)} className={categoryClass}>
            {categoryLabel}
          </Link>
        ) : <span className={categoryClass}>{categoryLabel}</span> : null}
        {article.isBreaking ? <span className="rounded bg-red-700 px-2 py-1 text-xs font-bold text-white">{language === 'hi' ? 'ब्रेकिंग' : 'BREAKING'}</span> : null}
        {article.isTrending ? <span className="rounded bg-zinc-900 px-2 py-1 text-xs font-bold text-white dark:bg-zinc-700">{language === 'hi' ? 'ट्रेंडिंग' : 'TRENDING'}</span> : null}
      </div> : null}
      <h1 lang={/[\u0900-\u097f]/.test(article.title) ? 'hi' : 'en'} className={styles.headline}>{article.title}</h1>
      {article.summary.trim() ? <p className={styles.summary}>{article.summary}</p> : null}
    </header>
    {media}
    <div className={styles.metadata}>
      <div className={styles.byline}>
        <div className={styles.authorDetails}>
          {authorName ? (
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={onAuthorClick}
                className="reader-focus-ring relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-zinc-200 dark:border-zinc-700"
                aria-label={language === 'hi' ? `${authorName} की प्रोफाइल फोटो देखें` : `View profile picture of ${authorName}`}>
                {article.author.avatar ? (
                  <Image src={article.author.avatar} alt={authorName} fill sizes="44px" unoptimized={!article.author.avatar.startsWith('/') || article.author.avatar.startsWith('//')} className="object-cover" />
                ) : <span className="flex h-full w-full items-center justify-center bg-red-700 font-bold text-white">{authorName.charAt(0)}</span>}
              </button>
              <div className="min-w-0">
                <p className="break-words font-bold text-zinc-900 dark:text-zinc-100">{authorName}</p>
                {article.author.programName ? <p className="break-words text-xs">{article.author.programName}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className={styles.headerActions}>{children}</div>
        <div className={styles.publicationDetails}>
          {published ? <p>{language === 'hi' ? 'प्रकाशित: ' : 'Published: '}<time dateTime={published.iso}>{published.text}</time> <span className="text-xs">IST</span></p> : null}
          {showUpdated ? <p>{language === 'hi' ? 'अपडेट: ' : 'Updated: '}<time dateTime={updated.iso}>{updated.text}</time> <span className="text-xs">IST</span></p> : null}
          <p className="text-xs">{language === 'hi' ? `${readMinutes} मिनट में पढ़ें` : `${readMinutes} min read`}</p>
        </div>
      </div>
      {notice}
    </div>
    </>
  );
}
