import React, { type HTMLAttributes, type ReactNode } from 'react';
import { Clock, User } from 'lucide-react';
import Badge from './Badge';

export interface MetadataRowProps extends HTMLAttributes<HTMLDivElement> {
  category?: string;
  authorName?: string;
  publishedText?: string;
  readMinutes?: number;
  viewCount?: number;
  language?: 'hi' | 'en';
  compact?: boolean;
  extraActions?: ReactNode;
}

/**
 * LokSwami Design System — MetadataRow Primitive
 * Standardized metadata row for article bylines, publishing timestamps, categories,
 * and reading time estimates with Devanagari-safe font rendering.
 */
export function MetadataRow({
  category,
  authorName,
  publishedText,
  readMinutes,
  viewCount,
  language = 'hi',
  compact = false,
  extraActions,
  className = '',
  ...props
}: MetadataRowProps) {
  const readTimeLabel = readMinutes
    ? language === 'hi'
      ? `${readMinutes} मिनट`
      : `${readMinutes} min read`
    : null;

  const viewCountLabel =
    typeof viewCount === 'number' && !Number.isNaN(viewCount)
      ? language === 'hi'
        ? `${viewCount.toLocaleString('hi-IN')} विचार`
        : `${viewCount.toLocaleString('en-IN')} views`
      : null;

  const items: { key: string; content: ReactNode }[] = [];

  if (authorName) {
    items.push({
      key: 'author',
      content: (
        <span className="inline-flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-200">
          <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{authorName}</span>
        </span>
      ),
    });
  }

  if (publishedText) {
    items.push({
      key: 'published',
      content: (
        <span className="inline-flex items-center gap-1 font-medium">
          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{publishedText}</span>
        </span>
      ),
    });
  }

  if (readTimeLabel) {
    items.push({
      key: 'read-time',
      content: <span className="font-medium">{readTimeLabel}</span>,
    });
  }

  if (viewCountLabel) {
    items.push({
      key: 'view-count',
      content: <span className="font-medium">{viewCountLabel}</span>,
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-zinc-500 dark:text-zinc-400 ${
        compact ? 'text-xs' : 'text-xs sm:text-sm'
      } ${className}`}
      {...props}
    >
      {category ? (
        <Badge variant="brand" size={compact ? 'sm' : 'md'}>
          {category}
        </Badge>
      ) : null}

      {items.map((item, index) => (
        <React.Fragment key={item.key}>
          {index > 0 ? (
            <span className="text-zinc-400 dark:text-zinc-600" aria-hidden="true">
              &bull;
            </span>
          ) : null}
          {item.content}
        </React.Fragment>
      ))}

      {extraActions ? (
        <div className="ml-auto inline-flex items-center gap-2">{extraActions}</div>
      ) : null}
    </div>
  );
}

export default MetadataRow;
