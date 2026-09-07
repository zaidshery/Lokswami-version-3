'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const fallbackToast: ToastContextValue = {
  showToast: () => '',
  dismissToast: () => {},
  success: () => '',
  error: () => '',
  warning: () => '',
  info: () => '',
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  return context || fallbackToast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev.slice(-4), newToast]); // Keep maximum 5 active toasts

      if (duration > 0) {
        window.setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [dismissToast]
  );

  const success = useCallback(
    (message: string, title?: string) => showToast({ type: 'success', message, title }),
    [showToast]
  );

  const error = useCallback(
    (message: string, title?: string) => showToast({ type: 'error', message, title, duration: 6000 }),
    [showToast]
  );

  const warning = useCallback(
    (message: string, title?: string) => showToast({ type: 'warning', message, title }),
    [showToast]
  );

  const info = useCallback(
    (message: string, title?: string) => showToast({ type: 'info', message, title }),
    [showToast]
  );

  const renderIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-sky-500" />;
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, success, error, warning, info }}>
      {children}

      {/* Floating Toast Container */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2.5 sm:bottom-6 sm:right-6"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white/95 p-4 shadow-xl backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-900/95"
            >
              <div className="flex-shrink-0 pt-0.5">{renderIcon(toast.type)}</div>

              <div className="min-w-0 flex-1">
                {toast.title && (
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    {toast.title}
                  </p>
                )}
                <p className="text-xs text-zinc-700 dark:text-zinc-300">{toast.message}</p>
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="flex-shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
