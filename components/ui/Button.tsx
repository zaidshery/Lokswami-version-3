import React, { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'breaking';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 text-white shadow-editorial hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-600 dark:active:bg-brand-700 border border-transparent',
  secondary:
    'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 active:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:active:bg-zinc-600 border border-zinc-200/80 dark:border-zinc-700',
  outline:
    'border border-zinc-300 bg-transparent text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900/60 dark:active:bg-zinc-800',
  ghost:
    'border border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:active:bg-zinc-700',
  destructive:
    'bg-red-700 text-white shadow-editorial hover:bg-red-800 active:bg-red-900 dark:bg-red-800 dark:hover:bg-red-700 border border-transparent',
  breaking:
    'bg-breaking text-white shadow-editorial hover:bg-red-700 active:bg-red-800 font-bold tracking-normal border border-transparent',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-[44px] min-w-[44px] px-3 py-1.5 text-xs rounded-editorial-sm gap-1.5',
  md: 'min-h-[44px] min-w-[44px] px-4 py-2 text-sm rounded-editorial-md gap-2',
  lg: 'min-h-[48px] min-w-[48px] px-6 py-2.5 text-base rounded-editorial-lg gap-2.5',
};

/**
 * LokSwami Design System — Unified Button Primitive
 * Accessible, keyboard-navigable, touch-target compliant, and theme-adaptive.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled = false,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading ? 'true' : undefined}
        aria-disabled={isDisabled ? 'true' : undefined}
        className={`editorial-focus-ring inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 select-none ${
          VARIANT_CLASSES[variant]
        } ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none shrink-0" aria-hidden="true" />
            <span>{loadingText || children}</span>
          </>
        ) : (
          <>
            {leftIcon ? <span className="shrink-0" aria-hidden="true">{leftIcon}</span> : null}
            <span>{children}</span>
            {rightIcon ? <span className="shrink-0" aria-hidden="true">{rightIcon}</span> : null}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
