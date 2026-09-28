'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { signOut, useSession } from 'next-auth/react';
import {
  Bookmark,
  LogOut,
  Languages,
  Menu,
  Moon,
  Newspaper,
  Search,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import DesktopNav from './DesktopNav';
import Logo from '@/components/layout/Logo';
import ReaderHeaderContainer from './ReaderHeaderContainer';

/** Renders the main site header with reader auth actions. */
export default function Header() {
  const [mounted, setMounted] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const {
    theme,
    toggleTheme,
    language: storedLanguage,
    setLanguage,
    toggleMobileMenu,
    isMobileMenuOpen,
  } = useAppStore();
  const { data: session, status } = useSession();
  const language = mounted ? storedLanguage : 'hi';
  useEffect(() => { setMounted(true); }, []);

  const userName = session?.user?.name?.trim() || 'Reader';
  const userEmail = session?.user?.email?.trim() || '';
  const userImage = session?.user?.image || null;
  const userInitial = (userName.charAt(0) || userEmail.charAt(0) || 'R').toUpperCase();

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isUserMenuOpen]);

  async function handleReaderSignOut(): Promise<void> {
    try {
      setIsUserMenuOpen(false);
      await signOut({ callbackUrl: '/main' });
    } catch (error) {
      console.error('Reader sign-out failed:', error);
    }
  }

  return (
    <header data-testid="reader-brand-navigation" className="relative z-40 w-full border-b border-zinc-200/85 bg-white transition-colors dark:border-zinc-800 dark:bg-[#0e0e12]">
      <ReaderHeaderContainer className="relative">
        <div className="relative flex h-14 min-w-0 items-center justify-between gap-1 sm:h-16 sm:gap-3">
          <div className="flex min-w-0 shrink-0 items-center gap-0 min-[360px]:gap-1 md:gap-2">
            <button type="button" onClick={toggleMobileMenu}
              className="editorial-focus-ring inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              aria-label={language === 'hi' ? 'मेनू खोलें' : 'Open menu'}
              aria-controls="mobile-drawer" aria-expanded={isMobileMenuOpen}>
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/main" aria-label="Lokswami Home" className="editorial-focus-ring inline-flex shrink-0 items-center rounded-sm">
              <Logo size="headerDesktop" responsiveHeader />
            </Link>
          </div>

          <div className="relative ml-auto flex shrink-0 items-center justify-end gap-1 md:gap-2">
            {/* Required actions remain visible at every width. */}
            <Link
              href="/main/epaper"
              className="editorial-focus-ring inline-flex h-11 w-[42px] min-w-[42px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-brand-600 transition-colors hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/40 md:w-auto md:flex-row md:gap-1.5 md:rounded-xl md:border md:border-brand-500/30 md:bg-brand-500 md:px-3 md:text-xs md:font-semibold md:text-white md:shadow-sm md:hover:bg-brand-600 md:dark:text-white order-0"
              aria-label="E-Paper"
              title={language === 'hi' ? 'ई-पेपर पढ़ें' : 'Read E-Paper'}
            >
              <Newspaper className="h-5 w-5 shrink-0 md:h-4 md:w-4" strokeWidth={2} />
              <span className="text-[9px] font-semibold leading-none md:hidden">ePaper</span>
              <span className="hidden leading-none tracking-normal md:inline">{language === 'hi' ? 'ई-पेपर' : 'E-Paper'}</span>
            </Link>

            {/* One app-style mobile action; segmented controls start at tablet width. */}
            <button type="button" onClick={() => setLanguage(language === 'hi' ? 'en' : 'hi')}
              data-testid="reader-mobile-language"
              aria-label={language === 'hi' ? 'Language: HI. Switch to English' : 'Language: EN. Switch to Hindi'}
              aria-pressed={language === 'en'}
              className="editorial-focus-ring inline-flex h-11 w-[42px] !min-w-[42px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 md:hidden order-1">
              <Languages className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              <span className="text-[9px] leading-none">{language === 'hi' ? 'HI' : 'EN'}</span>
            </button>
            <div
              role="group"
              aria-label={language === 'hi' ? 'भाषा चयन' : 'Language selection'}
              className="hidden h-11 items-center rounded-xl border border-zinc-200/90 bg-zinc-100/90 p-0.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 md:inline-flex order-1"
            >
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                aria-pressed={language === 'hi'}
                aria-label="हिन्दी भाषा चुनें (Select Hindi)"
                className={`editorial-focus-ring relative flex h-full min-h-[44px] !min-w-[28px] sm:!min-w-[44px] items-center justify-center rounded-[10px] px-1 text-[10px] font-bold tracking-tight transition-colors sm:px-2.5 sm:text-xs ${
                  language === 'hi'
                    ? 'bg-white text-brand-600 shadow-sm font-black ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:text-brand-400 dark:ring-white/10'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                <span>HI</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                aria-pressed={language === 'en'}
                aria-label="Select English language (अंग्रेज़ी चुनें)"
                className={`editorial-focus-ring relative flex h-full min-h-[44px] !min-w-[28px] sm:!min-w-[44px] items-center justify-center rounded-[10px] px-1 text-[10px] font-bold tracking-tight transition-colors sm:px-2.5 sm:text-xs ${
                  language === 'en'
                    ? 'bg-white text-brand-600 shadow-sm font-black ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:text-brand-400 dark:ring-white/10'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                <span>EN</span>
              </button>
            </div>

            {/* Search Entry Button - Accessible across all viewports */}
            <Link
              href="/main/search"
              className="editorial-focus-ring inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 md:rounded-xl md:border md:border-zinc-200/90 md:bg-white md:shadow-sm md:dark:border-zinc-800 md:dark:bg-zinc-900 order-2"
              aria-label={language === 'hi' ? 'समाचार खोजें' : 'Search news'}
              title={language === 'hi' ? 'खोजें' : 'Search'}
            >
              <Search className="h-5 w-5" strokeWidth={2} />
            </Link>

            <div className="relative hidden lg:block order-3" ref={userMenuRef}>
              {status === 'loading' ? (
                <div className="h-11 w-11 min-h-[44px] min-w-[44px] animate-pulse rounded-full border border-zinc-200/90 bg-zinc-200/80 dark:border-zinc-800 dark:bg-zinc-700" />
              ) : userEmail ? (
                <>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setIsUserMenuOpen((open) => !open)}
                    className="editorial-focus-ring relative inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center overflow-hidden rounded-full border border-zinc-200/90 bg-white text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    aria-label={language === 'hi' ? 'रीडर मेनू' : 'Reader menu'}
                  >
                    {userImage ? (
                      <Image
                        src={userImage}
                        alt={userName}
                        fill
                        sizes="44px"
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-bold">{userInitial}</span>
                    )}
                  </motion.button>

                  <AnimatePresence>
                    {isUserMenuOpen ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: -6 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className="absolute right-0 top-12 z-[80] w-72 rounded-2xl border border-zinc-200 bg-white p-3 shadow-[0_22px_50px_rgba(15,23,42,0.18)] dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/80">
                          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {userName}
                          </p>
                          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {userEmail}
                          </p>
                        </div>

                        <div className="mt-2 space-y-1">
                          <Link
                            href="/main/account"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <User size={16} />
                            <span>My Account</span>
                          </Link>
                          <Link
                            href="/main/saved"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <Bookmark size={16} />
                            <span>Saved Articles</span>
                          </Link>
                          <Link
                            href="/main/preferences"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <Settings size={16} />
                            <span>Preferences</span>
                          </Link>
                        </div>

                        <div className="mt-2 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                          <button
                            type="button"
                            onClick={handleReaderSignOut}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/40"
                          >
                            <LogOut size={16} />
                            <span>Sign Out</span>
                          </button>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </>
              ) : (
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Link
                    href="/signin"
                    className="cnp-motion editorial-focus-ring inline-flex h-11 min-h-[44px] items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-3 text-xs font-semibold text-zinc-800 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-brand-500/40 dark:hover:bg-brand-950/40 dark:hover:text-brand-300"
                    aria-label={language === 'hi' ? 'साइन इन' : 'Sign In'}
                  >
                    <User size={16} />
                    <span>Sign In</span>
                  </Link>
                </motion.div>
              )}
            </div>

            {/* Desktop Only: Theme Toggle */}
            <motion.button
              onClick={toggleTheme}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="cnp-motion editorial-focus-ring hidden lg:inline-flex h-11 w-9 min-h-[44px] sm:w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-800 shadow-sm hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 order-4"
              aria-label="Toggle theme"
            >
              <span className="attention-pulsate-bck-slow inline-flex">
                {mounted && theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </span>
            </motion.button>
          </div>
        </div>
      </ReaderHeaderContainer>

      <div data-testid="reader-category-bar" className="min-w-0 border-t border-zinc-200/80 dark:border-zinc-800">
        <ReaderHeaderContainer>
          <div className="scrollbar-hide reader-scroll-x flex h-11 min-w-0 items-center overflow-x-auto overscroll-x-contain touch-pan-x" data-swipe-ignore="true">
            <DesktopNav className="min-w-max py-0" />
          </div>
        </ReaderHeaderContainer>
      </div>
    </header>
  );
}
