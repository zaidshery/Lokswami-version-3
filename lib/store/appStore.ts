'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole } from '@/lib/auth/roles';

function applyThemeToDom(theme: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

function readSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: unknown): 'dark' | 'light' {
  if (theme === 'dark' || theme === 'light') return theme;
  if (typeof document !== 'undefined') {
    const domTheme = document.documentElement.dataset.theme;
    if (domTheme === 'dark' || domTheme === 'light') return domTheme;
  }
  return readSystemTheme();
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  isActive: boolean;
  savedArticles: string[];
}

interface AppState {
  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  
  // Language
  language: 'hi' | 'en';
  toggleLanguage: () => void;
  setLanguage: (lang: 'hi' | 'en') => void;
  
  // UI State
  isMobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;

  // Device
  isMobile: boolean;
  isTablet: boolean;
  setIsMobile: (value: boolean) => void;
  setIsTablet: (value: boolean) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  
  // Player
  currentPlaying: string | null;
  setCurrentPlaying: (id: string | null) => void;
  
  // Breaking News
  isBreakingNewsPaused: boolean;
  setBreakingNewsPaused: (paused: boolean) => void;

  // Immersive video mode (mobile/tablet shorts)
  isImmersiveVideoMode: boolean;
  setImmersiveVideoMode: (value: boolean) => void;

  // E-paper reader mode
  isEpaperReaderOpen: boolean;
  setEpaperReaderOpen: (value: boolean) => void;

  // Reader auth
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  setUser: (user: AppUser) => void;
  setSavedArticles: (savedArticles: string[]) => void;
  clearUser: () => void;
}

/** Exposes the persisted UI store used across the Lokswami client app. */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Theme
      theme: resolveTheme(undefined),
      toggleTheme: () =>
        set((state) => {
          const domDark =
            typeof document !== 'undefined'
              ? document.documentElement.classList.contains('dark')
              : state.theme === 'dark';
          const nextTheme = domDark ? 'light' : 'dark';
          applyThemeToDom(nextTheme);
          return { theme: nextTheme };
        }),
      setTheme: (theme) =>
        set(() => {
          applyThemeToDom(theme);
          return { theme };
        }),

      // Device
      isMobile: false,
      isTablet: false,
      setIsMobile: (isMobile) => set({ isMobile }),
      setIsTablet: (isTablet) => set({ isTablet }),

      // Language
      language: 'hi',
      toggleLanguage: () => set((state) => ({ 
        language: state.language === 'hi' ? 'en' : 'hi' 
      })),
      setLanguage: (language) => set({ language }),
      
      // UI State
      isMobileMenuOpen: false,
      setMobileMenuOpen: (isMobileMenuOpen) => set({ isMobileMenuOpen }),
      toggleMobileMenu: () => set((state) => ({ 
        isMobileMenuOpen: !state.isMobileMenuOpen 
      })),
      
      // Search
      searchQuery: '',
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      
      // Player
      currentPlaying: null,
      setCurrentPlaying: (currentPlaying) => set({ currentPlaying }),
      
      // Breaking News
      isBreakingNewsPaused: false,
      setBreakingNewsPaused: (isBreakingNewsPaused) => set({ isBreakingNewsPaused }),

      // Immersive video mode
      isImmersiveVideoMode: false,
      setImmersiveVideoMode: (isImmersiveVideoMode) =>
        set((state) =>
          state.isImmersiveVideoMode === isImmersiveVideoMode
            ? state
            : { isImmersiveVideoMode }
        ),

      // E-paper reader mode
      isEpaperReaderOpen: false,
      setEpaperReaderOpen: (isEpaperReaderOpen) =>
        set((state) =>
          state.isEpaperReaderOpen === isEpaperReaderOpen
            ? state
            : { isEpaperReaderOpen }
        ),

      // Reader auth
      currentUser: null,
      isAuthenticated: false,
      setUser: (currentUser) => set({ currentUser, isAuthenticated: true }),
      setSavedArticles: (savedArticles) =>
        set((state) => {
          if (!state.currentUser) {
            return state;
          }

          return {
            currentUser: {
              ...state.currentUser,
              savedArticles: Array.from(new Set(savedArticles.map((value) => String(value).trim()).filter(Boolean))),
            },
          };
        }),
      clearUser: () => set({ currentUser: null, isAuthenticated: false }),
    }),
    {
      name: 'lokswami-storage',
      partialize: (state) => ({ 
        theme: state.theme, 
        language: state.language
      }),
      onRehydrateStorage: () => (state) => {
        applyThemeToDom(resolveTheme(state?.theme));
      },
    }
  )
);
