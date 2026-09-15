'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import {
  BookOpen,
  Home,
  Newspaper,
  PlayCircle,
  Zap,
  CircleUser,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import { READER_NAVIGATION, isReaderNavigationActive } from '@/lib/constants/readerNavigation';

interface BottomNavProps {
  onMenuClick?: () => void;
  isMenuOpen?: boolean;
  isOverlayDark?: boolean;
}

type BottomNavItem = {
  icon: LucideIcon;
  label: string;
  labelEn: string;
  href: string;
  ariaLabel?: string;
  ariaLabelEn?: string;
  isCenter?: boolean;
  isProfile?: boolean;
};

const baseNavItems: BottomNavItem[] = [
  { icon: Home, label: READER_NAVIGATION.home.name, labelEn: READER_NAVIGATION.home.nameEn, href: READER_NAVIGATION.home.href },
  {
    icon: Newspaper,
    label: '\u0908-\u092a\u0947\u092a\u0930',
    labelEn: 'E-Paper',
    ariaLabel: '\u0908-\u092a\u0947\u092a\u0930',
    ariaLabelEn: 'E-Paper',
    href: READER_NAVIGATION.epaper.href,
  },
  {
    icon: BookOpen,
    label: '\u0908-\u092e\u0948\u0917',
    labelEn: 'E-Mag',
    ariaLabel: '\u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928',
    ariaLabelEn: 'E-Magazine',
    href: READER_NAVIGATION.emagazine.href,
  },
  { icon: PlayCircle, label: 'Video', labelEn: 'Video', href: READER_NAVIGATION.videos.href },
  { icon: Zap, label: '\u095e\u091f\u093e\u095e\u091f', labelEn: 'Quick', href: '/main/ftaftaf' },
];

export default function BottomNav({
  isOverlayDark = false,
}: BottomNavProps) {
  const pathname = usePathname();
  const { language } = useAppStore();
  const { data: session, status } = useSession();

  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);

  const profileItem: BottomNavItem = {
    icon: CircleUser,
    label: isAuthenticated ? '\u092a\u094d\u0930\u094b\u092b\u093e\u0907\u0932' : '\u0932\u0949\u0917\u093f\u0928',
    labelEn: isAuthenticated ? 'Profile' : 'Login',
    ariaLabel: isAuthenticated
      ? (language === 'hi' ? '\u092a\u094d\u0930\u094b\u092b\u093e\u0907\u0932 \u0914\u0930 \u0916\u093e\u0924\u093e' : 'User profile and account')
      : (language === 'hi' ? '\u0938\u093e\u0907\u0928 \u0907\u0928 \u092f\u093e \u0932\u0949\u0917\u093f\u0928 \u0915\u0930\u0947\u0902' : 'Sign in or login'),
    ariaLabelEn: isAuthenticated ? 'User profile and account' : 'Sign in or login',
    href: isAuthenticated ? '/main/account' : '/signin?redirect=/main/account',
    isProfile: true,
  };

  const navItems = [...baseNavItems, profileItem];

  const shellTone = isOverlayDark
    ? 'border-white/10 bg-black/90 dark:border-white/10 dark:bg-black/90'
    : 'border-zinc-200/90 bg-white/95 dark:border-zinc-800 dark:bg-zinc-950/95';
  const inactiveTone = isOverlayDark
    ? 'text-zinc-300 hover:text-white'
    : 'text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100';
  const activeTone = isOverlayDark ? 'text-brand-400' : 'text-brand-500 dark:text-brand-400';
  const activeBackgroundTone = isOverlayDark
    ? 'bg-white/10'
    : 'bg-brand-50 dark:bg-brand-500/15';

  const isProfileActive =
    pathname.startsWith('/main/account') ||
    pathname.startsWith('/signin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/main/saved') ||
    pathname.startsWith('/main/preferences');

  return (
    <nav
      role="navigation"
      aria-label="Bottom Navigation"
      className={`fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur xl:hidden ${shellTone}`}
    >
      {/* Signature Lokswami Brand Gradient Top Line */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-[1px] h-[2px] bg-gradient-to-r from-brand-500 via-rose-500 to-amber-500 shadow-[0_0_8px_rgba(225,29,72,0.35)]"
      />
      <div className="mx-auto grid min-h-[var(--bottom-nav-height)] w-full max-w-xl grid-cols-6 items-center gap-x-0.5 px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1 min-[360px]:gap-x-1 min-[360px]:px-2 sm:gap-x-2 sm:px-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const label = language === 'hi' ? item.label : item.labelEn;
          const ariaLabel = language === 'hi'
            ? item.ariaLabel || item.label
            : item.ariaLabelEn || item.labelEn;
          const explicitAriaLabel = ariaLabel === label ? undefined : ariaLabel;
          const href = item.href;
          const isActive = item.isProfile
            ? isProfileActive
            : (href !== '#' && isReaderNavigationActive(pathname, href));

          return (
            <Link
              key={item.href}
              href={href}
              aria-label={explicitAriaLabel}
              aria-current={isActive ? 'page' : undefined}
              className="reader-touch-link relative flex min-h-[44px] min-w-[44px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 min-[360px]:px-1 editorial-focus-ring"
            >
              {isActive ? (
                <motion.div
                  layoutId="bottomNavActive"
                  className={`absolute inset-0.5 rounded-xl ${activeBackgroundTone} min-[360px]:inset-1`}
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                />
              ) : null}

              <Icon
                size={20}
                strokeWidth={isActive ? 2.4 : 1.8}
                className={`cnp-motion relative z-10 min-[380px]:h-[22px] min-[380px]:w-[22px] ${isActive ? activeTone : inactiveTone}`}
              />
              <span
                className={`cnp-motion relative z-10 max-w-full truncate text-[11px] font-semibold tracking-normal leading-tight pb-0.5 sm:text-xs ${
                  isActive ? activeTone : inactiveTone
                }`}
              >
                {label}
              </span>
              {/* Visible non-color active dot indicator */}
              {isActive ? (
                <span
                  aria-hidden="true"
                  className={`relative z-10 -mt-0.5 h-1 w-1 rounded-full ${isOverlayDark ? 'bg-white' : 'bg-brand-500 dark:bg-brand-400'}`}
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
