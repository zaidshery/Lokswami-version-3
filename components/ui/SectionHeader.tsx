import React, { type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export interface SectionHeaderProps {
  title: string;
  href?: string;
  ctaText?: string;
  level?: 'h1' | 'h2' | 'h3' | 'h4';
  accentColor?: string;
  icon?: ReactNode;
  className?: string;
  titleClassName?: string;
}

/**
 * LokSwami Design System — Section Header Primitive
 * Editorial section header featuring the signature LokSwami red vertical accent bar,
 * configurable semantic heading level, and optional call-to-action link.
 */
export function SectionHeader({
  title,
  href,
  ctaText,
  level = 'h2',
  accentColor = 'bg-brand-500',
  icon,
  className = '',
  titleClassName = '',
}: SectionHeaderProps) {
  const HeadingTag = level;

  return (
    <div className={`mb-3 flex min-w-0 items-center justify-between gap-3 ${className}`}>
      <HeadingTag
        className={`hindi-headline flex min-w-0 items-center gap-2 text-[1rem] font-bold text-zinc-900 dark:text-zinc-100 sm:text-[1.125rem] ${titleClassName}`}
      >
        <span
          className={`h-5 w-1.5 shrink-0 rounded-full shadow-[0_0_8px_rgba(231,33,41,0.35)] ${accentColor}`}
          aria-hidden="true"
        />
        {icon ? <span className="shrink-0" aria-hidden="true">{icon}</span> : null}
        <span className="truncate">{title}</span>
      </HeadingTag>

      {href && ctaText ? (
        <Link
          href={href}
          className="editorial-focus-ring inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-editorial-sm px-2 text-xs font-bold text-brand-500 transition hover:bg-brand-50 hover:text-brand-600 dark:text-brand-400 dark:hover:bg-brand-950/40 dark:hover:text-brand-300 sm:min-h-[32px]"
        >
          <span>{ctaText}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

export default SectionHeader;
