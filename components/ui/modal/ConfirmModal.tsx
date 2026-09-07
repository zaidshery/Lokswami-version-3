'use client';

import React from 'react';
import Modal from './Modal';
import { AlertTriangle, Loader2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
}: ConfirmModalProps) {
  const getButtonStyles = () => {
    switch (variant) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500/30';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500/30';
      default:
        return 'bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" showCloseButton={!isLoading}>
      <div className="text-center">
        {variant === 'danger' && (
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
        )}

        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h3>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{message}</p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={() => void onConfirm()}
            className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition disabled:opacity-50 ${getButtonStyles()}`}
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmModal;
