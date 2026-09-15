'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { signOut, useSession } from 'next-auth/react';
import {
  Bookmark,
  LogOut,
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
import Logo, { LogoWordmark } from '@/components/layout/Logo';

/** Renders the main site header with reader auth actions. */
export default function Header() {
  const [mounted, setMounted] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const {
    theme,
    toggleTheme,
    language,
    setLanguage,
    toggleMobileMenu,
    isMobileMenuOpen,
  } = useAppStore();
  const { data: session, status } = useSession();

  const userName = session?.user?.name?.trim() || 'Reader';
  const userEmail = session?.user?.email?.trim() || '';
  const userImage = session?.user?.image || null;
  const userInitial = (userName.charAt(0) || userEmail.charAt(0) || 'R').toUpperCase();

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) {
    return (
      <header
        aria-label="Site header"
        aria-busy="true"
        className="relative z-40 w-full border-b border-zinc-200/85 bg-white/95 shadow-[var(--shadow-soft)] backdrop-blur-md dark:border-zinc-800 dark:bg-[#0e0e12]/95"
      >
        <div className="relative flex h-12 items-center justify-between px-2 min-[380px]:px-3 sm:h-[3.45rem] sm:px-5 md:px-8">
          <div className="flex shrink-0 items-center">
            <div className="flex h-12 items-center md:hidden">
              <span className="h-9.5 w-9.5 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            </div>
            <div className="hidden md:flex lg:hidden items-center gap-2">
              <span className="h-9.5 w-9.5 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
              <Logo size="headerMobile" href="/main" />
            </div>
            <div className="hidden lg:block">
              <Logo size="headerDesktop" href="/main" />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center px-1 md:hidden">
            <span className="h-7.5 w-28 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          </div>
          <div aria-hidden="true" className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <span className="hidden md:inline-block h-8 w-14 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800 sm:h-9 sm:w-16 sm:rounded-xl" />
            <span className="hidden min-[390px]:inline-block h-8 w-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800 sm:h-9 sm:rounded-xl" />
            <span className="h-8 w-8 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800 min-[380px]:h-8.5 min-[380px]:w-8.5 sm:h-9 sm:w-9 sm:rounded-xl" />
            <span className="hidden lg:inline-block h-9 w-20 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            <span className="hidden lg:inline-block h-8 w-8 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800 sm:h-9 sm:w-9 sm:rounded-xl" />
          </div>
        </div>
        <div aria-hidden="true" className="flex min-h-10 items-center gap-3 overflow-hidden border-t border-zinc-200/80 px-2 sm:px-4 md:min-h-11 md:px-6 2xl:justify-center dark:border-zinc-800">
          {[64, 88, 76, 96, 72, 84, 90, 78].map((width, i) => (
            <span key={i} className="h-3 shrink-0 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" style={{ width }} />
          ))}
        </div>
      </header>
    );
  }

  return (
    <header className="relative z-40 w-full border-b border-zinc-200/85 bg-white/95 shadow-[var(--shadow-soft)] backdrop-blur-md transition-colors duration-500 dark:border-zinc-800 dark:bg-[#0e0e12]/95">
      <div className="relative w-full px-2 min-[380px]:px-2.5 min-[412px]:px-3 sm:px-5 md:px-8">
        <div className="relative flex h-12 items-center justify-between gap-1 sm:h-[3.45rem] sm:gap-3">
          {/* Left: Hamburger (visible on mobile <768px & tablet 768px–1023px; hidden on desktop >=1024px) / Tablet Logo / Desktop Logo */}
          <div className="relative z-20 flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="editorial-focus-ring -ml-0.5 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-zinc-800 transition-colors hover:bg-zinc-100 hover:text-zinc-950 active:scale-95 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-white lg:hidden"
              aria-label={language === 'hi' ? 'मेनू खोलें' : 'Open menu'}
              aria-controls="mobile-drawer"
              aria-expanded={isMobileMenuOpen}
            >
              <Menu className="h-5.5 w-5.5" strokeWidth={2.2} />
            </button>
            {/* Tablet (768px–1023px): Tablet Logo */}
            <div className="hidden min-w-0 md:flex lg:hidden items-center">
              <Logo size="headerMobile" href="/main" />
            </div>
            {/* Desktop (1024px+): Full Desktop Logo */}
            <div className="hidden min-w-0 lg:block">
              <Logo size="headerDesktop" href="/main" />
            </div>
          </div>

          {/* Center: Hindi Written Logo "लोकस्वामी" on mobile (<768px) - True geometric viewport center */}
          <div className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center md:hidden z-10">
            <Link
              href="/main"
              className="cnp-motion inline-flex h-12 max-w-full items-center justify-center transition-transform duration-200 active:scale-95"
              aria-label="Lokswami Home"
            >
              <LogoWordmark
                size="headerCompact"
                className="max-w-[110px] min-[360px]:max-w-[114px] min-[412px]:max-w-[122px] min-[430px]:max-w-[132px] sm:max-w-[150px]"
              />
            </Link>
          </div>

          <div className="relative z-20 ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 sm:ml-2">
            {/* E-Paper CTA - visible on tablet (768px+) and desktop; absent from mobile (<768px) */}
            <Link
              href="/main/epaper"
              className="cnp-motion editorial-focus-ring hidden md:inline-flex h-11 min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-500 px-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95 dark:border-brand-500/40 sm:px-3 order-0"
              aria-label={language === 'hi' ? 'ई-पेपर पढ़ें' : 'Read E-Paper'}
            >
              <Newspaper className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              <span className="leading-none tracking-normal">{language === 'hi' ? 'ई-पेपर' : 'e-Paper'}</span>
            </Link>

            {/* Compact Segmented [ HI | EN ] Language Toggle - visible on mobile 390px+ and tablet; on desktop placed after theme */}
            <div
              role="group"
              aria-label={language === 'hi' ? 'भाषा चयन' : 'Language selection'}
              className="hidden min-[390px]:inline-flex h-11 items-center rounded-xl border border-zinc-200/90 bg-zinc-100/90 p-0.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 order-1 lg:order-3"
            >
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                aria-pressed={language === 'hi'}
                aria-label="हिन्दी भाषा चुनें (Select Hindi)"
                className={`editorial-focus-ring relative flex h-full min-h-[44px] min-w-[34px] sm:min-w-[44px] items-center justify-center rounded-[10px] px-1.5 text-[11px] font-bold tracking-tight transition-all sm:px-2.5 sm:text-xs ${
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
                className={`editorial-focus-ring relative flex h-full min-h-[44px] min-w-[34px] sm:min-w-[44px] items-center justify-center rounded-[10px] px-1.5 text-[11px] font-bold tracking-tight transition-all sm:px-2.5 sm:text-xs ${
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
              className="cnp-motion editorial-focus-ring inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-800 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-brand-500/40 dark:hover:bg-brand-950/40 dark:hover:text-brand-300 order-2 lg:order-1"
              aria-label={language === 'hi' ? 'समाचार खोजें' : 'Search news'}
              title={language === 'hi' ? 'खोजें' : 'Search'}
            >
              <Search className="h-4 w-4" strokeWidth={2.2} />
            </Link>

            <div className="relative hidden lg:block order-3 lg:order-2" ref={userMenuRef}>
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
              className="cnp-motion editorial-focus-ring hidden lg:inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white text-zinc-800 shadow-sm hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 order-4 lg:order-4"
              aria-label="Toggle theme"
            >
              <span className="attention-pulsate-bck-slow inline-flex">
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </span>
            </motion.button>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-200/80 dark:border-zinc-800">
        <div className="scrollbar-hide reader-scroll-x flex min-h-10 items-center overflow-x-auto lg:overflow-visible touch-pan-x px-2 sm:px-4 md:min-h-11 md:px-6 2xl:justify-center" data-swipe-ignore="true">
          <DesktopNav className="min-w-max py-0" />
        </div>
      </div>
    </header>
  );
}
