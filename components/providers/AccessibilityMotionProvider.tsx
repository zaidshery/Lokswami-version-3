'use client';

import { useEffect, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { useAppStore } from '@/lib/store/appStore';

export default function AccessibilityMotionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const language = useAppStore((state) => state.language);

  useEffect(() => {
    if (typeof document !== 'undefined' && language) {
      document.documentElement.lang = language;
    }
  }, [language]);

  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
