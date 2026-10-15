'use client';

import { useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { isReaderRole, type UserRole } from '@/lib/auth/roles';
import { useAppStore, type AppUser } from '@/lib/store/appStore';

type SavedArticlesPayload = {
  success?: boolean;
  data?: {
    savedArticleIds?: string[];
  };
};

function mapSessionToAppUser(
  sessionUser: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: UserRole;
    isActive?: boolean;
    savedArticles?: string[];
  } | null
): AppUser | null {
  if (!sessionUser?.email) {
    return null;
  }

  return {
    id: sessionUser.id || '',
    name: sessionUser.name?.trim() || sessionUser.email.split('@')[0] || 'Reader',
    email: sessionUser.email,
    image: sessionUser.image || null,
    role: sessionUser.role || 'reader',
    isActive: sessionUser.isActive !== false,
    savedArticles: Array.isArray(sessionUser.savedArticles)
      ? sessionUser.savedArticles
      : [],
  };
}

/** Keeps the Zustand auth slice synchronized with the NextAuth session. */
export default function AuthSync() {
  const { data: session, status } = useSession();
  const setUser = useAppStore((state) => state.setUser);
  const setSavedArticles = useAppStore((state) => state.setSavedArticles);
  const clearUser = useAppStore((state) => state.clearUser);

  const refreshSavedArticles = useCallback(async () => {
    if (status !== 'authenticated' || !isReaderRole(session?.user?.role)) {
      return;
    }

    try {
      const response = await fetch('/api/user/save', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as SavedArticlesPayload;

      if (
        response.ok &&
        payload.success &&
        Array.isArray(payload.data?.savedArticleIds)
      ) {
        const normalized = payload.data.savedArticleIds
          .map((value) => String(value).trim())
          .filter(Boolean);
        setSavedArticles(normalized);
      }
    } catch (error) {
      console.error('Failed to refresh saved articles from API:', error);
    }
  }, [session?.user?.role, setSavedArticles, status]);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    if (status !== 'authenticated') {
      clearUser();
      return;
    }

    const mappedUser = mapSessionToAppUser(session?.user || null);

    if (!mappedUser) {
      clearUser();
      return;
    }

    setUser(mappedUser);
    if (isReaderRole(mappedUser.role)) {
      void refreshSavedArticles();
    }
  }, [clearUser, refreshSavedArticles, session?.user, setUser, status]);

  useEffect(() => {
    if (typeof window === 'undefined' || status !== 'authenticated') {
      return;
    }

    const handleSavedArticleUpdated = (
      event: Event
    ) => {
      const currentUser = useAppStore.getState().currentUser;
      if (!currentUser || !isReaderRole(currentUser.role)) {
        return;
      }

      const payload = (event as CustomEvent<{
        articleId?: string;
        saved?: boolean;
        savedArticleIds?: string[];
      }>).detail;

      if (!payload) {
        return;
      }

      if (Array.isArray(payload.savedArticleIds)) {
        const normalized = payload.savedArticleIds
          .map((value) => String(value).trim())
          .filter(Boolean);
        setSavedArticles(normalized);
        return;
      }

      if (!payload.articleId || typeof payload.saved !== 'boolean') {
        return;
      }

      const currentIds = Array.isArray(currentUser.savedArticles)
        ? currentUser.savedArticles
        : [];

      const nextIds = payload.saved
        ? Array.from(new Set([...currentIds, payload.articleId]))
        : currentIds.filter((id) => id !== payload.articleId);

      setSavedArticles(nextIds);
    };

    window.addEventListener(
      'lokswami:saved-article-updated',
      handleSavedArticleUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        'lokswami:saved-article-updated',
        handleSavedArticleUpdated as EventListener
      );
    };
  }, [setSavedArticles, status]);

  return null;
}
