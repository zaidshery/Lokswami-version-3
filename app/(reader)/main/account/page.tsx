'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Activity,
  Bookmark,
  CheckCircle,
  KeyRound,
  Languages,
  Loader2,
  LogOut,
  MessageSquare,
  Newspaper,
  Phone,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { formatUserRoleLabel } from '@/lib/auth/roles';
import { useAppStore } from '@/lib/store/appStore';
import { formatUiDate, formatUiDateTime } from '@/lib/utils/dateFormat';
import { useToast } from '@/components/ui/toast/useToast';
import FormSwitch from '@/components/ui/form/FormSwitch';
import WhatsAppPhoneInput from '@/components/ui/form/WhatsAppPhoneInput';
import PasswordInput from '@/components/ui/form/PasswordInput';
import Modal from '@/components/ui/modal/Modal';
import ConfirmModal from '@/components/ui/modal/ConfirmModal';

const ACCOUNT_REDIRECT_URL = '/signin?redirect=/main/account';

type ReaderTrackStats = {
  readCount: number;
  readHistoryCount: number;
  averageCompletionPercent: number;
  lastActiveAt: string;
};

type SavedArticlesSummaryPayload = {
  success?: boolean;
  data?: {
    count?: number;
  };
};

function formatMemberSince(value: string | undefined, language: 'hi' | 'en') {
  if (!value) {
    return language === 'hi' ? 'उपलब्ध नहीं' : 'Unavailable';
  }

  return formatUiDate(
    value,
    language === 'hi' ? 'उपलब्ध नहीं' : 'Unavailable'
  );
}

function formatLastActive(value: string | undefined, language: 'hi' | 'en') {
  if (!value) {
    return language === 'hi' ? 'उपलब्ध नहीं' : 'Unavailable';
  }

  return formatUiDateTime(
    value,
    language === 'hi' ? 'उपलब्ध नहीं' : 'Unavailable'
  );
}

function getUserInitials(name: string, email: string) {
  const source = name.trim() || email.trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }

  return (parts[0]?.slice(0, 2) || 'R').toUpperCase();
}

function AccountSkeleton({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-4xl py-4 sm:py-6">
      <div className="cnp-surface overflow-hidden rounded-[28px] p-5 sm:p-6">
        <div className="animate-pulse space-y-5">
          <div className="rounded-[24px] border border-zinc-200 bg-gradient-to-br from-zinc-50 via-white to-red-50/70 p-5 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-red-950/20">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-6 w-40 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-56 max-w-full rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-5 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-28 rounded-3xl bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-28 rounded-3xl bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-28 rounded-3xl bg-zinc-100 dark:bg-zinc-900" />
          </div>
        </div>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          <Loader2 className="h-4 w-4 animate-spin text-red-500" />
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
}

/** Account profile sourced from the active NextAuth session and User API. */
export default function ReaderAccountPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { language, setLanguage } = useAppStore();
  const toast = useToast();

  const [trackStats, setTrackStats] = useState<ReaderTrackStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [savedArticlesCount, setSavedArticlesCount] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // User Profile fields
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [optInDailyEpaper, setOptInDailyEpaper] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [hasLoadedProfile, setHasLoadedProfile] = useState(false);

  // Password Update Modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Logout Confirmation Modal
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const copy = useMemo(() => {
    if (language === 'hi') {
      return {
        loading: 'आपकी प्रोफाइल लोड हो रही है...',
        redirecting: 'आपको साइन-इन पर ले जाया जा रहा है...',
        heading: 'अकाउंट',
        subtitle: 'आपका सत्र लोकस्वामी से जुड़ा हुआ है।',
        memberSince: 'मेंबर सिंस',
        savedArticles: 'सेव्ड आर्टिकल्स',
        savedArticlesHint: 'आपके द्वारा सेव की गई खबरें',
        readingStats: 'रीडिंग स्टैट्स',
        averageCompletion: 'औसत कंप्लीशन',
        lastActive: 'आखिरी एक्टिव',
        statsLoading: 'स्टैट्स लोड हो रहे हैं...',
        preferences: 'प्रिफरेंसेस',
        preferencesHint: 'भाषा, फीड और रीडिंग सेटिंग्स',
        openPreferences: 'प्रिफरेंसेस खोलें',
        epaperTitle: 'व्हाट्सएप पर दैनिक ई-पेपर',
        epaperDesc: 'हर सुबह अपने व्हाट्सएप पर दैनिक ई-पेपर पीडीएफ सीधा प्राप्त करें।',
        epaperNumberLabel: 'व्हाट्सएप मोबाइल नंबर',
        saveChanges: 'बदलाव सेव करें',
        saving: 'सेव हो रहा है...',
        savedSuccess: 'प्रोफाइल सफलतापूर्वक अपडेट हो गई।',
        security: 'अकाउंट सुरक्षा और पासवर्ड',
        changePassword: 'पासवर्ड बदलें',
        logout: 'लॉगआउट',
        loggingOut: 'लॉगआउट हो रहा है...',
      };
    }

    return {
      loading: 'Loading your profile...',
      redirecting: 'Redirecting you to sign in...',
      heading: 'Account',
      subtitle: 'Your session is securely connected to Lokswami.',
      memberSince: 'Member Since',
      savedArticles: 'Saved Articles',
      savedArticlesHint: 'Stories you have saved for later reading',
      readingStats: 'Reading Stats',
      averageCompletion: 'Average Completion',
      lastActive: 'Last Active',
      statsLoading: 'Loading reading stats...',
      preferences: 'Preferences',
      preferencesHint: 'Language, feed and reading settings',
      openPreferences: 'Open Preferences',
      epaperTitle: 'Daily E-Paper on WhatsApp',
      epaperDesc: 'Receive daily morning digital newspaper PDF directly on your WhatsApp.',
      epaperNumberLabel: 'WhatsApp Mobile Number',
      saveChanges: 'Save Changes',
      saving: 'Saving...',
      savedSuccess: 'Profile updated successfully.',
      security: 'Account Security & Password',
      changePassword: 'Change Password',
      logout: 'Logout',
      loggingOut: 'Logging out...',
    };
  }, [language]);

  const sessionUser = session?.user;
  const userName =
    sessionUser?.name?.trim() || sessionUser?.email?.split('@')[0]?.trim() || 'Reader';
  const userEmail = sessionUser?.email?.trim() || '';
  const userImage = sessionUser?.image || null;
  const userInitials = getUserInitials(userName, userEmail);
  const userRole = formatUserRoleLabel(sessionUser?.role);
  const memberSince = formatMemberSince(sessionUser?.createdAt, language);
  const fallbackSavedArticlesCount = Array.isArray(sessionUser?.savedArticles)
    ? sessionUser.savedArticles.length
    : 0;
  const readCount = typeof trackStats?.readCount === 'number' ? trackStats.readCount : 0;
  const averageCompletionPercent =
    typeof trackStats?.averageCompletionPercent === 'number'
      ? trackStats.averageCompletionPercent
      : 0;
  const lastActive = formatLastActive(trackStats?.lastActiveAt, language);

  // Load User Profile from API
  useEffect(() => {
    if (status !== 'authenticated') return;

    async function fetchProfile() {
      try {
        const res = await fetch('/api/user/profile');
        const json = await res.json();
        if (json.success && json.data) {
          setWhatsappNumber(json.data.whatsappNumber || '');
          setOptInDailyEpaper(json.data.optInDailyEpaper !== false);
        }
      } catch (e) {
        console.error('Error fetching profile:', e);
      } finally {
        setHasLoadedProfile(true);
      }
    }

    void fetchProfile();
  }, [status]);

  useEffect(() => {
    if (status !== 'unauthenticated') {
      setIsRedirecting(false);
      return;
    }

    setIsRedirecting(true);
    router.replace(ACCOUNT_REDIRECT_URL);
  }, [router, status]);

  const loadSavedArticlesCount = useCallback(async () => {
    if (status !== 'authenticated' || !userEmail) {
      setSavedArticlesCount(0);
      return;
    }

    try {
      const response = await fetch('/api/user/save', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as SavedArticlesSummaryPayload;

      if (
        response.ok &&
        payload.success &&
        typeof payload.data?.count === 'number' &&
        Number.isFinite(payload.data.count)
      ) {
        setSavedArticlesCount(payload.data.count);
        return;
      }

      setSavedArticlesCount(fallbackSavedArticlesCount);
    } catch (error) {
      console.error('Failed to load saved articles count:', error);
      setSavedArticlesCount(fallbackSavedArticlesCount);
    }
  }, [fallbackSavedArticlesCount, status, userEmail]);

  useEffect(() => {
    let active = true;

    const loadTrackStats = async () => {
      if (status !== 'authenticated' || !userEmail) {
        if (!active) return;
        setTrackStats(null);
        setIsStatsLoading(false);
        return;
      }

      setIsStatsLoading(true);

      try {
        const response = await fetch('/api/user/track', { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          data?: ReaderTrackStats;
        };

        if (!active) return;

        if (response.ok && payload.success && payload.data) {
          setTrackStats(payload.data);
        } else {
          setTrackStats(null);
        }
      } catch (error) {
        console.error('Failed to load reader stats:', error);
        if (active) {
          setTrackStats(null);
        }
      } finally {
        if (active) {
          setIsStatsLoading(false);
        }
      }
    };

    void loadTrackStats();

    return () => {
      active = false;
    };
  }, [status, userEmail]);

  useEffect(() => {
    void loadSavedArticlesCount();
  }, [loadSavedArticlesCount]);

  async function handleSaveProfile() {
    setIsSavingProfile(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsappNumber,
          optInDailyEpaper,
          preferredLanguage: language,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success(copy.savedSuccess, 'Success');
      } else {
        toast.error(json.error || 'Failed to update preferences.', 'Error');
      }
    } catch {
      toast.error('Network error. Please try again.', 'Error');
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setIsUpdatingPassword(true);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const json = await res.json();
      if (json.success) {
        toast.success('Password changed successfully.', 'Security');
        setIsPasswordModalOpen(false);
        setCurrentPassword('');
        setNewPassword('');
      } else {
        setPasswordError(json.error || 'Failed to update password.');
      }
    } catch {
      setPasswordError('Network error. Please try again.');
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut({ callbackUrl: '/signin' });
    } catch (error) {
      console.error('Reader sign-out failed:', error);
      setIsSigningOut(false);
    }
  }

  if (status === 'loading' || isRedirecting) {
    return (
      <AccountSkeleton
        message={status === 'loading' ? copy.loading : copy.redirecting}
      />
    );
  }

  if (status !== 'authenticated' || !userEmail) {
    return <AccountSkeleton message={copy.redirecting} />;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="mx-auto w-full max-w-4xl py-4 sm:py-6"
    >
      <div className="cnp-surface overflow-hidden rounded-[28px] p-5 sm:p-6 md:p-7">
        {/* Profile Header Hero */}
        <div className="rounded-[28px] border border-zinc-200 bg-[linear-gradient(135deg,rgba(254,242,242,0.95),rgba(255,255,255,0.98)_45%,rgba(249,250,251,0.98))] p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] dark:border-zinc-800 dark:bg-[linear-gradient(135deg,rgba(24,24,27,0.98),rgba(24,24,27,0.94)_45%,rgba(69,10,10,0.22))] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/70 bg-red-100 text-2xl font-black text-red-700 shadow-sm dark:border-zinc-700 dark:bg-red-500/15 dark:text-red-300">
              {userImage ? (
                <Image
                  src={userImage}
                  alt={userName}
                  fill
                  sizes="80px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span>{userInitials}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                {copy.heading}
              </p>
              <h1 className="mt-1 truncate text-2xl font-black text-zinc-900 dark:text-zinc-100 sm:text-3xl">
                {userName}
              </h1>
              <p className="mt-0.5 truncate text-sm text-zinc-600 dark:text-zinc-400">
                {userEmail}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300/70 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{userRole}</span>
                </span>

                {whatsappNumber ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                    <MessageSquare className="h-3.5 w-3.5 fill-current" />
                    <span>WhatsApp: {whatsappNumber}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp & Daily E-Paper Preferences Card */}
        <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              <Newspaper className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                {copy.epaperTitle}
              </p>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                {copy.epaperDesc}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-4 rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <FormSwitch
              checked={optInDailyEpaper}
              onChange={setOptInDailyEpaper}
              label={language === 'hi' ? 'दैनिक ई-पेपर व्हाट्सएप पर प्राप्त करें' : 'Opt-in to Daily WhatsApp E-Paper'}
              description={language === 'hi' ? 'सुबह 6:00 बजे आपको ताजा ई-पेपर का संस्करण भेजा जाएगा' : 'Receive the fresh edition daily at 6:00 AM'}
            />

            <div className="pt-2">
              <WhatsAppPhoneInput
                label={copy.epaperNumberLabel}
                value={whatsappNumber}
                onChange={setWhatsappNumber}
                placeholder="+91 98765 43210"
              />
            </div>

            <button
              type="button"
              disabled={isSavingProfile}
              onClick={() => void handleSaveProfile()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              {isSavingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{isSavingProfile ? copy.saving : copy.saveChanges}</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <UserCircle2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  {copy.memberSince}
                </p>
                <p className="mt-1 text-lg font-black text-zinc-900 dark:text-zinc-100">
                  {memberSince}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <Bookmark className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  {copy.savedArticles}
                </p>
                <p className="mt-1 text-lg font-black text-zinc-900 dark:text-zinc-100">
                  {savedArticlesCount}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {copy.savedArticlesHint}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <Activity className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  {copy.readingStats}
                </p>
                {isStatsLoading ? (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {copy.statsLoading}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-black text-zinc-900 dark:text-zinc-100">
                      {readCount}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {copy.averageCompletion}: {averageCompletionPercent}%
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {copy.lastActive}: {lastActive}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <Settings className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  {copy.preferences}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {copy.preferencesHint}
                </p>
              </div>
            </div>

            <Link
              href="/main/preferences"
              className="mt-4 inline-flex items-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {copy.openPreferences}
            </Link>
          </div>
        </div>

        {/* Language Switcher Preference */}
        <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                <Languages className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  भाषा चुनें / Select Language
                </p>
                <p className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {language === 'hi' ? 'ऐप की प्रदर्शन भाषा चुनें' : 'Choose App Display Language'}
                </p>
              </div>
            </div>

            {/* Segmented Control */}
            <div className="inline-flex rounded-2xl border border-zinc-200 bg-zinc-100/90 p-1.5 dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`reader-touch-button reader-focus-ring relative flex min-h-10 min-w-[96px] items-center justify-center rounded-xl px-5 py-2 text-sm font-bold transition-all ${
                  language === 'hi'
                    ? 'bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-400'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
                aria-pressed={language === 'hi'}
              >
                हिन्दी
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`reader-touch-button reader-focus-ring relative flex min-h-10 min-w-[96px] items-center justify-center rounded-xl px-5 py-2 text-sm font-bold transition-all ${
                  language === 'en'
                    ? 'bg-white text-orange-600 shadow-sm dark:bg-zinc-800 dark:text-orange-400'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
                aria-pressed={language === 'en'}
              >
                English
              </button>
            </div>
          </div>
        </div>

        {/* Security & Action Buttons */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/main"
              className="inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Back to Main
            </Link>

            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <KeyRound className="h-4 w-4" />
              <span>{copy.changePassword}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsLogoutModalOpen(true)}
            disabled={isSigningOut}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500 dark:hover:bg-red-400"
          >
            {isSigningOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            <span>{isSigningOut ? copy.loggingOut : copy.logout}</span>
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Change Password"
        description="Update your credentials for logging into Lokswami."
      >
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {passwordError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
              {passwordError}
            </div>
          )}

          <PasswordInput
            label="Current Password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />

          <PasswordInput
            label="New Password"
            placeholder="At least 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            showStrength
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(false)}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdatingPassword}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {isUpdatingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Update Password</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleSignOut}
        title="Log out of Lokswami?"
        message="Are you sure you want to end your active session?"
        confirmLabel="Log Out"
        cancelLabel="Stay Signed In"
        variant="danger"
        isLoading={isSigningOut}
      />
    </motion.section>
  );
}
