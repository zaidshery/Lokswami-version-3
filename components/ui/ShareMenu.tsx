'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  Facebook,
  Linkedin,
  MessageCircle,
  Share2,
  Smartphone,
} from 'lucide-react';
import { trackClientEvent } from '@/lib/analytics/trackClient';
import { toAbsoluteShareUrl } from '@/lib/utils/articleShare';

export type ShareContentType = 'article' | 'epaper' | 'emagazine' | 'video';
export type SharePlatform =
  | 'native'
  | 'whatsapp'
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'copy';

type ShareMenuProps = {
  title: string;
  url: string;
  text?: string;
  whatsappText?: string;
  contentType: ShareContentType;
  contentId?: string;
  placement?: string;
  language?: 'hi' | 'en';
  triggerLabel?: string;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  align?: 'start' | 'end';
};

type MenuPosition = {
  left: number;
  top: number;
};

const MENU_WIDTH = 244;
const VIEWPORT_MARGIN = 8;

function buildWhatsAppText(
  title: string,
  text: string,
  customText: string,
  url: string,
  contentType: ShareContentType
) {
  const cta = contentType === 'article'
    ? 'Read full story'
    : contentType === 'video'
      ? 'Watch video'
      : contentType === 'emagazine'
        ? 'Open e-magazine'
        : 'Open e-paper';
  const body = customText.trim() || [title.trim(), text.trim()].filter(Boolean).join('\n');
  const linkLine = url.trim() && !body.includes(url.trim()) ? `${cta}: ${url.trim()}` : '';
  return [body, linkLine].filter(Boolean).join('\n');
}

function buildExternalShareUrl(
  platform: Exclude<SharePlatform, 'native' | 'copy'>,
  input: {
    title: string;
    text: string;
    whatsappText: string;
    url: string;
    contentType: ShareContentType;
  }
) {
  const encodedUrl = encodeURIComponent(input.url);

  if (platform === 'whatsapp') {
    const message = buildWhatsAppText(
      input.title,
      input.text,
      input.whatsappText,
      input.url,
      input.contentType
    );
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  if (platform === 'facebook') {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  }

  if (platform === 'x') {
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(input.title)}&url=${encodedUrl}`;
  }

  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
}

async function copyText(value: string) {
  if (typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Copy command was unavailable.');
    }
  } finally {
    textarea.remove();
  }
}

export default function ShareMenu({
  title,
  url,
  text = '',
  whatsappText = '',
  contentType,
  contentId = '',
  placement = 'reader',
  language = 'en',
  triggerLabel,
  ariaLabel,
  className = '',
  buttonClassName = '',
  align = 'end',
}: ShareMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState(url);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
  });

  const labels = language === 'hi'
    ? {
        share: '\u0936\u0947\u092f\u0930',
        shareAria: '\u0936\u0947\u092f\u0930 \u0915\u0930\u0928\u0947 \u0915\u093e \u0924\u0930\u0940\u0915\u093e \u091a\u0941\u0928\u0947\u0902',
        native: '\u0921\u093f\u0935\u093e\u0907\u0938 \u0938\u0947 \u0936\u0947\u092f\u0930 \u0915\u0930\u0947\u0902',
        copy: '\u0932\u093f\u0902\u0915 \u0915\u0949\u092a\u0940 \u0915\u0930\u0947\u0902',
        copied: '\u0932\u093f\u0902\u0915 \u0915\u0949\u092a\u0940 \u0939\u094b \u0917\u092f\u093e',
        failed: '\u0932\u093f\u0902\u0915 \u0915\u0949\u092a\u0940 \u0928\u0939\u0940\u0902 \u0939\u0941\u0906',
      }
    : {
        share: 'Share',
        shareAria: 'Choose how to share',
        native: 'Share with device',
        copy: 'Copy link',
        copied: 'Link copied',
        failed: 'Could not copy link',
      };

  useEffect(() => {
    setCanNativeShare(typeof navigator.share === 'function');
    setResolvedUrl(toAbsoluteShareUrl(url, window.location.origin));
  }, [url]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.getBoundingClientRect().height || 300;
    const desiredLeft = align === 'end' ? rect.right - MENU_WIDTH : rect.left;
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN);
    const left = Math.min(maxLeft, Math.max(VIEWPORT_MARGIN, desiredLeft));
    const spaceBelow = window.innerHeight - rect.bottom;
    const maxTop = Math.max(
      VIEWPORT_MARGIN,
      window.innerHeight - menuHeight - VIEWPORT_MARGIN
    );
    const desiredTop = spaceBelow >= menuHeight + VIEWPORT_MARGIN || spaceBelow >= rect.top
      ? rect.bottom + VIEWPORT_MARGIN
      : rect.top - menuHeight - VIEWPORT_MARGIN;
    const top = Math.min(maxTop, Math.max(VIEWPORT_MARGIN, desiredTop));

    setMenuPosition({ left, top });
  }, [align]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();
    const animationFrame = window.requestAnimationFrame(() => {
      updateMenuPosition();
      menuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]')
        ?.focus();
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMenu(true);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [closeMenu, isOpen, updateMenuPosition]);

  const trackShare = useCallback(
    (event: 'share_click' | 'share_complete', platform: SharePlatform) => {
      trackClientEvent({
        event,
        source: 'share_menu',
        metadata: {
          platform,
          contentType,
          contentId,
          placement,
        },
      });
    },
    [contentId, contentType, placement]
  );

  const handleNativeShare = async () => {
    trackShare('share_click', 'native');
    try {
      await navigator.share({ title, text: text || undefined, url: resolvedUrl });
      trackShare('share_complete', 'native');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Native share failed:', error);
      }
    } finally {
      closeMenu(true);
    }
  };

  const handleExternalShare = (
    platform: Exclude<SharePlatform, 'native' | 'copy'>
  ) => {
    trackShare('share_click', platform);
    const shareUrl = buildExternalShareUrl(platform, {
      title,
      text,
      whatsappText,
      url: resolvedUrl,
      contentType,
    });
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
    trackShare('share_complete', platform);
    closeMenu(true);
  };

  const handleCopy = async () => {
    trackShare('share_click', 'copy');
    try {
      await copyText(resolvedUrl);
      trackShare('share_complete', 'copy');
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
      closeMenu(true);
    }, 1_500);
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []
    );
    if (!items.length) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = currentIndex;

    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    }

    items[nextIndex]?.focus();
  };

  const itemClassName =
    'reader-focus-ring flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800';
  const displayedTriggerLabel = triggerLabel || labels.share;
  const displayedAriaLabel = ariaLabel || labels.shareAria;

  const menu = isOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={displayedAriaLabel}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
          className="fixed z-[100] w-[244px] rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: menuPosition.left, top: menuPosition.top }}
        >
          {canNativeShare ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleNativeShare()}
              className={itemClassName}
            >
              <Smartphone aria-hidden="true" className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              {labels.native}
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            onClick={() => handleExternalShare('whatsapp')}
            className={itemClassName}
          >
            <MessageCircle aria-hidden="true" className="h-4 w-4 text-emerald-600" />
            WhatsApp
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExternalShare('facebook')}
            className={itemClassName}
          >
            <Facebook aria-hidden="true" className="h-4 w-4 text-blue-600" />
            Facebook
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExternalShare('x')}
            className={itemClassName}
          >
            <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center text-sm font-black">
              X
            </span>
            X
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => handleExternalShare('linkedin')}
            className={itemClassName}
          >
            <Linkedin aria-hidden="true" className="h-4 w-4 text-sky-700" />
            LinkedIn
          </button>
          <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleCopy()}
            className={itemClassName}
          >
            {copyStatus === 'copied' ? (
              <Check aria-hidden="true" className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy aria-hidden="true" className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            )}
            {copyStatus === 'copied'
              ? labels.copied
              : copyStatus === 'failed'
                ? labels.failed
                : labels.copy}
          </button>
          <span className="sr-only" aria-live="polite">
            {copyStatus === 'copied'
              ? labels.copied
              : copyStatus === 'failed'
                ? labels.failed
                : ''}
          </span>
        </div>,
        document.body
      )
    : null;

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={displayedAriaLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setCopyStatus('idle');
          setIsOpen((current) => !current);
        }}
        className={buttonClassName || 'reader-touch-button reader-focus-ring inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        <span>{displayedTriggerLabel}</span>
      </button>
      {menu}
    </div>
  );
}
