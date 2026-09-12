'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/store/appStore';
import { getNewsCategoryHref } from '@/lib/constants/newsCategories';
import { READER_NAVIGATION, isReaderNavigationActive } from '@/lib/constants/readerNavigation';

// Primary editorial links visible in main bar
const PRIMARY_NAV_LINKS = [
  READER_NAVIGATION.home,
  READER_NAVIGATION.latest,
  READER_NAVIGATION.elections,
  {
    name: 'राजनीति',
    nameEn: 'Politics',
    href: getNewsCategoryHref('politics'),
  },
  {
    name: 'राष्ट्रीय',
    nameEn: 'National',
    href: getNewsCategoryHref('national'),
  },
  {
    name: 'खेल',
    nameEn: 'Sports',
    href: getNewsCategoryHref('sports'),
  },
  {
    name: 'बिजनेस',
    nameEn: 'Business',
    href: getNewsCategoryHref('business'),
  },
  {
    name: 'मनोरंजन',
    nameEn: 'Entertainment',
    href: getNewsCategoryHref('entertainment'),
  },
];

// Desktop-only products (preserved for existing responsive test contracts)
const DESKTOP_PRODUCT_LINKS = [
  READER_NAVIGATION.epaper,
  READER_NAVIGATION.emagazine,
  {
    name: 'वीडियो',
    nameEn: 'Video',
    href: '/main/videos',
  },
];

// Secondary / overflow links grouped under "More" (अन्य) dropdown
const MORE_NAV_LINKS = [
  {
    name: 'टेक',
    nameEn: 'Tech',
    href: getNewsCategoryHref('technology'),
  },
  {
    name: 'क्षेत्रीय',
    nameEn: 'Regional',
    href: getNewsCategoryHref('regional'),
  },
  {
    name: 'अंतरराष्ट्रीय',
    nameEn: 'International',
    href: getNewsCategoryHref('international'),
  },
  READER_NAVIGATION.digitalNewsroom,
  READER_NAVIGATION.contact,
];

interface DesktopNavProps {
  className?: string;
}

export default function DesktopNav({ className = '' }: DesktopNavProps) {
  const pathname = usePathname();
  const { language } = useAppStore();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);

  const isMoreActive = MORE_NAV_LINKS.some((link) =>
    isReaderNavigationActive(pathname, link.href)
  );

  useEffect(() => {
    if (!isMoreOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreOpen]);

  return (
    <nav
      role="navigation"
      aria-label={language === 'hi' ? 'मुख्य नेविगेशन' : 'Main Navigation'}
      className={`flex items-center gap-0.5 whitespace-nowrap sm:gap-1 xl:gap-1.5 ${className}`}
    >
      {/* Primary Editorial Links */}
      {PRIMARY_NAV_LINKS.map((link) => {
        const isActive = isReaderNavigationActive(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={`cnp-motion editorial-focus-ring group relative inline-flex min-h-[44px] items-center rounded-editorial-sm px-2.5 py-1.5 text-xs font-semibold tracking-normal transition-colors sm:px-3 sm:text-[13px] md:text-sm xl:px-3.5 xl:text-[14.5px] ${
              isActive
                ? 'text-brand-500 font-bold dark:text-brand-400'
                : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100'
            }`}
          >
            <motion.span
              className="absolute inset-1 -z-10 rounded-editorial-sm bg-zinc-100/80 dark:bg-zinc-800/70"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
            />

            <span>{language === 'hi' ? link.name : link.nameEn}</span>

            {isActive ? (
              <motion.span
                layoutId="active-nav-line"
                className="absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-full bg-brand-500 dark:bg-brand-400"
                transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              />
            ) : null}
          </Link>
        );
      })}

      {/* Desktop-Only Products (E-Paper, E-Magazine, Video) */}
      {DESKTOP_PRODUCT_LINKS.map((link) => {
        const isActive = isReaderNavigationActive(pathname, link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={`cnp-motion editorial-focus-ring group relative hidden lg:inline-flex min-h-[44px] items-center rounded-editorial-sm px-2.5 py-1.5 text-xs font-semibold tracking-normal transition-colors sm:px-3 sm:text-[13px] md:text-sm xl:px-3.5 xl:text-[14.5px] ${
              isActive
                ? 'text-brand-500 font-bold dark:text-brand-400'
                : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100'
            }`}
          >
            <motion.span
              className="absolute inset-1 -z-10 rounded-editorial-sm bg-zinc-100/80 dark:bg-zinc-800/70"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
            />

            <span>{language === 'hi' ? link.name : link.nameEn}</span>

            {isActive ? (
              <motion.span
                layoutId="active-nav-line"
                className="absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-full bg-brand-500 dark:bg-brand-400"
                transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              />
            ) : null}
          </Link>
        );
      })}

      {/* "More" (अन्य / More) Accessible Dropdown Menu */}
      <div className="relative inline-flex items-center" ref={moreRef}>
        <button
          ref={moreButtonRef}
          type="button"
          onClick={() => setIsMoreOpen((prev) => !prev)}
          aria-expanded={isMoreOpen}
          aria-haspopup="true"
          aria-label={language === 'hi' ? 'अन्य श्रेणियां' : 'More categories'}
          className={`cnp-motion editorial-focus-ring group relative inline-flex min-h-[44px] items-center gap-1 rounded-editorial-sm px-2.5 py-1.5 text-xs font-semibold tracking-normal transition-colors sm:px-3 sm:text-[13px] md:text-sm xl:px-3.5 xl:text-[14.5px] ${
            isMoreActive
              ? 'text-brand-500 font-bold dark:text-brand-400'
              : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100'
          }`}
        >
          <motion.span
            className="absolute inset-1 -z-10 rounded-editorial-sm bg-zinc-100/80 dark:bg-zinc-800/70"
            initial={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          />
          <span>{language === 'hi' ? 'अन्य' : 'More'}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${
              isMoreOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />

          {isMoreActive ? (
            <span
              className="absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-full bg-brand-500 dark:bg-brand-400"
              aria-hidden="true"
            />
          ) : null}
        </button>

        {/* Dropdown Popover */}
        <AnimatePresence>
          {isMoreOpen ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-editorial-md border border-zinc-200 bg-white p-1.5 shadow-editorial-lg dark:border-zinc-800 dark:bg-[#16161c]"
            >
              <div className="flex flex-col gap-0.5">
                {MORE_NAV_LINKS.map((link) => {
                  const isActive = isReaderNavigationActive(pathname, link.href);

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMoreOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`cnp-motion editorial-focus-ring flex min-h-[44px] items-center rounded-editorial-sm px-3 py-2 text-xs font-semibold tracking-normal transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-500 dark:bg-brand-950/40 dark:text-brand-400 font-bold'
                          : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100'
                      }`}
                    >
                      <span>{language === 'hi' ? link.name : link.nameEn}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </nav>
  );
}
