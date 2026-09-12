import React, { type ReactNode } from 'react';
import Container, { type ContainerVariant } from '@/components/layout/Container';

export interface ReaderPageShellProps {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
  description?: string;
  headerActions?: ReactNode;
  variant?: ContainerVariant;
  className?: string;
  contentClassName?: string;
}

/**
 * LokSwami Design System — Reader Page Shell
 * Standardized wrapper for reader pages providing structured hierarchy,
 * consistent vertical rhythm, semantic page title, and responsive container constraints.
 */
export function ReaderPageShell({
  children,
  title,
  eyebrow,
  description,
  headerActions,
  variant = 'standard',
  className = '',
  contentClassName = '',
}: ReaderPageShellProps) {
  return (
    <div className={`py-4 sm:py-6 md:py-8 ${className}`}>
      <Container variant={variant}>
        {(title || eyebrow || description || headerActions) ? (
          <header className="mb-6 border-b border-zinc-200/80 pb-5 dark:border-zinc-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                {eyebrow ? (
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-500 dark:text-brand-400">
                    {eyebrow}
                  </p>
                ) : null}
                {title ? (
                  <h1 className="hindi-headline text-2xl font-black text-zinc-950 dark:text-white sm:text-3xl md:text-4xl">
                    {title}
                  </h1>
                ) : null}
                {description ? (
                  <p className="hindi-body mt-2 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
                    {description}
                  </p>
                ) : null}
              </div>
              {headerActions ? (
                <div className="shrink-0 flex items-center gap-2 sm:self-end">
                  {headerActions}
                </div>
              ) : null}
            </div>
          </header>
        ) : null}
        <div className={contentClassName}>{children}</div>
      </Container>
    </div>
  );
}

export default ReaderPageShell;
