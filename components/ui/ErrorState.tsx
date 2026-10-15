import React, { type ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import Button from './Button';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryText?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * LokSwami Design System — Error State Primitive
 * High-visibility accessible error display adhering to role="alert" semantics.
 */
export function ErrorState({
  title = 'सामग्री लोड करने में समस्या हुई',
  description = 'कृपया अपना इंटरनेट कनेक्शन जांचें और पुनः प्रयास करें।',
  onRetry,
  retryText = 'पुनः प्रयास करें',
  action,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex min-h-[260px] flex-col items-center justify-center rounded-editorial-lg border border-red-200 bg-red-50/40 p-8 text-center dark:border-red-900/50 dark:bg-red-950/20 sm:min-h-[300px] sm:p-12 ${className}`}
    >
      <div
        className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
        aria-hidden="true"
      >
        <AlertCircle className="h-7 w-7 stroke-[1.75]" />
      </div>
      <h3 className="hindi-headline text-base font-bold text-zinc-900 dark:text-zinc-100 sm:text-lg">
        {title}
      </h3>
      {description ? (
        <p className="hindi-body mt-1.5 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      ) : null}
      {onRetry ? (
        <div className="mt-6">
          <Button
            variant="primary"
            size="md"
            onClick={onRetry}
            leftIcon={<RotateCcw className="h-4 w-4" />}
          >
            {retryText}
          </Button>
        </div>
      ) : action ? (
        <div className="mt-6">{action}</div>
      ) : null}
    </div>
  );
}

export default ErrorState;
