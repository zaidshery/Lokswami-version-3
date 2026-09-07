'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Loader2, MessageSquare, Sparkles } from 'lucide-react';
import Modal from './Modal';
import FormInput from '../form/FormInput';
import PasswordInput from '../form/PasswordInput';
import WhatsAppPhoneInput from '../form/WhatsAppPhoneInput';
import FormSwitch from '../form/FormSwitch';
import { isValidWhatsAppNumber, normalizeWhatsAppNumber } from '@/lib/utils/phone';

export interface QuickAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: 'signin' | 'register';
  title?: string;
  subtitle?: string;
}

export function QuickAuthModal({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'signin',
  title = 'Lokswami News',
  subtitle = 'Sign in or create an account to unlock saved articles, daily e-paper and personalization.',
}: QuickAuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [password, setPassword] = useState('');
  const [optInDailyEpaper, setOptInDailyEpaper] = useState(true);
  const [useWhatsApp, setUseWhatsApp] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'register') {
        // Validation
        if (!name.trim()) {
          setError('Please enter your full name.');
          setIsLoading(false);
          return;
        }

        const phone = useWhatsApp ? normalizeWhatsAppNumber(whatsappNumber) : null;
        if (useWhatsApp && !phone) {
          setError('Please enter a valid 10-digit WhatsApp number.');
          setIsLoading(false);
          return;
        }

        if (!useWhatsApp && !identifier.trim()) {
          setError('Please enter your email address.');
          setIsLoading(false);
          return;
        }

        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setIsLoading(false);
          return;
        }

        // Call registration API
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: name.trim(),
            email: useWhatsApp ? undefined : identifier.trim(),
            whatsappNumber: phone || undefined,
            password,
            optInDailyEpaper,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data.error || 'Registration failed. Please check your details.');
          setIsLoading(false);
          return;
        }

        // Auto login after registration
        const loginIdentifier = phone || identifier.trim();
        const loginRes = await signIn('credentials', {
          redirect: false,
          loginId: loginIdentifier,
          password,
        });

        if (loginRes?.error) {
          setMode('signin');
          setError('Account created! Please sign in with your credentials.');
          setIsLoading(false);
          return;
        }

        onSuccess?.();
        onClose();
      } else {
        // Sign In Mode
        const loginIdentifier = useWhatsApp ? normalizeWhatsAppNumber(whatsappNumber) || whatsappNumber : identifier;
        if (!loginIdentifier) {
          setError(useWhatsApp ? 'Please enter your WhatsApp number.' : 'Please enter your email or login ID.');
          setIsLoading(false);
          return;
        }

        if (!password) {
          setError('Please enter your password.');
          setIsLoading(false);
          return;
        }

        const loginRes = await signIn('credentials', {
          redirect: false,
          loginId: loginIdentifier,
          password,
        });

        if (loginRes?.error) {
          setError('Invalid login credentials. Please try again.');
          setIsLoading(false);
          return;
        }

        onSuccess?.();
        onClose();
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    void signIn('google', { callbackUrl: window.location.href });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="space-y-4">
        {/* Header Branding */}
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{title}</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
        </div>

        {/* Tab Switcher: Sign In vs Register */}
        <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              setError('');
            }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              mode === 'signin'
                ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              mode === 'register'
                ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Google One-Tap Login */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 shadow-xs transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 10.2v3.9h5.5c-.24 1.33-1.54 3.9-5.5 3.9-3.31 0-6-2.76-6-6.2S8.69 5.6 12 5.6c1.88 0 3.13.8 3.85 1.48l2.63-2.58C16.87 2.97 14.69 2 12 2 6.93 2 2.82 6.48 2.82 12S6.93 22 12 22c5.19 0 8.61-3.65 8.61-8.8 0-.59-.06-1.02-.14-1.4H12Z"
            />
            <path
              fill="#34A853"
              d="M3.8 7.23 7 9.58C7.87 7.09 9.76 5.6 12 5.6c1.88 0 3.13.8 3.85 1.48l2.63-2.58C16.87 2.97 14.69 2 12 2 8.4 2 5.27 4.05 3.8 7.23Z"
            />
            <path
              fill="#FBBC05"
              d="M12 22c2.64 0 4.86-.87 6.48-2.37l-3-2.45c-.83.6-1.9 1.02-3.48 1.02-2.22 0-4.1-1.48-5-3.54l-3.1 2.39C5.34 19.85 8.45 22 12 22Z"
            />
            <path
              fill="#4285F4"
              d="M20.61 13.2c0-.6-.05-1.16-.14-1.69H12v3.9h4.84c-.21 1.08-.82 1.99-1.84 2.67l3 2.45c1.75-1.63 2.61-4.03 2.61-7.33Z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          <span className="absolute bg-white px-2 text-[11px] font-medium text-zinc-400 dark:bg-zinc-900">
            or continue with credentials
          </span>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Mode switch for WhatsApp vs Email */}
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-500 dark:text-zinc-400">Sign in with:</span>
            <button
              type="button"
              onClick={() => setUseWhatsApp((prev) => !prev)}
              className="font-semibold text-red-600 underline hover:text-red-500 dark:text-red-400"
            >
              {useWhatsApp ? 'Use Email instead' : 'Use WhatsApp number'}
            </button>
          </div>

          {mode === 'register' && (
            <FormInput
              label="Full Name"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}

          {useWhatsApp ? (
            <WhatsAppPhoneInput
              label="WhatsApp Number"
              value={whatsappNumber}
              onChange={(val) => setWhatsappNumber(val)}
              required
            />
          ) : (
            <FormInput
              type="email"
              label="Email Address"
              placeholder="name@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          )}

          <PasswordInput
            label="Password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showStrength={mode === 'register'}
            required
          />

          {mode === 'register' && (
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950">
              <FormSwitch
                checked={optInDailyEpaper}
                onChange={setOptInDailyEpaper}
                label="Daily E-Paper on WhatsApp"
                description="Get morning digital newspaper directly on your WhatsApp daily."
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>
              {isLoading
                ? mode === 'register'
                  ? 'Creating Account...'
                  : 'Signing in...'
                : mode === 'register'
                ? 'Create Lokswami Account'
                : 'Sign In'}
            </span>
          </button>
        </form>
      </div>
    </Modal>
  );
}

export default QuickAuthModal;
