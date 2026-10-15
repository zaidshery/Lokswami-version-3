import React, { type ReactNode } from 'react';
import { Newspaper } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/**
 * LokSwami Design System — Empty State Primitive
 * Clean, restrained editorial empty state for feeds, search results, and saved collections.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex min-h-[260px] flex-col items-center justify-center rounded-editorial-lg border border-dashed border-zinc-300/80 bg-zinc-50/60 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/30 sm:min-h-[300px] sm:p-12 ${className}`}
    >
      <div
        className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
        aria-hidden="true"
      >
        {icon || <Newspaper className="h-7 w-7 stroke-[1.5]" />}
      </div>
      <h3 className="hindi-headline text-base font-bold text-zinc-900 dark:text-zinc-100 sm:text-lg">
        {title}
      </h3>
      {description ? (
        <p className="hindi-body mt-1.5 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
