'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  MessageSquare,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import { signIn, signOut, useSession } from 'next-auth/react';
import Logo from '@/components/layout/Logo';
import { armAdminSigninBanner } from '@/lib/auth/adminBanner';
import { COMPANY_INFO } from '@/lib/constants/company';
import { normalizeRedirectPath } from '@/lib/auth/redirect';
import { isAdminRole } from '@/lib/auth/roles';
import { useAppStore } from '@/lib/store/appStore';
import FormInput from '@/components/ui/form/FormInput';
import PasswordInput from '@/components/ui/form/PasswordInput';
import WhatsAppPhoneInput from '@/components/ui/form/WhatsAppPhoneInput';
import FormSwitch from '@/components/ui/form/FormSwitch';
import { normalizeWhatsAppNumber } from '@/lib/utils/phone';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  inactive: 'Your account is inactive. Contact an administrator.',
  OAuthError: 'Google sign-in failed. Please try again.',
  OAuthSignin: 'Google sign-in failed. Please try again.',
  OAuthCallback: 'Google sign-in failed. Please try again.',
  CredentialsSignin: 'Invalid login ID, email, or password.',
  rate_limited: 'Too many failed sign-in attempts. Please wait 15 minutes, then try again.',
  no_admin_access: 'This account cannot access the admin panel.',
  Default: 'Sign-in failed. Please try again.',
};

const POST_AUTH_QUERY_PARAM = 'postAuth';
const ADMIN_BANNER_QUERY_PARAM = 'adminBanner';
const READER_FEATURES = [
  'Daily E-Paper on WhatsApp',
  'Save favorite articles',
  'AI news assistant',
  'Hindi & English personalization',
];

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
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
  );
}

function resolvePostSignInRedirect(value: string | null): string | null {
  const next = (value || '').trim();
  if (!next) {
    return null;
  }

  const normalizedPath = normalizeRedirectPath(next, '');
  if (normalizedPath) {
    if (normalizedPath === '/signin' || normalizedPath === '/login') {
      return '/main';
    }

    if (normalizedPath.startsWith('/signin?') || normalizedPath.startsWith('/login?')) {
      const nestedParams = new URLSearchParams(normalizedPath.split('?')[1] || '');
      return (
        resolvePostSignInRedirect(nestedParams.get('redirect')) ||
        resolvePostSignInRedirect(nestedParams.get('callbackUrl')) ||
        '/main'
      );
    }

    return normalizedPath;
  }

  if (!/^https?:\/\//i.test(next) || typeof window === 'undefined') {
    return null;
  }

  try {
    const parsedUrl = new URL(next);
    if (parsedUrl.origin !== window.location.origin) {
      return null;
    }

    return resolvePostSignInRedirect(`${parsedUrl.pathname}${parsedUrl.search}`);
  } catch {
    return null;
  }
}

function resolveAuthError(errorKey: string | null): string {
  if (!errorKey) {
    return '';
  }

  return AUTH_ERROR_MESSAGES[errorKey] || AUTH_ERROR_MESSAGES.Default;
}

function resolveCaughtAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/too many|429|try again in/i.test(message)) {
    return AUTH_ERROR_MESSAGES.rate_limited;
  }
  if (/csrf|clientfetcherror|failed to fetch|network/i.test(message)) {
    return 'Sign-in is temporarily unavailable. Please wait a moment and try again.';
  }
  return AUTH_ERROR_MESSAGES.Default;
}

function isAdminOnlyTarget(path: string) {
  return path === '/admin' || path.startsWith('/admin/');
}

function buildPostAuthCallbackUrl(redirectTo: string, shouldShowAdminBanner: boolean) {
  const params = new URLSearchParams({
    [POST_AUTH_QUERY_PARAM]: '1',
    redirect: redirectTo,
  });

  if (shouldShowAdminBanner) {
    params.set(ADMIN_BANNER_QUERY_PARAM, '1');
  }

  return `/signin?${params.toString()}`;
}

function buildSignInRoute(redirectTo: string) {
  const params = new URLSearchParams();
  if (redirectTo) {
    params.set('redirect', redirectTo);
  }

  const query = params.toString();
  return query ? `/signin?${query}` : '/signin';
}

const formContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const formItemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.28,
      ease: 'easeOut',
    },
  },
};

function ThemeToggleButton({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useAppStore();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const resolvedTheme = isHydrated ? theme : 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 ${className}`}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function FeaturePill({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-sm text-zinc-300 ${className}`}
    >
      {children}
    </div>
  );
}

interface AuthFormContentProps {
  errorMessage: string;
  isSigningIn: boolean;
  isCredentialSigningIn: boolean;
  showGoogleSignIn: boolean;
  showAdminCredentialsLogin: boolean;
  authPortalTab: 'reader' | 'staff';
  onAuthPortalTabChange: (tab: 'reader' | 'staff') => void;
  readerMode: 'signin' | 'register';
  onReaderModeChange: (mode: 'signin' | 'register') => void;
  readerFullName: string;
  onReaderFullNameChange: (val: string) => void;
  readerIdentifier: string;
  onReaderIdentifierChange: (val: string) => void;
  readerUseWhatsApp: boolean;
  onReaderUseWhatsAppChange: (val: boolean) => void;
  readerPassword: string;
  onReaderPasswordChange: (val: string) => void;
  readerOptInDailyEpaper: boolean;
  onReaderOptInDailyEpaperChange: (val: boolean) => void;
  onReaderSubmit: (e: React.FormEvent) => Promise<void>;
  adminLoginId: string;
  adminPassword: string;
  isAdminPasswordVisible: boolean;
  onAdminLoginIdChange: (value: string) => void;
  onAdminPasswordChange: (value: string) => void;
  onToggleAdminPasswordVisibility: () => void;
  onGoogleSignIn: () => Promise<void>;
  onAdminCredentialsSignIn: () => Promise<void>;
}

function AuthFormContent({
  errorMessage,
  isSigningIn,
  isCredentialSigningIn,
  showGoogleSignIn,
  showAdminCredentialsLogin,
  authPortalTab,
  onAuthPortalTabChange,
  readerMode,
  onReaderModeChange,
  readerFullName,
  onReaderFullNameChange,
  readerIdentifier,
  onReaderIdentifierChange,
  readerUseWhatsApp,
  onReaderUseWhatsAppChange,
  readerPassword,
  onReaderPasswordChange,
  readerOptInDailyEpaper,
  onReaderOptInDailyEpaperChange,
  onReaderSubmit,
  adminLoginId,
  adminPassword,
  isAdminPasswordVisible,
  onAdminLoginIdChange,
  onAdminPasswordChange,
  onToggleAdminPasswordVisibility,
  onGoogleSignIn,
  onAdminCredentialsSignIn,
}: AuthFormContentProps) {
  const forgotPasswordHref = `mailto:${COMPANY_INFO.contact.email}?subject=${encodeURIComponent(
    'Lokswami staff password help'
  )}&body=${encodeURIComponent(
    `Hello Lokswami team,\n\nI need help accessing the admin account.${
      adminLoginId.trim() ? `\n\nAdmin ID or email: ${adminLoginId.trim()}` : ''
    }\n\nPlease assist me with password reset or login support.\n`
  )}`;

  return (
    <motion.div
      variants={formContainerVariants}
      initial="hidden"
      animate="show"
      className="w-full"
    >
      {/* Title */}
      <motion.div variants={formItemVariants}>
        <h1 className="text-center text-2xl font-black text-zinc-900 dark:text-zinc-100">
          {authPortalTab === 'staff' ? 'Newsroom Staff Sign In' : 'Welcome to Lokswami'}
        </h1>
        <p className="mb-5 mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {authPortalTab === 'staff'
            ? 'Sign in with your editorial credentials to access the newsroom desk.'
            : 'Access digital e-paper, save stories, and customize your news experience.'}
        </p>
      </motion.div>

      {/* Portal Tab Switcher: Reader vs Staff */}
      <motion.div variants={formItemVariants} className="mb-4">
        <div className="flex rounded-2xl bg-zinc-100 p-1.5 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => onAuthPortalTabChange('reader')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition ${
              authPortalTab === 'reader'
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Reader & Subscriber</span>
          </button>
          <button
            type="button"
            onClick={() => onAuthPortalTabChange('staff')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition ${
              authPortalTab === 'staff'
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Newsroom Team</span>
          </button>
        </div>
      </motion.div>

      {/* Error Alert */}
      {errorMessage ? (
        <motion.div
          variants={formItemVariants}
          className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
          <span>{errorMessage}</span>
        </motion.div>
      ) : null}

      {/* Reader Mode Content */}
      {authPortalTab === 'reader' ? (
        <div className="space-y-4">
          {/* Sub-toggle: Sign In vs Create Account */}
          <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => onReaderModeChange('signin')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                readerMode === 'signin'
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => onReaderModeChange('register')}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                readerMode === 'register'
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Google One-Tap */}
          {showGoogleSignIn && (
            <motion.div variants={formItemVariants}>
              <button
                type="button"
                onClick={() => void onGoogleSignIn()}
                disabled={isSigningIn || isCredentialSigningIn}
                className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 shadow-xs transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleGlyph />}
                <span>{isSigningIn ? 'Redirecting to Google...' : 'Continue with Google'}</span>
              </button>
            </motion.div>
          )}

          <div className="relative flex items-center justify-center">
            <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            <span className="absolute bg-white px-2 text-[11px] font-medium text-zinc-400 dark:bg-zinc-900">
              or use phone / email
            </span>
          </div>

          {/* Reader Form */}
          <form onSubmit={onReaderSubmit} className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-zinc-500 dark:text-zinc-400">Account identifier:</span>
              <button
                type="button"
                onClick={() => onReaderUseWhatsAppChange(!readerUseWhatsApp)}
                className="font-semibold text-red-600 underline hover:text-red-500 dark:text-red-400"
              >
                {readerUseWhatsApp ? 'Use Email instead' : 'Use WhatsApp number'}
              </button>
            </div>

            {readerMode === 'register' && (
              <FormInput
                label="Full Name"
                placeholder="e.g. Rahul Sharma"
                value={readerFullName}
                onChange={(e) => onReaderFullNameChange(e.target.value)}
                required
              />
            )}

            {readerUseWhatsApp ? (
              <WhatsAppPhoneInput
                label="WhatsApp Number"
                value={readerIdentifier}
                onChange={onReaderIdentifierChange}
                placeholder="+91 98765 43210"
                required
              />
            ) : (
              <FormInput
                type="email"
                label="Email Address"
                placeholder="name@example.com"
                value={readerIdentifier}
                onChange={(e) => onReaderIdentifierChange(e.target.value)}
                required
              />
            )}

            <PasswordInput
              label="Password"
              placeholder="••••••••"
              value={readerPassword}
              onChange={(e) => onReaderPasswordChange(e.target.value)}
              showStrength={readerMode === 'register'}
              required
            />

            {readerMode === 'register' && (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950">
                <FormSwitch
                  checked={readerOptInDailyEpaper}
                  onChange={onReaderOptInDailyEpaperChange}
                  label="Daily E-Paper on WhatsApp"
                  description="Get morning digital newspaper directly on your WhatsApp daily."
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isCredentialSigningIn}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
            >
              {isCredentialSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>
                {isCredentialSigningIn
                  ? readerMode === 'register'
                    ? 'Creating Account...'
                    : 'Signing in...'
                  : readerMode === 'register'
                  ? 'Create Reader Account'
                  : 'Sign In to Lokswami'}
              </span>
            </button>
          </form>
        </div>
      ) : (
        /* Staff Mode Content */
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Staff Login ID or Email
                </span>
                <input
                  type="text"
                  value={adminLoginId}
                  onChange={(event) => onAdminLoginIdChange(event.target.value)}
                  autoComplete="username"
                  className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  placeholder="editor.id or staff@lokswami.in"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Password
                </span>
                <div className="relative">
                  <input
                    type={isAdminPasswordVisible ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(event) => onAdminPasswordChange(event.target.value)}
                    autoComplete="current-password"
                    className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 pr-12 text-sm text-zinc-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    placeholder="Enter staff password"
                  />
                  <button
                    type="button"
                    onClick={onToggleAdminPasswordVisibility}
                    className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                    aria-label={isAdminPasswordVisible ? 'Hide password' : 'Show password'}
                  >
                    {isAdminPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              <button
                type="button"
                onClick={() => void onAdminCredentialsSignIn()}
                disabled={isCredentialSigningIn || isSigningIn}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
              >
                {isCredentialSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>{isCredentialSigningIn ? 'Signing in...' : 'Sign in to Newsroom'}</span>
              </button>

              <div className="flex items-center justify-between gap-3 text-xs">
                <a
                  href={forgotPasswordHref}
                  className="font-medium text-red-600 transition hover:text-red-500 dark:text-red-400"
                >
                  Forgot password?
                </a>
                <Link
                  href="/main/contact"
                  className="text-zinc-500 underline transition hover:text-zinc-700 dark:text-zinc-400"
                >
                  Contact support
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guest Link */}
      <motion.div variants={formItemVariants} className="mt-4">
        <Link
          href="/main"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl border-2 border-red-600 bg-transparent px-4 text-sm font-semibold text-red-600 transition hover:bg-red-600 hover:text-white"
        >
          Continue as guest
        </Link>
      </motion.div>

      <motion.p variants={formItemVariants} className="mt-6 text-center text-xs text-zinc-400">
        By signing in you agree to the{' '}
        <Link href="/main/privacy" className="text-zinc-600 underline dark:text-zinc-300">
          Privacy Policy
        </Link>
        .
      </motion.p>
    </motion.div>
  );
}

function AuthenticatedNotice({
  errorMessage,
  primaryHref,
  primaryLabel,
  onSwitchAccount,
  isSwitchingAccount,
  name,
  email,
}: {
  errorMessage: string;
  primaryHref: string;
  primaryLabel: string;
  onSwitchAccount: () => Promise<void>;
  isSwitchingAccount: boolean;
  name: string;
  email: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-600/30 dark:bg-amber-500/10 dark:text-amber-100">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
          Signed in account
        </p>
        <p className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">{name}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{email}</p>
        <p className="mt-3">{errorMessage}</p>
      </div>

      <Link
        href={primaryHref}
        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
      >
        {primaryLabel}
      </Link>

      <button
        type="button"
        onClick={() => void onSwitchAccount()}
        disabled={isSwitchingAccount}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {isSwitchingAccount ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="h-4 w-4" />
        )}
        <span>{isSwitchingAccount ? 'Switching...' : 'Switch Account'}</span>
      </button>
    </div>
  );
}

function SignInPageContent({
  adminCredentialsEnabled,
  adminGoogleEnabled,
}: {
  adminCredentialsEnabled: boolean;
  adminGoogleEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCredentialSigningIn, setIsCredentialSigningIn] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Portal State
  const redirectParam = searchParams.get('redirect');
  const callbackUrlParam = searchParams.get('callbackUrl');
  const errorKey = searchParams.get('error');
  const isPostAuth = searchParams.get(POST_AUTH_QUERY_PARAM) === '1';
  const shouldShowAdminBanner = searchParams.get(ADMIN_BANNER_QUERY_PARAM) === '1';

  const redirectTo = useMemo(
    () =>
      resolvePostSignInRedirect(redirectParam) ||
      resolvePostSignInRedirect(callbackUrlParam) ||
      '/main',
    [callbackUrlParam, redirectParam]
  );
  const isAdminTarget = isAdminOnlyTarget(redirectTo);

  const [authPortalTab, setAuthPortalTab] = useState<'reader' | 'staff'>(
    isAdminTarget ? 'staff' : 'reader'
  );
  const [readerMode, setReaderMode] = useState<'signin' | 'register'>('signin');
  const [readerFullName, setReaderFullName] = useState('');
  const [readerIdentifier, setReaderIdentifier] = useState('');
  const [readerUseWhatsApp, setReaderUseWhatsApp] = useState(true);
  const [readerPassword, setReaderPassword] = useState('');
  const [readerOptInDailyEpaper, setReaderOptInDailyEpaper] = useState(true);

  // Staff credentials state
  const [adminLoginId, setAdminLoginId] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminPasswordVisible, setIsAdminPasswordVisible] = useState(false);

  const hasHandledPostAuthMount = useRef(false);
  const hasHandledSessionRedirect = useRef(false);

  const showAdminCredentialsLogin = adminCredentialsEnabled;
  const showGoogleSignIn = !isAdminTarget || adminGoogleEnabled;
  const isAdminSession =
    isAdminRole(session?.user?.role) && session?.user?.isActive !== false;
  const callbackUrl = useMemo(
    () =>
      buildPostAuthCallbackUrl(redirectTo, !redirectParam && !callbackUrlParam),
    [callbackUrlParam, redirectParam, redirectTo]
  );

  useEffect(() => {
    if (!isPostAuth || hasHandledPostAuthMount.current) {
      return;
    }

    hasHandledPostAuthMount.current = true;

    if (shouldShowAdminBanner) {
      armAdminSigninBanner();
    }

    router.replace(redirectTo);
    router.refresh();
  }, [isPostAuth, redirectTo, router, shouldShowAdminBanner]);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (status === 'unauthenticated') {
      if (!isPostAuth) {
        hasHandledSessionRedirect.current = false;
      }
      return;
    }

    if (errorKey === 'inactive' || errorKey === 'no_admin_access') {
      return;
    }

    if (hasHandledSessionRedirect.current) {
      return;
    }

    hasHandledSessionRedirect.current = true;

    if (isAdminSession && isAdminTarget) {
      router.replace('/admin');
      router.refresh();
      return;
    }

    if (isAdminTarget) {
      router.replace('/signin?error=no_admin_access');
      router.refresh();
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }, [errorKey, isAdminSession, isAdminTarget, isPostAuth, redirectTo, router, status]);

  useEffect(() => {
    if (status === 'authenticated' && (errorKey === 'inactive' || errorKey === 'no_admin_access')) {
      setErrorMessage(resolveAuthError(errorKey));
      return;
    }

    if (status === 'authenticated') {
      return;
    }

    setErrorMessage(resolveAuthError(errorKey));
  }, [errorKey, status]);

  async function handleGoogleSignIn(): Promise<void> {
    setErrorMessage('');
    setIsSigningIn(true);

    try {
      const result = await signIn('google', {
        redirect: false,
        redirectTo: callbackUrl,
      });

      if (result?.error) {
        setErrorMessage(resolveAuthError(result.code || result.error));
        setIsSigningIn(false);
        return;
      }

      if (result?.url) {
        window.location.assign(result.url);
        return;
      }

      setErrorMessage(AUTH_ERROR_MESSAGES.Default);
      setIsSigningIn(false);
    } catch (error) {
      setErrorMessage(resolveCaughtAuthError(error));
      setIsSigningIn(false);
    }
  }

  async function handleReaderSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setErrorMessage('');

    if (readerMode === 'register') {
      if (!readerFullName.trim()) {
        setErrorMessage('Please enter your full name.');
        return;
      }

      const phone = readerUseWhatsApp ? normalizeWhatsAppNumber(readerIdentifier) : null;
      if (readerUseWhatsApp && !phone) {
        setErrorMessage('Please enter a valid 10-digit WhatsApp number.');
        return;
      }

      if (!readerUseWhatsApp && !readerIdentifier.trim()) {
        setErrorMessage('Please enter your email address.');
        return;
      }

      if (readerPassword.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return;
      }

      setIsCredentialSigningIn(true);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: readerFullName.trim(),
            email: readerUseWhatsApp ? undefined : readerIdentifier.trim(),
            whatsappNumber: phone || undefined,
            password: readerPassword,
            optInDailyEpaper: readerOptInDailyEpaper,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          setErrorMessage(data.error || 'Registration failed.');
          setIsCredentialSigningIn(false);
          return;
        }

        // Auto sign in with credentials
        const loginIdentifier = phone || readerIdentifier.trim();
        const result = await signIn('credentials', {
          redirect: false,
          loginId: loginIdentifier,
          password: readerPassword,
          redirectTo: callbackUrl,
        });

        if (result?.error) {
          setReaderMode('signin');
          setErrorMessage('Account created! Please sign in with your credentials.');
          setIsCredentialSigningIn(false);
          return;
        }

        if (result?.url) {
          window.location.assign(result.url);
          return;
        }

        router.replace(redirectTo);
        router.refresh();
      } catch (error) {
        setErrorMessage(resolveCaughtAuthError(error));
      } finally {
        setIsCredentialSigningIn(false);
      }
    } else {
      // Reader Sign In
      const loginIdentifier = readerUseWhatsApp
        ? normalizeWhatsAppNumber(readerIdentifier) || readerIdentifier.trim()
        : readerIdentifier.trim();

      if (!loginIdentifier || !readerPassword) {
        setErrorMessage(
          readerUseWhatsApp
            ? 'Please enter your WhatsApp number and password.'
            : 'Please enter your email and password.'
        );
        return;
      }

      setIsCredentialSigningIn(true);
      try {
        const result = await signIn('credentials', {
          redirect: false,
          loginId: loginIdentifier,
          password: readerPassword,
          redirectTo: callbackUrl,
        });

        if (result?.error) {
          setErrorMessage(resolveAuthError(result.code || result.error));
          setIsCredentialSigningIn(false);
          return;
        }

        if (result?.url) {
          window.location.assign(result.url);
          return;
        }

        router.replace(redirectTo);
        router.refresh();
      } catch (error) {
        setErrorMessage(resolveCaughtAuthError(error));
      } finally {
        setIsCredentialSigningIn(false);
      }
    }
  }

  async function handleAdminCredentialsSignIn(): Promise<void> {
    if (!adminLoginId.trim() || !adminPassword) {
      setErrorMessage('Enter your login ID or email and password.');
      return;
    }

    setErrorMessage('');
    setIsCredentialSigningIn(true);

    try {
      const result = await signIn('credentials', {
        redirect: false,
        loginId: adminLoginId.trim(),
        password: adminPassword,
        redirectTo: callbackUrl,
      });

      if (result?.error) {
        setErrorMessage(resolveAuthError(result.code || result.error));
        setIsCredentialSigningIn(false);
        return;
      }

      if (result?.url) {
        window.location.assign(result.url);
        return;
      }

      setErrorMessage(AUTH_ERROR_MESSAGES.Default);
      setIsCredentialSigningIn(false);
    } catch (error) {
      setErrorMessage(resolveCaughtAuthError(error));
      setIsCredentialSigningIn(false);
    }
  }

  async function handleSwitchAccount() {
    setIsSwitchingAccount(true);

    try {
      await signOut({ redirect: false });
    } catch {
      // Ignore client sign-out errors
    }

    router.replace(buildSignInRoute(redirectTo));
    router.refresh();
    setIsSwitchingAccount(false);
  }

  const signedInName =
    session?.user?.name?.trim() ||
    session?.user?.email?.split('@')[0]?.trim() ||
    'Lokswami User';
  const signedInEmail = session?.user?.email?.trim() || '';
  const shouldShowAuthenticatedNotice =
    status === 'authenticated' &&
    signedInEmail &&
    (errorKey === 'inactive' || errorKey === 'no_admin_access');

  const authProps: AuthFormContentProps = {
    errorMessage,
    isSigningIn,
    isCredentialSigningIn,
    showGoogleSignIn,
    showAdminCredentialsLogin,
    authPortalTab,
    onAuthPortalTabChange: setAuthPortalTab,
    readerMode,
    onReaderModeChange: setReaderMode,
    readerFullName,
    onReaderFullNameChange: setReaderFullName,
    readerIdentifier,
    onReaderIdentifierChange: setReaderIdentifier,
    readerUseWhatsApp,
    onReaderUseWhatsAppChange: setReaderUseWhatsApp,
    readerPassword,
    onReaderPasswordChange: setReaderPassword,
    readerOptInDailyEpaper,
    onReaderOptInDailyEpaperChange: setReaderOptInDailyEpaper,
    onReaderSubmit: handleReaderSubmit,
    adminLoginId,
    adminPassword,
    isAdminPasswordVisible,
    onAdminLoginIdChange: setAdminLoginId,
    onAdminPasswordChange: setAdminPassword,
    onToggleAdminPasswordVisibility: () => setIsAdminPasswordVisible((prev) => !prev),
    onGoogleSignIn: handleGoogleSignIn,
    onAdminCredentialsSignIn: handleAdminCredentialsSignIn,
  };

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-zinc-100 transition-colors dark:bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(230,57,70,0.09),transparent_36%)] dark:bg-[radial-gradient(circle_at_top,rgba(230,57,70,0.18),transparent_34%)]" />

      {/* Mobile View */}
      <div className="lg:hidden">
        <header className="flex items-center justify-between px-4 py-3 sm:px-6">
          <Logo size="sm" href="/main" />
          <ThemeToggleButton />
        </header>

        <div className="relative flex min-h-[calc(100dvh-56px)] flex-col px-3 py-2 sm:px-6 sm:py-6 md:px-8">
          <div className="mx-auto w-full max-w-4xl">
            <div className="text-center">
              <div className="mt-1 hidden flex-wrap justify-center gap-2 sm:flex">
                {READER_FEATURES.map((feature) => (
                  <div
                    key={feature}
                    className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
                  >
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-1 items-start justify-center sm:mt-6 md:items-center">
            <div className="w-full max-w-sm">
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="mx-auto w-full rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
              >
                {shouldShowAuthenticatedNotice ? (
                  <AuthenticatedNotice
                    errorMessage={errorMessage}
                    primaryHref="/main"
                    primaryLabel="Go to main site"
                    onSwitchAccount={handleSwitchAccount}
                    isSwitchingAccount={isSwitchingAccount}
                    name={signedInName}
                    email={signedInEmail}
                  />
                ) : (
                  <AuthFormContent {...authProps} />
                )}
              </motion.section>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Split View */}
      <div className="relative hidden min-h-screen lg:grid lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative flex flex-col items-center justify-center bg-zinc-950 p-12"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(230,57,70,0.25),transparent_38%)]" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <Logo size="lg" href="/main" />

            <div className="mt-8 flex flex-col items-center gap-3">
              {READER_FEATURES.map((feature) => (
                <FeaturePill key={feature}>{feature}</FeaturePill>
              ))}
            </div>
          </div>

          <p className="absolute bottom-8 text-xs text-zinc-600">
            Madhya Pradesh&apos;s leading Hindi newspaper & digital media
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative flex items-center justify-center bg-white p-12 dark:bg-zinc-950"
        >
          <ThemeToggleButton className="absolute right-4 top-4" />

          <div className="mx-auto w-full max-w-sm">
            {shouldShowAuthenticatedNotice ? (
              <AuthenticatedNotice
                errorMessage={errorMessage}
                primaryHref="/main"
                primaryLabel="Go to main site"
                onSwitchAccount={handleSwitchAccount}
                isSwitchingAccount={isSwitchingAccount}
                name={signedInName}
                email={signedInEmail}
              />
            ) : (
              <AuthFormContent {...authProps} />
            )}
          </div>
        </motion.section>
      </div>
    </main>
  );
}

function SignInPageFallback() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(230,57,70,0.2),transparent_32%)]" />

      <div className="relative z-10 mx-auto w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center shadow-2xl">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#e63946]" />
        <p className="mt-3 text-sm font-medium text-zinc-300">Preparing sign-in...</p>
      </div>
    </main>
  );
}

export default function SignInPage({
  adminCredentialsEnabled,
  adminGoogleEnabled,
}: {
  adminCredentialsEnabled: boolean;
  adminGoogleEnabled: boolean;
}) {
  return (
    <Suspense fallback={<SignInPageFallback />}>
      <SignInPageContent
        adminCredentialsEnabled={adminCredentialsEnabled}
        adminGoogleEnabled={adminGoogleEnabled}
      />
    </Suspense>
  );
}
