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
  size?: LogoSize;
  variant?: 'standard';
  className?: string;
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
  size = 'md',
  variant: _variant = 'standard',
  className = '',
}: LogoIconProps) {
  const sizeConfig = LOGO_SIZES[size];

  return (
    <span
      data-logo-element="icon"
      className={`lokswami-logo-icon relative inline-flex shrink-0 items-center justify-center overflow-visible ${className}`}
      style={{
        transform: `translate(${sizeConfig.iconX}px, ${sizeConfig.iconY}px)`,
        width: `${sizeConfig.icon}px`,
        height: `${sizeConfig.icon}px`,
      }}
    >
      <Image
        src="/logo-header-cutout.png"
        alt="Lokswami Emblem"
        width={sizeConfig.icon}
        height={sizeConfig.icon}
        className="relative z-[1] block h-full w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-transform duration-300 motion-safe:group-hover/logo:scale-[1.06]"
        priority={size === 'headerCompact' || size === 'headerMobile' || size === 'headerDesktop'}
        sizes="(max-width: 639px) 44px, (max-width: 1023px) 50px, 58px"
      />
    </span>
  );
}

export interface LogoWordmarkProps {
  size?: LogoSize;
  variant?: 'standard' | 'white' | 'dark';
  className?: string;
}

/** Standalone targetable 'लोकस्वामी' Wordmark component */
export function LogoWordmark({
  size = 'md',
  variant = 'standard',
  className = '',
}: LogoWordmarkProps) {
  const sizeConfig = LOGO_SIZES[size];

  const maxWClass =
    size === 'headerCompact'
      ? 'max-w-[154px]'
      : size === 'headerMobile'
        ? 'max-w-[172px]'
        : '';

  return (
    <span
      data-logo-element="wordmark"
      className={`lokswami-logo-wordmark relative inline-flex items-center justify-center overflow-hidden ${className}`}
      style={{ transform: `translateY(${sizeConfig.wordmarkY}px)` }}
    >
      <div
        className={`relative block max-w-full ${maxWClass}`}
        style={{
          width: `${sizeConfig.wordmarkW}px`,
          height: `${sizeConfig.wordmarkH}px`,
          maxWidth: '100%',
        }}
      >
        <Image
          src="/logo-wordmark-final.png"
          alt="Lokswami"
          width={sizeConfig.wordmarkW}
          height={sizeConfig.wordmarkH}
          className={`block h-full w-full object-contain ${variant === 'white'
            ? 'brightness-0 invert'
            : variant === 'dark'
              ? 'brightness-0'
              : 'drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)] dark:brightness-0 dark:invert'
            }`}
          priority={size === 'headerCompact' || size === 'headerMobile' || size === 'headerDesktop'}
          sizes="(max-width: 639px) 154px, (max-width: 1023px) 172px, 208px"
        />
      </div>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/3 hidden w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition-all duration-700 motion-reduce:transition-none motion-safe:group-hover/logo:left-[125%] motion-safe:group-hover/logo:opacity-100 dark:via-zinc-200/35 md:block"
      />
    </span>
  );
}

export interface LogoProps {
  size?: LogoSize;
  href?: string;
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  iconVariant?: 'standard';
  wordmarkVariant?: 'standard' | 'white' | 'dark';
  showIcon?: boolean;
  showWordmark?: boolean;
}

/** Complete Lokswami Brand Logo with separately targetable Emblem & Wordmark sub-elements */
export default function Logo({
  size = 'md',
  href,
  className = '',
  iconClassName = '',
  wordmarkClassName = '',
  iconVariant = 'standard',
  wordmarkVariant = 'standard',
  showIcon = true,
  showWordmark = true,
}: LogoProps) {
  const reduceMotion = useReducedMotion();
  const sizeConfig = LOGO_SIZES[size];

  const logoContent = (
    <motion.div
      data-logo-root="true"
      className={`group/logo flex max-w-full shrink-0 items-center ${className}`}
      whileHover={reduceMotion ? undefined : { scale: 1.012, y: -1 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <motion.div
        className="flex items-center"
        style={{ gap: `${sizeConfig.gap}px` }}
        animate={reduceMotion ? undefined : { y: [0, -1, 0] }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 5.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.25, delay: 0.7 }
        }
      >
        {showIcon ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.9, y: 2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <LogoIcon size={size} variant={iconVariant} className={iconClassName} />
          </motion.div>
        ) : null}

        {showWordmark ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: reduceMotion ? 0.01 : 0.42,
              ease: [0.22, 1, 0.36, 1],
              delay: reduceMotion ? 0 : 0.08,
            }}
          >
            <LogoWordmark size={size} variant={wordmarkVariant} className={wordmarkClassName} />
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
