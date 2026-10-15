'use client';

import Link from 'next/link';
import { type ComponentType, type CSSProperties, useMemo } from 'react';
import { useAppStore } from '@/lib/store/appStore';
import {
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  Mail,
  Phone,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { COMPANY_INFO } from '@/lib/constants/company';
import { NEWS_CATEGORIES, getNewsCategoryHref } from '@/lib/constants/newsCategories';
import Container from '@/components/layout/Container';
import Logo from '@/components/layout/Logo';

type FooterLink = {
  href: string;
  hi: string;
  en: string;
};

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

const COMPANY_LINKS: FooterLink[] = [
  { href: '/about', hi: '\u0939\u092e\u093e\u0930\u0947 \u092c\u093e\u0930\u0947 \u092e\u0947\u0902', en: 'About Us' },
  { href: '/careers', hi: '\u0915\u0930\u093f\u092f\u0930', en: 'Careers' },
  { href: '/advertise', hi: '\u0935\u093f\u091c\u094d\u091e\u093e\u092a\u0928', en: 'Advertise' },
  { href: '/main/privacy', hi: '\u092a\u094d\u0930\u093e\u0907\u0935\u0947\u0938\u0940 \u092a\u0949\u0932\u093f\u0938\u0940', en: 'Privacy Policy' },
  { href: '/main/terms', hi: '\u0928\u093f\u092f\u092e \u0914\u0930 \u0936\u0930\u094d\u0924\u0947\u0902', en: 'Terms & Conditions' },
  { href: '/contact', hi: '\u0938\u0902\u092a\u0930\u094d\u0915 \u0915\u0930\u0947\u0902', en: 'Contact' },
];

const QUICK_LINKS: FooterLink[] = [
  { href: '/main', hi: '\u0939\u094b\u092e', en: 'Home' },
  { href: '/main/latest', hi: '\u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902', en: 'Latest News' },
  { href: '/main/elections', hi: '\u091a\u0941\u0928\u093e\u0935', en: 'Elections' },
  { href: '/main/videos', hi: '\u0935\u0940\u0921\u093f\u092f\u094b', en: 'Videos' },
  { href: '/main/epaper', hi: 'E-Paper', en: 'E-Paper' },
  { href: '/main/contact', hi: '\u0938\u0902\u092a\u0930\u094d\u0915', en: 'Contact' },
  { href: '/main/about', hi: '\u0939\u092e\u093e\u0930\u0947 \u092c\u093e\u0930\u0947 \u092e\u0947\u0902', en: 'About Us' },
];

const FOOTER_CATEGORY_ORDER = [
  'national',
  'international',
  'sports',
  'entertainment',
  'technology',
  'business',
] as const;

const CATEGORY_LINKS: FooterLink[] = FOOTER_CATEGORY_ORDER.map((slug) => {
  const category = NEWS_CATEGORIES.find((item) => item.slug === slug);
  return {
    href: getNewsCategoryHref(slug),
    hi: category?.name ?? '',
    en: category?.nameEn ?? slug,
  };
}).filter((item) => item.hi.trim() !== '');

const LEGAL_LINKS: FooterLink[] = [
  { href: '/main/cookies', hi: '\u0915\u0941\u0915\u0940 \u0928\u0940\u0924\u093f', en: 'Cookie Policy' },
  { href: '/main/disclaimer', hi: '\u0905\u0938\u094d\u0935\u0940\u0915\u0930\u0923', en: 'Disclaimer' },
  { href: '/main/privacy', hi: '\u092a\u094d\u0930\u093e\u0907\u0935\u0947\u0938\u0940 \u092a\u0949\u0932\u093f\u0938\u0940', en: 'Privacy Policy' },
  { href: '/main/terms', hi: '\u0928\u093f\u092f\u092e \u0914\u0930 \u0936\u0930\u094d\u0924\u0947\u0902', en: 'Terms & Conditions' },
  { href: '/main/sitemap', hi: '\u0938\u093e\u0907\u091f\u092e\u0948\u092a', en: 'Sitemap' },
];

const SOCIAL_LINKS: SocialLink[] = [
  { icon: WhatsAppIcon, href: COMPANY_INFO.social.whatsapp, label: 'WhatsApp', brand: 'whatsapp' },
  { icon: Facebook, href: COMPANY_INFO.social.facebook, label: 'Facebook', brand: 'facebook' },
  { icon: Twitter, href: COMPANY_INFO.social.twitter, label: 'Twitter', brand: 'twitter' },
  { icon: Instagram, href: COMPANY_INFO.social.instagram, label: 'Instagram', brand: 'instagram' },
  { icon: Youtube, href: COMPANY_INFO.social.youtube, label: 'YouTube', brand: 'youtube' },
];

const SOCIAL_BRAND_STYLES: Record<
  SocialLink['brand'],
  { hover: string; glow: string; rgb: string }
> = {
  whatsapp: {
    hover:
      'md:hover:border-emerald-500 md:hover:text-emerald-500 md:hover:shadow-[0_14px_28px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] dark:md:hover:text-emerald-400',
    glow: 'bg-emerald-500/30',
    rgb: '16 185 129',
  },
  facebook: {
    hover:
      'md:hover:border-[#1877F2] md:hover:text-[#1877F2] md:hover:shadow-[0_14px_28px_rgba(24,119,242,0.28),inset_0_1px_0_rgba(255,255,255,0.15)]',
    glow: 'bg-[#1877F2]/30',
    rgb: '24 119 242',
  },
  twitter: {
    hover:
      'md:hover:border-sky-400 md:hover:text-sky-400 md:hover:shadow-[0_14px_28px_rgba(56,189,248,0.26),inset_0_1px_0_rgba(255,255,255,0.15)]',
    glow: 'bg-sky-400/30',
    rgb: '56 189 248',
  },
  instagram: {
    hover:
      'md:hover:border-pink-500 md:hover:text-pink-500 md:hover:shadow-[0_14px_28px_rgba(236,72,153,0.28),inset_0_1px_0_rgba(255,255,255,0.15)] dark:md:hover:text-pink-400',
    glow: 'bg-pink-500/30',
    rgb: '236 72 153',
  },
  youtube: {
    hover:
      'md:hover:border-red-500 md:hover:text-red-500 md:hover:shadow-[0_14px_28px_rgba(239,68,68,0.28),inset_0_1px_0_rgba(255,255,255,0.15)] dark:md:hover:text-red-400',
    glow: 'bg-red-500/30',
    rgb: '239 68 68',
  },
};

function dedupeLinks(items: FooterLink[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.href.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function FooterSection({
  title,
  items,
  language,
  twoCols = false,
}: {
  title: string;
  items: FooterLink[];
  language: 'hi' | 'en';
  twoCols?: boolean;
}) {
  const listClassName = twoCols
    ? 'grid grid-cols-1 gap-y-1.5 xl:grid-cols-2 xl:gap-x-5'
    : 'space-y-1.5';

  return (
    <div>
      <details className="group rounded-2xl border border-zinc-200/80 px-3 py-0 dark:border-zinc-800 md:hidden">
        <summary className="reader-touch-button reader-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3">
          <span className="text-[1.08rem] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
            {title}
          </span>
          <ChevronRight className="h-4 w-4 text-zinc-500 transition group-open:rotate-90 dark:text-zinc-400" />
        </summary>
        <div className="border-t border-zinc-200 py-3 dark:border-zinc-800">
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={false}
                  className="reader-touch-link reader-focus-ring inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-[14px] font-medium leading-6 text-zinc-600 transition hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  {language === 'hi' ? item.hi : item.en}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <div className="hidden md:block">
        <h3 className="mb-3 border-b border-zinc-200 pb-2 text-[1.28rem] font-semibold leading-tight tracking-tight text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
          {title}
        </h3>
        <ul className={listClassName}>
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                className="reader-touch-link reader-focus-ring inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-[14px] font-medium leading-6 text-zinc-600 transition hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 md:text-[15px]"
              >
                <ChevronRight className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                {language === 'hi' ? item.hi : item.en}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Footer() {
  const { language } = useAppStore();

  const companyLinks = useMemo(() => dedupeLinks(COMPANY_LINKS), []);
  const quickLinks = useMemo(() => dedupeLinks(QUICK_LINKS), []);
  const categoryLinks = useMemo(() => dedupeLinks(CATEGORY_LINKS), []);
  const legalLinks = useMemo(() => dedupeLinks(LEGAL_LINKS), []);
  const socialLinks = useMemo(() => {
    const seen = new Set<string>();
    return SOCIAL_LINKS.filter((item) => {
      const href = item.href?.trim();
      if (!href) return false;
      const key = href.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
      <Container className="max-w-[92rem] py-7 md:py-9">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 xl:[grid-template-columns:minmax(220px,1.2fr)_repeat(3,minmax(170px,1fr))_minmax(280px,1.45fr)] xl:gap-6">
          <div>
            <div className="inline-block">
              <Logo size="md" href="/main" />
            </div>

            <p className="mt-3 max-w-[20rem] text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400 md:text-[15px] md:leading-7">
              {language === 'hi'
                ? '\u092d\u093e\u0930\u0924 \u0915\u093e \u0938\u092c\u0938\u0947 \u092d\u0930\u094b\u0938\u0947\u092e\u0902\u0926 \u0921\u093f\u091c\u093f\u091f\u0932 \u0928\u094d\u092f\u0942\u091c \u092a\u094d\u0932\u0947\u091f\u092b\u0949\u0930\u094d\u092e\u0964 \u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902, \u0935\u0940\u0921\u093f\u092f\u094b \u0914\u0930 \u0908-\u092a\u0947\u092a\u0930 \u090f\u0915 \u0939\u0940 \u091c\u0917\u0939 \u092a\u0930\u0964'
                : "India's most trusted digital news platform. Latest news, videos, and epaper all in one place."}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {socialLinks.map((social, index) => {
                const brandStyle = SOCIAL_BRAND_STYLES[social.brand];
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`footer-social-float footer-social-bulb reader-touch-link reader-focus-ring group/social relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border bg-white/95 transition-all duration-300 will-change-transform active:[transform:perspective(700px)_rotateX(4deg)_translateY(1px)] dark:bg-zinc-900/75 md:[transform:translateZ(0)] md:hover:[transform:perspective(900px)_rotateX(10deg)_rotateY(-10deg)_translateY(-3px)] ${brandStyle.hover}`}
                    style={
                      {
                        animationDelay: `${index * 140}ms`,
                        '--bulb-rgb': brandStyle.rgb,
                        '--bulb-delay': `${index * 140}ms`,
                      } as CSSProperties
                    }
                    aria-label={social.label}
                  >
                    <span
                      className={`footer-social-glow pointer-events-none absolute -inset-4 rounded-full opacity-0 blur-xl transition duration-300 md:group-hover/social:opacity-100 ${brandStyle.glow}`}
                      aria-hidden="true"
                    />
                    <span
                      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0)_45%)]"
                      aria-hidden="true"
                    />
                    <span className="footer-social-attention relative z-10 inline-flex">
                      <social.icon className="footer-social-icon h-[18px] w-[18px] transition-transform duration-300 md:group-hover/social:scale-110 md:group-hover/social:-translate-y-0.5" />
                    </span>
                  </a>
                );
              })}
            </div>
          </div>

          <div>
            <FooterSection
              title={language === 'hi' ? '\u0915\u0902\u092a\u0928\u0940' : 'Company'}
              items={companyLinks}
              language={language}
            />
          </div>

          <div>
            <FooterSection
              title={language === 'hi' ? '\u0915\u094d\u0935\u093f\u0915 \u0932\u093f\u0902\u0915\u094d\u0938' : 'Quick Links'}
              items={quickLinks}
              language={language}
            />
          </div>

          <div>
            <FooterSection
              title={language === 'hi' ? '\u0936\u094d\u0930\u0947\u0923\u093f\u092f\u093e\u0901' : 'Categories'}
              items={categoryLinks}
              language={language}
            />
          </div>

          <div>
            <details className="group rounded-2xl border border-zinc-200/80 px-3 py-0 dark:border-zinc-800 md:hidden">
              <summary className="reader-touch-button reader-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3">
                <span className="text-[1.08rem] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">
                  {language === 'hi' ? '\u0938\u0902\u092a\u0930\u094d\u0915 \u0915\u0930\u0947\u0902' : 'Contact Us'}
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-500 transition group-open:rotate-90 dark:text-zinc-400" />
              </summary>

              <div className="border-t border-zinc-200 py-3 dark:border-zinc-800">
                <ul className="space-y-2.5 text-zinc-600 dark:text-zinc-400">
                  <li className="flex items-start gap-3 rounded-xl">
                    <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                    <a
                      href={COMPANY_INFO.address.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="reader-touch-link reader-focus-ring -mt-2 max-w-[26rem] rounded-xl px-1 py-2 text-[13px] leading-6 text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400"
                      aria-label={language === 'hi' ? '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940 \u0932\u094b\u0915\u0947\u0936\u0928 Google Maps \u092e\u0947\u0902 \u0916\u094b\u0932\u0947\u0902' : 'Open Lokswami location in Google Maps'}
                    >
                      {COMPANY_INFO.address.displayAddress}
                    </a>
                  </li>

                  <li className="flex items-center gap-3">
                    <Phone className="h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                    <a href={COMPANY_INFO.contact.phoneHref} className="reader-touch-link reader-focus-ring inline-flex min-h-10 items-center rounded-xl px-1 text-[14px] font-medium leading-6 text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400">
                      {COMPANY_INFO.contact.phoneDisplay}
                    </a>
                  </li>

                  <li className="flex items-center gap-3">
                    <Mail className="h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                    <a href={`mailto:${COMPANY_INFO.contact.email}`} className="reader-touch-link reader-focus-ring inline-flex min-h-10 items-center rounded-xl px-1 text-[14px] font-medium leading-6 text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400">
                      {COMPANY_INFO.contact.email}
                    </a>
                  </li>
                </ul>

                <div className="mt-5">
                  <p className="mb-2 text-[14px] text-zinc-700 dark:text-zinc-300">
                    {language === 'hi' ? '\u090f\u092a \u0921\u093e\u0909\u0928\u0932\u094b\u0921 \u0915\u0930\u0947\u0902' : 'Download App'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="reader-touch-button reader-focus-ring min-h-11 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-[14px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      Android
                    </button>
                    <button
                      type="button"
                      className="reader-touch-button reader-focus-ring min-h-11 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-[14px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      iOS
                    </button>
                  </div>
                </div>
              </div>
            </details>

            <div className="hidden md:block">
              <h3 className="mb-3 border-b border-zinc-200 pb-2 text-[1.28rem] font-semibold leading-tight tracking-tight text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
                {language === 'hi' ? '\u0938\u0902\u092a\u0930\u094d\u0915 \u0915\u0930\u0947\u0902' : 'Contact Us'}
              </h3>

              <ul className="space-y-2.5 text-zinc-600 dark:text-zinc-400">
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                  <a
                    href={COMPANY_INFO.address.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="reader-touch-link reader-focus-ring -mt-2 max-w-[26rem] rounded-xl px-1 py-2 text-[13px] leading-6 text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400 md:text-[14px]"
                    aria-label={language === 'hi' ? '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940 \u0932\u094b\u0915\u0947\u0936\u0928 Google Maps \u092e\u0947\u0902 \u0916\u094b\u0932\u0947\u0902' : 'Open Lokswami location in Google Maps'}
                  >
                    {COMPANY_INFO.address.displayAddress}
                  </a>
                </li>

                <li className="flex items-center gap-3">
                  <Phone className="h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                  <a href={COMPANY_INFO.contact.phoneHref} className="reader-touch-link reader-focus-ring inline-flex min-h-10 items-center rounded-xl px-1 text-[14px] font-medium leading-6 text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400 md:text-[15px]">
                    {COMPANY_INFO.contact.phoneDisplay}
                  </a>
                </li>

                <li className="flex items-center gap-3">
                  <Mail className="h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                  <a href={`mailto:${COMPANY_INFO.contact.email}`} className="reader-touch-link reader-focus-ring inline-flex min-h-10 items-center rounded-xl px-1 text-[14px] font-medium leading-6 text-zinc-700 hover:text-orange-600 dark:text-zinc-300 dark:hover:text-orange-400 md:text-[15px]">
                    {COMPANY_INFO.contact.email}
                  </a>
                </li>
              </ul>

              <div className="mt-5">
                <p className="mb-2 text-[14px] text-zinc-700 dark:text-zinc-300 md:text-[15px]">
                  {language === 'hi' ? '\u090f\u092a \u0921\u093e\u0909\u0928\u0932\u094b\u0921 \u0915\u0930\u0947\u0902' : 'Download App'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="reader-touch-button reader-focus-ring min-h-11 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-[14px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 md:text-[15px]"
                  >
                    Android
                  </button>
                  <button
                    type="button"
                    className="reader-touch-button reader-focus-ring min-h-11 rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2 text-[14px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 md:text-[15px]"
                  >
                    iOS
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>


        <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <p className="text-[14px] text-zinc-700 dark:text-zinc-300 md:text-[15px]">
                {`\u00A9 ${new Date().getFullYear()} ${COMPANY_INFO.name}. `}
                {language === 'hi'
                  ? '\u0938\u0930\u094d\u0935\u093e\u0927\u093f\u0915\u093e\u0930 \u0938\u0941\u0930\u0915\u094d\u0937\u093f\u0924\u0964'
                  : 'All rights reserved.'}
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 md:text-[13px]">
                {language === 'hi' ? 'Developed by ' : 'Developed by '}
                <a
                  href="https://github.com/zaidshery"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reader-touch-link reader-focus-ring inline-flex min-h-10 items-center rounded-lg font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition hover:text-orange-600 hover:decoration-orange-400 dark:text-zinc-200 dark:decoration-zinc-600 dark:hover:text-orange-400 dark:hover:decoration-orange-400"
                >
                  Zaid Shery
                </a>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {legalLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className="reader-touch-link reader-focus-ring inline-flex min-h-10 items-center rounded-lg text-[14px] leading-6 text-zinc-600 transition hover:text-orange-600 dark:text-zinc-400 dark:hover:text-orange-400 md:text-[15px]"
                >
                  {language === 'hi' ? item.hi : item.en}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}
