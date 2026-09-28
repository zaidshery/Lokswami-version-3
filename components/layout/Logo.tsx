'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';

export type LogoSize = 'sm' | 'md' | 'lg' | 'headerCompact' | 'headerMobile' | 'headerDesktop';

export interface LogoSizeConfig {
  icon: number;
  wordmarkW: number;
  wordmarkH: number;
  gap: number;
  iconX: number;
  iconY: number;
  wordmarkY: number;
}

export const LOGO_SIZES: Record<LogoSize, LogoSizeConfig> = {
  sm: { icon: 38, wordmarkW: 136, wordmarkH: 28, gap: 8, iconX: 0, iconY: 3, wordmarkY: 0 },
  md: { icon: 42, wordmarkW: 168, wordmarkH: 34, gap: 10, iconX: 0, iconY: 4, wordmarkY: 0 },
  lg: { icon: 54, wordmarkW: 220, wordmarkH: 45, gap: 12, iconX: 0, iconY: 5, wordmarkY: 0 },
  headerCompact: { icon: 40, wordmarkW: 154, wordmarkH: 32, gap: 8, iconX: 0, iconY: 3, wordmarkY: 0 },
  headerMobile: { icon: 46, wordmarkW: 172, wordmarkH: 36, gap: 10, iconX: 0, iconY: 4.5, wordmarkY: 0 },
  headerDesktop: { icon: 44, wordmarkW: 208, wordmarkH: 42, gap: 10, iconX: 0, iconY: 3.5, wordmarkY: 0 },
};

export interface LogoIconProps {
  inHeaderLogo?: boolean;
  size?: LogoSize;
  variant?: 'standard';
  className?: string;
  priority?: boolean;
}

export const MOBILE_HEADER_LOGO_SRC = '/logo-3.png';

interface MobileHeaderLogoIconProps {
  className?: string;
}

/** The supplied red-tab artwork used only by the compact mobile header. */
export function MobileHeaderLogoIcon({ className = '' }: MobileHeaderLogoIconProps) {
  return (
    <span
      aria-hidden="true"
      data-logo-element="mobile-header-icon"
      className={`relative inline-flex h-12 w-[58px] shrink-0 items-center justify-center overflow-hidden ${className}`}
    >
      <Image
        src={MOBILE_HEADER_LOGO_SRC}
        alt=""
        width={90}
        height={60}
        priority
        sizes="90px"
        className="absolute left-1/2 top-1/2 block h-[60px] w-[90px] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
      />
    </span>
  );
}

/** Standalone targetable 'लो' Logo Emblem component */
export function LogoIcon({
  inHeaderLogo = false,
  size = 'md',
  className = '',
  priority,
}: LogoIconProps) {
  const sizeConfig = LOGO_SIZES[size];
  const isPriority = priority ?? (size === 'headerCompact' || size === 'headerMobile' || size === 'headerDesktop');

  return (
    <span
      data-logo-element="icon"
      className={`lokswami-logo-icon relative inline-flex shrink-0 items-center justify-center overflow-visible ${className}`}
      style={{
        transform: inHeaderLogo ? undefined : `translate(${sizeConfig.iconX}px, ${sizeConfig.iconY}px)`,
        width: inHeaderLogo ? 'var(--reader-logo-icon)' : `${sizeConfig.icon}px`,
        height: inHeaderLogo ? 'var(--reader-logo-icon)' : `${sizeConfig.icon}px`,
      }}
    >
      <Image
        src="/logo-header-cutout.png"
        alt="Lokswami Emblem"
        width={sizeConfig.icon}
        height={sizeConfig.icon}
        className="relative z-[1] block h-full w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-transform duration-300 motion-safe:group-hover/logo:scale-[1.06]"
        priority={isPriority}
        sizes="(max-width: 639px) 44px, (max-width: 1023px) 50px, 58px"
      />
    </span>
  );
}

export interface LogoWordmarkProps {
  inHeaderLogo?: boolean;
  size?: LogoSize;
  variant?: 'standard' | 'white' | 'dark';
  className?: string;
  priority?: boolean;
  /** Header-only sizing uses the real asset ratio and leaves other logo placements unchanged. */
  responsiveHeader?: boolean;
}

export const LOKSWAMI_WORDMARK = { src: '/logo-wordmark-final.png', width: 847, height: 181 } as const;

/** Standalone targetable 'लोकस्वामी' Wordmark component */
export function LogoWordmark({
  inHeaderLogo = false,
  size = 'md',
  variant = 'standard',
  className = '',
  priority,
  responsiveHeader = false,
}: LogoWordmarkProps) {
  const sizeConfig = LOGO_SIZES[size];
  const isPriority = priority ?? (size === 'headerCompact' || size === 'headerMobile' || size === 'headerDesktop');

  const maxWClass =
    size === 'headerCompact'
      ? 'max-w-[154px]'
      : size === 'headerMobile'
        ? 'max-w-[172px]'
        : '';

  return (
    <span
      data-logo-element="wordmark"
      className={`lokswami-logo-wordmark relative inline-flex shrink-0 items-center justify-center ${inHeaderLogo ? 'overflow-visible' : responsiveHeader ? 'w-[120px] min-[360px]:w-[136px] min-[390px]:w-[144px] md:w-[172px] lg:w-[208px] overflow-visible' : 'overflow-hidden'} ${className}`}
      style={{ transform: `translateY(${sizeConfig.wordmarkY}px)`, width: inHeaderLogo ? 'var(--reader-logo-wordmark)' : undefined }}
    >
      <div
        className={`relative block max-w-full ${responsiveHeader ? 'w-full' : maxWClass}`}
        style={{
          width: responsiveHeader ? '100%' : `${sizeConfig.wordmarkW}px`,
          height: responsiveHeader ? 'auto' : `${sizeConfig.wordmarkH}px`,
          maxWidth: '100%',
        }}
      >
        <Image
          src={LOKSWAMI_WORDMARK.src}
          alt="Lokswami"
          width={responsiveHeader ? LOKSWAMI_WORDMARK.width : sizeConfig.wordmarkW}
          height={responsiveHeader ? LOKSWAMI_WORDMARK.height : sizeConfig.wordmarkH}
          className={`block ${responsiveHeader ? 'h-auto' : 'h-full'} w-full object-contain ${variant === 'white'
            ? 'brightness-0 invert'
            : variant === 'dark'
              ? 'brightness-0'
              : 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:brightness-0 dark:invert'
            }`}
          priority={isPriority}
          sizes={responsiveHeader ? '(min-width: 1024px) 208px, (min-width: 768px) 172px, (min-width: 390px) 144px, (min-width: 360px) 136px, 120px' : '(max-width: 639px) 154px, (max-width: 1023px) 172px, 208px'}
        />
      </div>

      {!responsiveHeader ? <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/3 hidden w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition-all duration-700 motion-reduce:transition-none motion-safe:group-hover/logo:left-[125%] motion-safe:group-hover/logo:opacity-100 dark:via-zinc-200/35 md:block"
      /> : null}
    </span>
  );
}

export interface LogoProps {
  responsiveHeader?: boolean;
  size?: LogoSize;
  href?: string;
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  iconVariant?: 'standard';
  wordmarkVariant?: 'standard' | 'white' | 'dark';
  showIcon?: boolean;
  showWordmark?: boolean;
  priority?: boolean;
}

/** Complete Lokswami Brand Logo with separately targetable Emblem & Wordmark sub-elements */
export default function Logo({
  responsiveHeader = false,
  size = 'md',
  href,
  className = '',
  iconClassName = '',
  wordmarkClassName = '',
  iconVariant = 'standard',
  wordmarkVariant = 'standard',
  showIcon = true,
  showWordmark = true,
  priority,
}: LogoProps) {
  const reduceMotion = useReducedMotion();
  const sizeConfig = LOGO_SIZES[size];

  const logoContent = (
    <motion.div
      data-logo-root="true"
      className={`group/logo flex max-w-full shrink-0 items-center ${responsiveHeader ? '[--reader-logo-icon:28px] [--reader-logo-wordmark:88px] [--reader-logo-gap:2px] min-[360px]:[--reader-logo-icon:32px] min-[360px]:[--reader-logo-wordmark:100px] min-[360px]:[--reader-logo-gap:4px] min-[390px]:[--reader-logo-wordmark:112px] md:[--reader-logo-icon:46px] md:[--reader-logo-wordmark:172px] md:[--reader-logo-gap:10px] lg:[--reader-logo-icon:44px] lg:[--reader-logo-wordmark:208px]' : ''} ${className}`}
      whileHover={reduceMotion || responsiveHeader ? undefined : { scale: 1.012, y: -1 }}
      whileTap={responsiveHeader ? undefined : { scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <motion.div
        className="flex items-center"
        style={{ gap: responsiveHeader ? 'var(--reader-logo-gap)' : `${sizeConfig.gap}px` }}
        animate={reduceMotion || responsiveHeader ? undefined : { y: [0, -1, 0] }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 5.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.25, delay: 0.7 }
        }
      >
        {showIcon ? (
          <motion.div
            initial={reduceMotion || responsiveHeader ? false : { opacity: 0, scale: 0.9, y: 2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <LogoIcon size={size} variant={iconVariant} className={iconClassName} priority={priority} inHeaderLogo={responsiveHeader} />
          </motion.div>
        ) : null}

        {showWordmark ? (
          <motion.div
            initial={reduceMotion || responsiveHeader ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: reduceMotion ? 0.01 : 0.42,
              ease: [0.22, 1, 0.36, 1],
              delay: reduceMotion ? 0 : 0.08,
            }}
          >
            <LogoWordmark size={size} variant={wordmarkVariant} className={wordmarkClassName} priority={priority} responsiveHeader={responsiveHeader} inHeaderLogo={responsiveHeader} />
          </motion.div>
        ) : null}
      </motion.div>
    </motion.div>
  );

  return href ? (
    <Link href={href} className="inline-flex max-w-full items-center align-middle">
      {logoContent}
    </Link>
  ) : (
    logoContent
  );
}
