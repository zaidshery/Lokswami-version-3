'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store/appStore';

const STORAGE_KEY = 'lokswami-storage';

type PersistedStore = {
  state?: {
    theme?: unknown;
    themePreference?: unknown;
  };
};

function readPersistedPreference(): 'auto' | 'light' | 'dark' | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedStore;
    const pref = parsed?.state?.themePreference;
    if (pref === 'auto' || pref === 'light' || pref === 'dark') return pref;
    const theme = parsed?.state?.theme;
    if (theme === 'light' || theme === 'dark') return theme;
    return null;
  } catch {
    return null;
  }
}

function readSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  if (typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: 'dark' | 'light') {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppStore((state) => state.theme);
  const themePreference = useAppStore((state) => state.themePreference);
  const setTheme = useAppStore((state) => state.setTheme);
  const setThemePreference = useAppStore((state) => state.setThemePreference);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const persistedPref = readPersistedPreference();
    const effectivePref = persistedPref || 'auto';
    if (effectivePref !== themePreference) {
      setThemePreference(effectivePref);
    }
    const resolvedTheme = effectivePref === 'auto' ? readSystemTheme() : effectivePref;
    applyTheme(resolvedTheme);
    if (resolvedTheme !== theme) {
      setTheme(resolvedTheme);
    }
  }, [setTheme, setThemePreference, theme, themePreference]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // When themePreference is 'auto', track device/browser prefers-color-scheme
  useEffect(() => {
    if (themePreference !== 'auto') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemThemeChange = (event: MediaQueryListEvent) => {
      const nextTheme = event.matches ? 'dark' : 'light';
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', onSystemThemeChange);
    }

    mediaQuery.addListener(onSystemThemeChange);
    return () => mediaQuery.removeListener(onSystemThemeChange);
  }, [setTheme, themePreference]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const persistedPref = readPersistedPreference();
      if (!persistedPref) return;
      setThemePreference(persistedPref);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setThemePreference]);

  return <>{children}</>;
}
