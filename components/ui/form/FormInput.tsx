'use client';

import React, { forwardRef } from 'react';
import { AlertCircle } from 'lucide-react';

export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(function FormInput(
  {
    label,
    error,
    helperText,
    leftIcon,
    rightIcon,
    className = '',
    id,
    disabled,
    ...props
  },
  ref
) {
  const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {leftIcon && (
          <div className="pointer-events-none absolute left-3 flex items-center text-zinc-400 dark:text-zinc-500">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          className={`h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-zinc-900 transition placeholder:text-zinc-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:disabled:bg-zinc-950 ${
            leftIcon ? 'pl-10' : ''
          } ${rightIcon ? 'pr-10' : ''} ${
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
              : 'border-zinc-200 hover:border-zinc-300 focus:border-red-600 focus:ring-red-500/15 dark:border-zinc-800 dark:hover:border-zinc-700 dark:focus:border-red-500'
          } ${className}`}
          {...props}
        />

        {rightIcon && (
          <div className="absolute right-3 flex items-center text-zinc-400 dark:text-zinc-500">
            {rightIcon}
          </div>
        )}
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </p>
      ) : helperText ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{helperText}</p>
      ) : null}
    </div>
  );
});

export default FormInput;
