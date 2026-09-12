import React, { type HTMLAttributes, type ReactNode } from 'react';

export type BadgeVariant =
  | 'brand'
  | 'breaking'
  | 'neutral'
  | 'outline'
  | 'success'
  | 'warning';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  brand:
    'bg-brand-500 text-white dark:bg-brand-500 dark:text-white font-bold',
  breaking:
    'bg-breaking text-white font-black tracking-normal',
  neutral:
    'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700',
  outline:
    'bg-transparent text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700',
  success:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50',
  warning:
    'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px] leading-tight rounded-editorial-xs gap-1',
  md: 'px-2.5 py-1 text-xs leading-tight rounded-editorial-sm gap-1.5',
};

/**
 * LokSwami Design System — Badge Primitive
 * Compact tag for categories, status indicators, and editorial flags.
 */
export function Badge({
  children,
  className = '',
  variant = 'neutral',
  size = 'sm',
  icon,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center font-semibold tracking-normal select-none ${
        VARIANT_CLASSES[variant]
      } ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {icon ? <span className="shrink-0" aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}

export default Badge;
