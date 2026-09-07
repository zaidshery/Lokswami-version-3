'use client';

import React from 'react';
import { motion } from 'framer-motion';

export interface FormSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  icon?: React.ReactNode;
}

export function FormSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  icon,
}: FormSwitchProps) {
  const switchId = id || (label ? `switch-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      {(label || description) && (
        <div className="min-w-0 flex-1">
          {label && (
            <label
              htmlFor={switchId}
              className={`flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              {icon}
              <span>{label}</span>
            </label>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
          )}
        </div>
      )}

      <button
        type="button"
        id={switchId}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-red-600' : 'bg-zinc-200 dark:bg-zinc-700'
        }`}
      >
        <span className="sr-only">{label || 'Toggle switch'}</span>
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default FormSwitch;
