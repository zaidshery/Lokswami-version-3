'use client';

import React, { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FormSelectOption {
  value: string;
  label: string;
}

export interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: FormSelectOption[];
  error?: string;
  helperText?: string;
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(function FormSelect(
  { label, options, error, helperText, className = '', id, disabled, ...props },
  ref
) {
  const selectId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
        >
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          className={`h-11 w-full appearance-none rounded-xl border bg-white pl-3.5 pr-10 text-sm text-zinc-900 transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-950 ${
            error
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
              : 'border-zinc-200 hover:border-zinc-300 focus:border-red-600 focus:ring-red-500/15 dark:border-zinc-800 dark:hover:border-zinc-700 dark:focus:border-red-500'
          } ${className}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="pointer-events-none absolute right-3 flex items-center text-zinc-400 dark:text-zinc-500">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>

      {error ? (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{helperText}</p>
      ) : null}
    </div>
  );
});

export default FormSelect;
