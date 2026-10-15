'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { BellRing, MapPin, Smartphone, Sparkles, X } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import {
  hideInstallPrompt,
  requestInstallPrompt,
  resolveNotificationCapability,
} from '@/lib/pwa/client';
import {
  activatePopup,
  dismissPopup,
  getNextPopup,
  neverShowPopupAgain,
  readPopupState,
  releaseActiveSurface,
  registerPathVisit,
  savePreferredCategories,
  saveSelectedState,
  type PopupType,
} from '@/lib/popups/popupManager';

const STATE_OPTIONS = [
  '\u0909\u0924\u094d\u0924\u0930 \u092a\u094d\u0930\u0926\u0947\u0936',
  '\u092c\u093f\u0939\u093e\u0930',
  '\u092e\u0927\u094d\u092f \u092a\u094d\u0930\u0926\u0947\u0936',
  '\u0930\u093e\u091c\u0938\u094d\u0925\u093e\u0928',
  '\u0926\u093f\u0932\u094d\u0932\u0940',
  '\u0939\u0930\u093f\u092f\u093e\u0923\u093e',
  '\u0909\u0924\u094d\u0924\u0930\u093e\u0916\u0902\u0921',
  '\u091d\u093e\u0930\u0916\u0902\u0921',
];

const PERSONALIZATION_TOPICS = [
  {
    value: 'national',
    labelHi: '\u0930\u093e\u0937\u094d\u091f\u094d\u0930\u0940\u092f',
    labelEn: 'National',
  },
  {
    value: 'regional',
    labelHi: '\u0930\u0940\u091c\u0928\u0932',
    labelEn: 'Regional',
  },
  {
    value: 'politics',
    labelHi: '\u0930\u093e\u091c\u0928\u0940\u0924\u093f',
    labelEn: 'Politics',
  },
  {
    value: 'business',
    labelHi: '\u092c\u093f\u091c\u0928\u0947\u0938',
    labelEn: 'Business',
  },
  {
    value: 'sports',
    labelHi: '\u0916\u0947\u0932',
    labelEn: 'Sports',
  },
  {
    value: 'technology',
    labelHi: '\u091f\u0947\u0915',
    labelEn: 'Tech',
  },
  {
    value: 'entertainment',
    labelHi: '\u092e\u0928\u094b\u0930\u0902\u091c\u0928',
    labelEn: 'Entertainment',
  },
];

type PopupSnapshot = ReturnType<typeof readPopupState>;

export function PopupFrame({
  title,
  subtitle,
  dismissLabel,
  neverShowLabel,
  onDismiss,
  onNeverShow,
  children,
}: {
  title: string;
  subtitle: string;
  dismissLabel: string;
  neverShowLabel: string;
  onDismiss: () => void;
  onNeverShow: () => void;
  children: React.ReactNode;
}) {
  const frameRef = useRef<HTMLElement>(null);
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    // Recommendations are non-modal. Never leave a keyboard control covered.
    const dismissIfCovered = () => {
      const frame = frameRef.current;
      const target = document.activeElement;
      if (!frame || !(target instanceof HTMLElement) || target === document.body || frame.contains(target)) return;
      const control = target.getBoundingClientRect();
      const popup = frame.getBoundingClientRect();
      if (control.width > 0 && control.height > 0 && control.left < popup.right && control.right > popup.left && control.top < popup.bottom && control.bottom > popup.top) dismissRef.current();
    };
    dismissIfCovered();
    document.addEventListener('focusin', dismissIfCovered);
    return () => document.removeEventListener('focusin', dismissIfCovered);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[120] flex items-end justify-center bg-[radial-gradient(circle_at_top,rgba(231,33,41,0.18),transparent_42%),rgba(10,10,12,0.55)] p-3 backdrop-blur-[2px] sm:items-center sm:p-5">
      <section ref={frameRef} data-popup-frame className="pointer-events-auto relative w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,248,0.95))] p-4 shadow-[0_28px_72px_rgba(15,23,42,0.28)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.96),rgba(15,15,18,0.98))] sm:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(231,33,41,0.16),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#8b141a_0%,#e72129_52%,#c61d24_100%)]" />
        <header className="relative mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[1.15rem] font-black tracking-tight text-zinc-950 dark:text-zinc-50">
              {title}
            </h2>
            <p className="mt-1.5 max-w-md text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-white/75 text-zinc-600 shadow-sm backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
            aria-label="Dismiss popup"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="relative">{children}</div>

        <footer className="mt-5 flex flex-col-reverse gap-2 border-t border-zinc-200/70 pt-4 dark:border-zinc-800/80 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300/90 bg-white/85 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-white dark:border-zinc-700 dark:bg-white/[0.03] dark:text-zinc-100 dark:hover:bg-white/[0.06]"
          >
            {dismissLabel}
          </button>
          <button
            type="button"
            onClick={onNeverShow}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-primary-200/80 bg-primary-50/90 px-4 text-sm font-semibold text-primary-700 transition hover:bg-primary-100 dark:border-primary-500/20 dark:bg-primary-500/12 dark:text-primary-300 dark:hover:bg-primary-500/18"
          >
            {neverShowLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function PopupOrchestrator() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { language } = useAppStore();
  const [snapshot, setSnapshot] = useState<PopupSnapshot>(() => readPopupState());
  const [activePopup, setActivePopup] = useState<PopupType | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationNotice, setNotificationNotice] = useState('');
  const [notificationStep, setNotificationStep] = useState<'soft' | 'confirm'>('soft');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const isAuthenticated = status === 'authenticated' && Boolean(session?.user?.email);
  const notificationCapability = resolveNotificationCapability();
  const requiresInstallForNotifications = notificationCapability.requiresAppInstall;

  const dismissLabel = language === 'hi' ? '\u0905\u092d\u0940 \u0928\u0939\u0940\u0902' : 'Not now';
  const neverShowLabel =
    language === 'hi'
      ? '\u092b\u093f\u0930 \u0928 \u0926\u093f\u0916\u093e\u090f\u0902'
      : "Don't show again";

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const next = registerPathVisit(pathname);
    setSnapshot(next);
  }, [pathname]);

  useEffect(() => {
    if (!pathname || activePopup) {
      return;
    }

    const nextPopup = getNextPopup({
      isAuthenticated,
      notificationPermission: notificationCapability.state,
    });

    if (!nextPopup) {
      return;
    }

    const nextState = activatePopup(nextPopup);
    setSnapshot(nextState);
    setActivePopup(nextPopup);
    setNotificationStep('soft');
    setNotificationNotice('');

    if (nextPopup === 'personalization') {
      setSelectedTopics(nextState.preferredCategories);
    }
  }, [activePopup, isAuthenticated, notificationCapability.state, pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (activePopup) {
      hideInstallPrompt();
      document.body.dataset.lokswamiPopupActive = '1';
      return () => {
        delete document.body.dataset.lokswamiPopupActive;
      };
    }

    delete document.body.dataset.lokswamiPopupActive;
    return () => {
      delete document.body.dataset.lokswamiPopupActive;
    };
  }, [activePopup]);

  const closeActivePopup = (next: PopupSnapshot) => {
    setSnapshot(next);
    setActivePopup(null);
    setNotificationStep('soft');
    setNotificationNotice('');
  };

  const onDismiss = () => {
    if (!activePopup) {
      return;
    }

    closeActivePopup(dismissPopup(activePopup));
  };

  const onNeverShow = () => {
    if (!activePopup) {
      return;
    }

    closeActivePopup(neverShowPopupAgain(activePopup));
  };

  const stateSubtitle = useMemo(
    () =>
      language === 'hi'
        ? '\u0905\u092a\u0928\u093e \u0930\u093e\u091c\u094d\u092f \u091a\u0941\u0928\u0947\u0902 \u0924\u093e\u0915\u093f \u0906\u092a\u0915\u0947 \u0932\u093f\u090f \u0938\u094d\u0925\u093e\u0928\u0940\u092f \u0916\u092c\u0930\u0947\u0902 \u0914\u0930 \u092c\u0947\u0939\u0924\u0930 \u0939\u094b\u0902\u0964'
        : 'Choose your state for better local news recommendations.',
    [language]
  );

  const notificationSubtitle = useMemo(
    () =>
      requiresInstallForNotifications
        ? language === 'hi'
          ? 'iPhone \u092a\u0930 \u0905\u0932\u0930\u094d\u091f \u091a\u093e\u0932\u0942 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u092a\u0939\u0932\u0947 \u090f\u092a \u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0915\u0930\u0947\u0902\u0964'
          : 'Install the app first to enable alerts on iPhone.'
        : language === 'hi'
          ? '\u092c\u094d\u0930\u0947\u0915\u093f\u0902\u0917 \u0928\u094d\u092f\u0942\u091c\u093c \u0914\u0930 \u0908-\u092a\u0947\u092a\u0930 \u0905\u0932\u0930\u094d\u091f \u092a\u093e\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u0928\u094b\u091f\u093f\u092b\u093f\u0915\u0947\u0936\u0928 \u0905\u0928\u0941\u092e\u0924\u093f \u0926\u0947\u0902\u0964'
          : 'Allow browser notifications for breaking and e-paper alerts.',
    [language, requiresInstallForNotifications]
  );

  const personalizationSubtitle = useMemo(
    () =>
      language === 'hi'
        ? '\u0905\u092a\u0928\u0947 \u092a\u0938\u0902\u0926\u0940\u0926\u093e \u091f\u0949\u092a\u093f\u0915 \u091a\u0941\u0928\u0947\u0902, \u0939\u092e \u0928\u094d\u092f\u0942\u091c\u093c \u092b\u0940\u0921 \u0915\u094b \u0906\u092a\u0915\u0947 \u0932\u093f\u090f \u0914\u0930 \u092c\u0947\u0939\u0924\u0930 \u0915\u0930\u0947\u0902\u0917\u0947\u0964'
        : 'Pick preferred topics to personalize your news feed.',
    [language]
  );

  const toggleTopic = (value: string) => {
    setSelectedTopics((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  };

  const onSaveTopics = () => {
    const next = savePreferredCategories(selectedTopics);
    setSnapshot(next);
    setActivePopup(null);
  };

  const onEnableNotifications = async () => {
    const capability = resolveNotificationCapability();

    if (capability.requiresAppInstall) {
      closeActivePopup(releaseActiveSurface('notification'));
      requestInstallPrompt();
      return;
    }

    if (!capability.isSupported) {
      setNotificationNotice(
        language === 'hi'
          ? '\u0907\u0938 \u092c\u094d\u0930\u093e\u0909\u091c\u093c\u0930 \u092e\u0947\u0902 \u0928\u094b\u091f\u093f\u092b\u093f\u0915\u0947\u0936\u0928 \u0909\u092a\u0932\u092c\u094d\u0927 \u0928\u0939\u0940\u0902 \u0939\u0948\u0902\u0964'
          : 'Notifications are not supported in this browser.'
      );
      return;
    }

    if (!capability.canPrompt) {
      if (capability.permission === 'granted') {
        closeActivePopup(dismissPopup('notification'));
        return;
      }

      if (capability.permission === 'denied') {
        setNotificationNotice(
          language === 'hi'
            ? '\u0905\u0932\u0930\u094d\u091f \u092b\u093f\u0930 \u0938\u0947 \u091a\u093e\u0932\u0942 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f browser site settings \u092e\u0947\u0902 Notifications \u0905\u0928\u0941\u092e\u0924\u093f \u091a\u093e\u0932\u0942 \u0915\u0930\u0947\u0902\u0964'
            : 'Notifications are blocked. Re-enable them from your browser site settings.'
        );
      }
      return;
    }

    setNotificationBusy(true);
    setNotificationNotice('');

    try {
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        closeActivePopup(dismissPopup('notification'));
        return;
      }

      if (permission === 'denied') {
        setNotificationNotice(
          language === 'hi'
            ? '\u0905\u0928\u0941\u092e\u0924\u093f \u0928\u0939\u0940\u0902 \u092e\u093f\u0932\u0940\u0964 \u0905\u0932\u0930\u094d\u091f \u091a\u093e\u0932\u0942 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f browser site settings \u092e\u0947\u0902 Notifications \u0905\u0928\u0941\u092e\u0924\u093f \u0926\u0947\u0902\u0964'
            : 'Permission was denied. Open your browser site settings to turn alerts back on.'
        );
        return;
      }

      setNotificationNotice(
        language === 'hi'
          ? '\u0906\u092a \u092c\u093e\u0926 \u092e\u0947\u0902 \u092d\u0940 \u0905\u0932\u0930\u094d\u091f \u091a\u093e\u0932\u0942 \u0915\u0930 \u0938\u0915\u0924\u0947 \u0939\u0948\u0902\u0964'
          : 'You can turn alerts on later.'
      );
    } finally {
      setNotificationBusy(false);
    }
  };

  const onPrepareNotifications = () => {
    const capability = resolveNotificationCapability();

    if (capability.requiresAppInstall) {
      closeActivePopup(releaseActiveSurface('notification'));
      requestInstallPrompt();
      return;
    }

    if (!capability.isSupported) {
      setNotificationNotice(
        language === 'hi'
          ? '\u0907\u0938 \u092c\u094d\u0930\u093e\u0909\u091c\u093c\u0930 \u092e\u0947\u0902 \u0928\u094b\u091f\u093f\u092b\u093f\u0915\u0947\u0936\u0928 \u0909\u092a\u0932\u092c\u094d\u0927 \u0928\u0939\u0940\u0902 \u0939\u0948\u0902\u0964'
          : 'Notifications are not supported in this browser.'
      );
      return;
    }

    if (!capability.canPrompt) {
      if (capability.permission === 'granted') {
        closeActivePopup(dismissPopup('notification'));
        return;
      }

      if (capability.permission === 'denied') {
        setNotificationNotice(
          language === 'hi'
            ? '\u0905\u0932\u0930\u094d\u091f \u092b\u093f\u0930 \u0938\u0947 \u091a\u093e\u0932\u0942 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f browser site settings \u092e\u0947\u0902 Notifications \u0905\u0928\u0941\u092e\u0924\u093f \u091a\u093e\u0932\u0942 \u0915\u0930\u0947\u0902\u0964'
            : 'Notifications are blocked. Re-enable them from your browser site settings.'
        );
      }
      return;
    }

    setNotificationNotice('');
    setNotificationStep('confirm');
  };

  const onSelectState = (value: string) => {
    const next = saveSelectedState(value);
    setSnapshot(next);
    setActivePopup(null);
  };

  if (!activePopup) {
    return null;
  }

  if (activePopup === 'state') {
    return (
      <PopupFrame
        title={
          language === 'hi'
            ? '\u0906\u092a\u0915\u093e \u0930\u093e\u091c\u094d\u092f \u091a\u0941\u0928\u0947\u0902'
            : 'Choose Your State'
        }
        subtitle={stateSubtitle}
        dismissLabel={dismissLabel}
        neverShowLabel={neverShowLabel}
        onDismiss={onDismiss}
        onNeverShow={onNeverShow}
      >
        <div className="grid grid-cols-2 gap-2.5">
          {STATE_OPTIONS.map((stateName) => {
            const isSelected = snapshot.selectedState === stateName;

            return (
              <button
                key={stateName}
                type="button"
                onClick={() => onSelectState(stateName)}
                className={`inline-flex items-center justify-center gap-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-500/15 dark:text-primary-200'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>{stateName}</span>
              </button>
            );
          })}
        </div>
      </PopupFrame>
    );
  }

  if (activePopup === 'notification') {
    return (
      <PopupFrame
        title={
          language === 'hi'
            ? '\u0928\u094b\u091f\u093f\u092b\u093f\u0915\u0947\u0936\u0928 \u0905\u0932\u0930\u094d\u091f \u091a\u093e\u0932\u0942 \u0915\u0930\u0947\u0902'
            : 'Enable Notifications'
        }
        subtitle={notificationSubtitle}
        dismissLabel={dismissLabel}
        neverShowLabel={neverShowLabel}
        onDismiss={onDismiss}
        onNeverShow={onNeverShow}
      >
        <div className="rounded-xl border border-primary-200/70 bg-[radial-gradient(circle_at_top_right,rgba(231,33,41,0.12),transparent_42%),linear-gradient(135deg,rgba(255,241,242,0.95),rgba(255,255,255,0.98))] p-3 text-sm text-zinc-700 dark:border-primary-900/40 dark:bg-[radial-gradient(circle_at_top_right,rgba(231,33,41,0.16),transparent_38%),linear-gradient(135deg,rgba(63,7,11,0.7),rgba(36,32,36,0.96))] dark:text-zinc-200">
          <p className="flex items-center gap-2 font-semibold">
            <BellRing className="h-4 w-4 text-primary-600 dark:text-primary-300" />
            {requiresInstallForNotifications
              ? language === 'hi'
                ? '\u0905\u0932\u0930\u094d\u091f \u091a\u093e\u0932\u0942 \u0915\u0930\u0928\u0947 \u0938\u0947 \u092a\u0939\u0932\u0947 \u090f\u092a \u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0915\u0930\u0928\u093e \u091c\u0930\u0942\u0930\u0940 \u0939\u0948\u0964'
                : 'Install the app first before enabling alerts.'
              : notificationStep === 'soft'
                ? language === 'hi'
                  ? '\u092c\u094d\u0930\u0947\u0915\u093f\u0902\u0917 \u0928\u094d\u092f\u0942\u091c\u093c \u0914\u0930 \u0908-\u092a\u0947\u092a\u0930 \u0905\u092a\u0921\u0947\u091f \u092e\u093f\u0938 \u0928 \u0915\u0930\u0947\u0902\u0964'
                  : 'Do not miss breaking updates and e-paper alerts.'
                : language === 'hi'
                  ? '\u0905\u092d\u0940 browser prompt \u0916\u0941\u0932\u0947\u0917\u093e, \u0915\u0943\u092a\u092f\u093e Allow \u091a\u0941\u0928\u0947\u0902\u0964'
                  : 'Your browser will ask next. Choose Allow to receive alerts.'}
          </p>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
            {requiresInstallForNotifications
              ? language === 'hi'
                ? '\u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0915\u0947 \u092c\u093e\u0926 \u0905\u092a \u0915\u094b browser Allow prompt \u0926\u093f\u0916\u093e\u092f\u0947\u0917\u093e\u0964'
                : 'After install, the browser will let you allow alerts.'
              : notificationStep === 'soft'
                ? language === 'hi'
                  ? '\u091c\u092c \u0916\u092c\u0930 \u092e\u0939\u0924\u094d\u0935\u092a\u0942\u0930\u094d\u0923 \u0939\u094b, \u092c\u093e\u0930-\u092c\u093e\u0930 \u0938\u093e\u0907\u091f \u0916\u094b\u0932\u0947 \u092c\u093f\u0928\u093e \u0924\u0941\u0930\u0902\u0924 \u091c\u093e\u0928\u0915\u093e\u0930\u0940 \u092a\u093e\u090f\u0902\u0964'
                  : 'Get important updates without reopening the site every time.'
                : language === 'hi'
                  ? '\u0905\u0928\u0941\u092e\u0924\u093f \u092e\u093f\u0932\u0924\u0947 \u0939\u0940 \u0939\u092e \u0938\u093f\u0930\u094d\u092b \u0909\u092a\u092f\u094b\u0917\u0940 \u092c\u094d\u0930\u0947\u0915\u093f\u0902\u0917 \u0914\u0930 \u0908-\u092a\u0947\u092a\u0930 \u0905\u0932\u0930\u094d\u091f \u092d\u0947\u091c\u0947\u0902\u0917\u0947\u0964'
                  : 'Once allowed, we will send only useful breaking and e-paper alerts.'}
          </p>
          {notificationNotice ? (
            <p aria-live="polite" className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              {notificationNotice}
            </p>
          ) : null}
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap gap-2">
            {notificationStep === 'confirm' ? (
              <button
                type="button"
                onClick={() => {
                  setNotificationStep('soft');
                  setNotificationNotice('');
                }}
                className="inline-flex h-10 items-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {language === 'hi' ? '\u092a\u0940\u091b\u0947' : 'Back'}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() =>
                notificationStep === 'soft'
                  ? onPrepareNotifications()
                  : void onEnableNotifications()
              }
              disabled={notificationBusy}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#c61d24_0%,#e72129_100%)] px-4 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(199,29,36,0.28)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {requiresInstallForNotifications && notificationStep === 'soft' ? (
                <Smartphone className="h-4 w-4" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              {notificationBusy
                ? language === 'hi'
                  ? '\u092a\u094d\u0930\u094b\u0938\u0947\u0938 \u0939\u094b \u0930\u0939\u093e \u0939\u0948...'
                  : 'Processing...'
                : notificationStep === 'soft'
                  ? requiresInstallForNotifications
                    ? language === 'hi'
                      ? '\u0907\u0902\u0938\u094d\u091f\u0949\u0932 popup \u0916\u094b\u0932\u0947\u0902'
                      : 'Open install popup'
                    : language === 'hi'
                      ? '\u0906\u0917\u0947 \u092c\u095d\u0947\u0902'
                      : 'Continue'
                  : language === 'hi'
                    ? 'Allow prompt \u0916\u094b\u0932\u0947\u0902'
                    : 'Open browser prompt'}
            </button>
          </div>
        </div>
      </PopupFrame>
    );
  }

  return (
    <PopupFrame
      title={
        language === 'hi'
          ? '\u0905\u092a\u0928\u093e \u092b\u0940\u0921 \u092a\u0930\u094d\u0938\u0928\u0932\u093e\u0907\u091c\u093c \u0915\u0930\u0947\u0902'
          : 'Personalize Your Feed'
      }
      subtitle={personalizationSubtitle}
      dismissLabel={dismissLabel}
      neverShowLabel={neverShowLabel}
      onDismiss={onDismiss}
      onNeverShow={onNeverShow}
    >
      <div className="flex flex-wrap gap-2">
        {PERSONALIZATION_TOPICS.map((topic) => {
          const selected = selectedTopics.includes(topic.value);
          return (
            <button
              key={topic.value}
              type="button"
              onClick={() => toggleTopic(topic.value)}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selected
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-500/20 dark:text-primary-200'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-600'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              {language === 'hi' ? topic.labelHi : topic.labelEn}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onSaveTopics}
          disabled={selectedTopics.length === 0}
          className="inline-flex h-10 items-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {language === 'hi'
            ? '\u092a\u0938\u0902\u0926 \u0938\u0939\u0947\u091c\u0947\u0902'
            : 'Save preferences'}
        </button>
      </div>
    </PopupFrame>
  );
}
