'use client';

import { useEffect, useRef, type ComponentType, type CSSProperties } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { X, ChevronRight, Facebook, Twitter, Instagram, Youtube, Languages } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import Logo from '@/components/layout/Logo';
import { COMPANY_INFO } from '@/lib/constants/company';
import { NEWS_CATEGORIES, getNewsCategoryHref } from '@/lib/constants/newsCategories';
import { READER_NAVIGATION } from '@/lib/constants/readerNavigation';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

type SocialLink = {
  icon: ComponentType<{ className?: string }>;
  href: string;
  label: string;
  brand: 'whatsapp' | 'facebook' | 'twitter' | 'instagram' | 'youtube';
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13.601 2.326A7.85 7.85 0 0 0 8.015 0C3.58 0-.049 3.627-.05 8.064a8.01 8.01 0 0 0 1.05 3.98L0 16l4.062-1.066a8.03 8.03 0 0 0 3.952 1.008h.003c4.435 0 8.064-3.627 8.064-8.064a7.9 7.9 0 0 0-2.48-5.552zm-5.586 12.3h-.003a6.68 6.68 0 0 1-3.402-.93l-.244-.145-2.41.632.643-2.35-.158-.242a6.69 6.69 0 0 1-1.028-3.526c.002-3.692 3.01-6.7 6.706-6.7a6.66 6.66 0 0 1 4.738 1.97 6.67 6.67 0 0 1 1.958 4.74c-.002 3.693-3.01 6.702-6.706 6.702z" />
      <path d="M11.74 9.93c-.202-.101-1.196-.59-1.382-.658-.185-.067-.32-.101-.455.101-.134.202-.522.658-.64.793-.118.134-.236.151-.438.05-.202-.1-.851-.313-1.62-.997-.598-.533-1.002-1.19-1.12-1.392-.118-.202-.013-.311.088-.412.09-.089.202-.236.303-.353.101-.118.135-.202.202-.337.067-.135.034-.253-.017-.354-.05-.101-.455-1.096-.623-1.5-.163-.392-.329-.338-.455-.344-.118-.005-.252-.006-.387-.006s-.354.05-.539.252c-.185.202-.707.69-.707 1.684 0 .994.724 1.955.825 2.09.101.134 1.425 2.176 3.45 3.05.482.208.857.332 1.15.425.483.154.922.132 1.269.08.387-.058 1.196-.488 1.365-.96.168-.472.168-.876.117-.96-.05-.084-.185-.135-.387-.236z" />
    </svg>
  );
}

const SOCIAL_LINKS: SocialLink[] = [
  { icon: WhatsAppIcon, href: COMPANY_INFO.social.whatsapp, label: 'WhatsApp', brand: 'whatsapp' },
  { icon: Facebook, href: COMPANY_INFO.social.facebook, label: 'Facebook', brand: 'facebook' },
  { icon: Twitter, href: COMPANY_INFO.social.twitter, label: 'Twitter', brand: 'twitter' },
  { icon: Instagram, href: COMPANY_INFO.social.instagram, label: 'Instagram', brand: 'instagram' },
  { icon: Youtube, href: COMPANY_INFO.social.youtube, label: 'YouTube', brand: 'youtube' },
];

const SOCIAL_BRAND_STYLES: Record<SocialLink['brand'], { glow: string; rgb: string }> = {
  whatsapp: {
    glow: 'bg-emerald-500/30',
    rgb: '16 185 129',
  },
  facebook: {
    glow: 'bg-[#1877F2]/30',
    rgb: '24 119 242',
  },
  twitter: {
    glow: 'bg-sky-400/30',
    rgb: '56 189 248',
  },
  instagram: {
    glow: 'bg-pink-500/30',
    rgb: '236 72 153',
  },
  youtube: {
    glow: 'bg-red-500/30',
    rgb: '239 68 68',
  },
};

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const { language, setLanguage } = useAppStore();
  const { status } = useSession();
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const accountHref =
    status === 'authenticated'
      ? '/main/account'
      : '/signin?redirect=/main/account';

  const pages = [
    READER_NAVIGATION.home,
    READER_NAVIGATION.latest,
    READER_NAVIGATION.elections,
    READER_NAVIGATION.videos,
    READER_NAVIGATION.epaper,
    READER_NAVIGATION.emagazine,
    READER_NAVIGATION.search,
    { name: '\u0905\u0915\u093e\u0909\u0902\u091f', nameEn: 'Account', href: accountHref },
    READER_NAVIGATION.contact,
  ];

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const selector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>(selector);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(selector);
    focusables?.[0]?.focus();
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/72"
            aria-hidden="true"
          />

          <motion.div
            ref={drawerRef}
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={language === 'hi' ? '\u0928\u0947\u0935\u093f\u0917\u0947\u0936\u0928 \u092e\u0947\u0928\u0942' : 'Navigation menu'}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280, mass: 0.65 }}
            className="fixed bottom-0 left-0 top-0 z-[70] w-[84vw] max-w-[340px] overflow-y-auto border-r border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex min-h-full flex-col">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                    {language === 'hi' ? '\u092e\u0947\u0928\u0942' : 'Menu'}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="cnp-motion reader-touch-button reader-focus-ring -mr-1 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label={language === 'hi' ? '\u092e\u0947\u0928\u0942 \u092c\u0902\u0926 \u0915\u0930\u0947\u0902' : 'Close menu'}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Language Switcher Preference in Drawer */}
              <div className="border-b border-zinc-200/80 px-4 py-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Languages size={18} className="text-zinc-500 dark:text-zinc-400" />
                    <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {language === 'hi' ? 'भाषा / Language' : 'Language / भाषा'}
                    </span>
                  </div>
                  <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => setLanguage('hi')}
                      className={`reader-touch-button rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        language === 'hi'
                          ? 'bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-400'
                          : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                      aria-pressed={language === 'hi'}
                    >
                      हिन्दी
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`reader-touch-button rounded-lg px-3 py-1 text-xs font-bold transition-all ${
                        language === 'en'
                          ? 'bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-400'
                          : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                      aria-pressed={language === 'en'}
                    >
                      English
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-3.5 pt-3.5">
                <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  {language === 'hi' ? '\u0936\u094d\u0930\u0947\u0923\u093f\u092f\u093e\u0901' : 'Categories'}
                </h3>
                <div className="mt-2 space-y-1">
                  {NEWS_CATEGORIES.map((category) => (
                    <Link
                      key={category.id}
                      href={getNewsCategoryHref(category.slug)}
                      onClick={onClose}
                      className="cnp-motion reader-touch-link reader-focus-ring group flex min-h-12 items-center justify-between rounded-xl bg-white px-2.5 py-2.5 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                          style={{ backgroundColor: category.color }}
                        >
                          {category.name.charAt(0)}
                        </span>
                        <div>
                          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{category.name}</span>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{category.nameEn}</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-zinc-500 transition-colors group-hover:text-red-600 dark:text-zinc-400 dark:group-hover:text-red-400" />
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mx-4 mt-3 border-t border-zinc-200/80 dark:border-zinc-800" />

              <div className="px-3.5 py-3.5">
                <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  {language === 'hi' ? '\u092a\u0947\u091c' : 'Pages'}
                </h3>
                <div className="mt-2 space-y-1">
                  {pages.map((page) => (
                    <Link
                      key={page.href}
                      href={page.href}
                      onClick={onClose}
                      className="cnp-motion reader-touch-link reader-focus-ring flex min-h-12 items-center justify-between rounded-xl bg-white px-2.5 py-2.5 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-800"
                    >
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {language === 'hi' ? page.name : page.nameEn}
                      </span>
                      <ChevronRight size={16} className="text-zinc-500 dark:text-zinc-400" />
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-auto border-t border-zinc-200/80 px-4 py-3 pb-[max(14px,env(safe-area-inset-bottom))] dark:border-zinc-800">
                <div className="mb-4 mt-1 flex items-center gap-3">
                  <Logo size="sm" href="/main" />
                </div>
                <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                  {language === 'hi' ? '\u0938\u0924\u094d\u092f\u092e\u0947\u0935 \u091c\u092f\u0924\u0947' : 'Truth Alone Triumphs'}
                </p>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {SOCIAL_LINKS.map((social, index) => {
                    const brandStyle = SOCIAL_BRAND_STYLES[social.brand];
                    return (
                      <a
                        key={social.label}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={social.label}
                        className="footer-social-float footer-social-bulb reader-touch-link reader-focus-ring group/social relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border bg-white/95 transition-all duration-300 dark:bg-zinc-900/75"
                        style={
                          {
                            animationDelay: `${index * 140}ms`,
                            '--bulb-rgb': brandStyle.rgb,
                            '--bulb-delay': `${index * 140}ms`,
                          } as CSSProperties
                        }
                      >
                        <span
                          className={`footer-social-glow pointer-events-none absolute -inset-4 rounded-full opacity-0 blur-xl transition duration-300 ${brandStyle.glow}`}
                          aria-hidden="true"
                        />
                        <span
                          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0)_45%)]"
                          aria-hidden="true"
                        />
                        <span className="footer-social-attention relative z-10 inline-flex">
                          <social.icon className="footer-social-icon h-[17px] w-[17px]" />
                        </span>
                      </a>
                    );
                  })}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {`\u00A9 ${new Date().getFullYear()} Lokswami. `}
                  {language === 'hi' ? '\u0938\u0930\u094d\u0935\u093e\u0927\u093f\u0915\u093e\u0930 \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924' : 'All rights reserved'}.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
