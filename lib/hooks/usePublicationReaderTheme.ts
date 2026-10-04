'use client';

import { useSyncExternalStore } from 'react';
import { useAppStore } from '@/lib/store/appStore';

const getTheme = () => useAppStore.getState().theme;
// Match the existing store's server fallback, regardless of browser bootstrap/localStorage.
const getServerTheme = (): 'dark' | 'light' => 'dark';

/** Hydrate reader markup with the server snapshot, then use the sanctioned theme store. */
export function usePublicationReaderTheme() {
  return useSyncExternalStore(useAppStore.subscribe, getTheme, getServerTheme);
}
