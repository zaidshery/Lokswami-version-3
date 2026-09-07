'use client';

import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import FormInput, { type FormInputProps } from './FormInput';

export interface PasswordInputProps extends Omit<FormInputProps, 'type' | 'leftIcon' | 'rightIcon'> {
  showStrength?: boolean;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { showStrength = false, value, onChange, ...props },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);

  const pwd = typeof value === 'string' ? value : '';
  const hasMinLength = pwd.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(pwd);
  const hasDigit = /\d/.test(pwd);
  const score = [hasMinLength, hasLetter, hasDigit].filter(Boolean).length;

  return (
    <div className="w-full space-y-1">
      <FormInput
        ref={ref}
        type={showPassword ? 'text' : 'password'}
        leftIcon={<Lock className="h-4 w-4" />}
        value={value}
        onChange={onChange}
        rightIcon={
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="p-1 text-zinc-400 hover:text-zinc-600 focus:outline-none dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        }
        {...props}
      />

      {showStrength && pwd.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="flex h-1 w-full gap-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full flex-1 transition-all ${
                score >= 1 ? 'bg-red-500' : 'bg-transparent'
              }`}
            />
            <div
              className={`h-full flex-1 transition-all ${
                score >= 2 ? 'bg-amber-500' : 'bg-transparent'
              }`}
            />
            <div
              className={`h-full flex-1 transition-all ${
                score >= 3 ? 'bg-emerald-500' : 'bg-transparent'
              }`}
            />
          </div>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {score === 3
              ? 'Strong password'
              : score === 2
              ? 'Moderate password'
              : 'Weak (use at least 8 characters with letters and numbers)'}
          </p>
        </div>
      )}
    </div>
  );
});

export default PasswordInput;
