import React from 'react';

export type ContainerVariant =
  | 'reading'
  | 'article'
  | 'narrow'
  | 'standard'
  | 'wide'
  | 'full';

export interface ContainerProps {
  children: React.ReactNode;
  className?: string;
  variant?: ContainerVariant;
}

const VARIANT_MAX_WIDTHS: Record<ContainerVariant, string> = {
  reading: 'max-w-reading',
  article: 'max-w-article-container',
  narrow: 'max-w-page-narrow',
  standard: 'max-w-page-standard',
  wide: 'max-w-page-wide',
  full: 'max-w-full',
};

/**
 * Reusable Container component for consistent max-width and padding.
 * Supports editorial variants (reading ~68ch, article ~52rem, narrow ~48rem, standard ~72rem, wide ~86rem).
 * Defaults to 'wide' for 100% backwards compatibility.
 */
export default function Container({
  children,
  className = '',
  variant = 'wide',
}: ContainerProps) {
  return (
    <div
      className={`mx-auto w-full px-3 sm:px-5 lg:px-6 xl:px-8 ${VARIANT_MAX_WIDTHS[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
