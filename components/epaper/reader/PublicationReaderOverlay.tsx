'use client';

import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { usePublicationReaderTheme } from '@/lib/hooks/usePublicationReaderTheme';

/** Keep theme snapshot updates inside the surface, preserving the reader children. */
const PublicationReaderOverlay = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function PublicationReaderOverlay({ className = '', children, ...props }, ref) {
    const theme = usePublicationReaderTheme();
    return <div {...props} ref={ref} className={`${className} ${theme === 'dark' ? 'dark' : ''}`}>{children}</div>;
  }
);

export default PublicationReaderOverlay;
