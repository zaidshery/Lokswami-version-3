'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store/appStore';
import { NEWS_CATEGORIES, getNewsCategoryHref } from '@/lib/constants/newsCategories';
import { READER_NAVIGATION, isReaderNavigationActive } from '@/lib/constants/readerNavigation';

const primaryLinks = [
  READER_NAVIGATION.home,
  READER_NAVIGATION.elections,
  READER_NAVIGATION.epaper,
  READER_NAVIGATION.emagazine,
  {
    name: 'वीडियो',
    nameEn: 'Video',
    href: '/main/videos',
  },
];

const categoryLinks = NEWS_CATEGORIES.map((category) => ({
  name: category.name,
  nameEn: category.nameEn,
  href: getNewsCategoryHref(category.slug),
}));

const utilityLinks = [
  READER_NAVIGATION.search,
  READER_NAVIGATION.contact,
];

const mainLinks = [...primaryLinks, ...categoryLinks, ...utilityLinks];

interface DesktopNavProps {
  className?: string;
}

export default function DesktopNav({ className = '' }: DesktopNavProps) {
  const pathname = usePathname();
  const { language } = useAppStore();

  return (
    <nav className={`flex items-center gap-0.5 whitespace-nowrap sm:gap-1 xl:gap-1.5 ${className}`}>
      {mainLinks.map((link) => {
        const isActive = isReaderNavigationActive(pathname, link.href);
        const isDesktopOnly =
          link.href === READER_NAVIGATION.epaper.href ||
          link.href === READER_NAVIGATION.emagazine.href ||
          link.href === '/main/videos';

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={`cnp-motion reader-touch-link reader-focus-ring group relative min-h-9 items-center rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors sm:min-h-10 sm:px-2.5 sm:text-[13px] md:px-3 md:text-sm xl:min-h-11 xl:px-3.5 xl:py-2.5 xl:text-[14.5px] ${
              isDesktopOnly ? 'hidden lg:inline-flex' : 'inline-flex'
            } ${
              isActive
                ? 'text-red-600 dark:text-red-400'
                : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100'
            }`}
          >
            <motion.span
              className="absolute inset-0 -z-10 rounded-lg bg-zinc-100/80 dark:bg-zinc-800/70"
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            />

            <span>{language === 'hi' ? link.name : link.nameEn}</span>

            {isActive ? (
              <motion.span
                layoutId="active-nav-line"
                className="absolute bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-red-600 dark:bg-red-400 md:left-2.5 md:right-2.5"
                transition={{ type: 'spring', stiffness: 420, damping: 40 }}
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
