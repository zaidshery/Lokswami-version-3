import type { ReactNode } from 'react';

/** One editorial grid for all three rows; outer backgrounds remain full width. */
export default function ReaderHeaderContainer({ children, className = '' }: {
  children: ReactNode; className?: string;
}) {
  return <div data-reader-header-inner className={`mx-auto w-full max-w-page-wide min-w-0 px-2 sm:px-5 lg:px-6 xl:px-8 ${className}`}>{children}</div>;
}
