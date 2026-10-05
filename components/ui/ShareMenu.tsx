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
import { buildSocialShareUrl, copyCanonicalUrl, resolveCanonicalShareUrl, shareNative } from '@/lib/utils/universalShare';

export type ShareContentType = 'article' | 'epaper' | 'emagazine' | 'video';
export type SharePlatform =
  | 'native'
  | 'whatsapp'
  | 'facebook'
  | 'x'
  | 'linkedin'
  | 'telegram'
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
  triggerIcon?: 'share' | 'whatsapp';
  directWhatsApp?: boolean;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  align?: 'start' | 'end';
  onShareEvent?: (event: 'share_click' | 'share_complete', platform: SharePlatform) => void;
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
  const linkLine = url.trim() && !body.split(/\s+/).includes(url.trim()) ? `${cta}: ${url.trim()}` : '';
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
  return buildSocialShareUrl(platform, {
    url: input.url,
    title: input.title,
    text: platform === 'whatsapp'
      ? buildWhatsAppText(input.title, input.text, input.whatsappText, input.url, input.contentType)
      : input.title,
  });
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
  triggerIcon = 'share',
  directWhatsApp = false,
  ariaLabel,
  className = '',
  buttonClassName = '',
  align = 'end',
  onShareEvent,
}: ShareMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [shareStatus, setShareStatus] = useState('');
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
    setResolvedUrl(resolveCanonicalShareUrl(url));
    setIsOpen(false);
    setCopyStatus('idle');
    setShareStatus('');
  }, [url]);

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
      if (onShareEvent) {
        onShareEvent(event, platform);
        return;
      }
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
    [contentId, contentType, placement, onShareEvent]
  );

  const handleNativeShare = async () => {
    trackShare('share_click', 'native');
    const result = await shareNative({ title, text, url: resolvedUrl });
    if (result === 'shared') {
      trackShare('share_complete', 'native');
      closeMenu(true);
    } else {
      setShareStatus(language === 'hi' ? 'नीचे शेयर करने का तरीका चुनें।' : 'Choose a sharing option below.');
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
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
    if (!shareUrl) return;
    try {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
      // Opening a destination cannot confirm that the user completed a share.
      setShareStatus(language === 'hi' ? 'विंडो न खुले तो लिंक कॉपी करें।' : 'If no window opens, use Copy link.');
    } catch {
      setShareStatus(language === 'hi' ? 'लिंक कॉपी करके शेयर करें।' : 'Use Copy link to share.');
    }
  };

  const handleCopy = async () => {
    trackShare('share_click', 'copy');
    try {
      if (!await copyCanonicalUrl(resolvedUrl)) throw new Error('Copy failed');
      trackShare('share_complete', 'copy');
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }

    // Keep failure feedback available until another attempt or dismissal.
  };

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isTabbableVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  if (typeof window !== 'undefined') {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

function findAdjacentTabbableElement(
  reference: HTMLElement,
  forward: boolean,
  containerToExclude?: HTMLElement | null
): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => {
    if (containerToExclude && containerToExclude.contains(el)) return false;
    if (el.hasAttribute('disabled')) return false;
    if (el.tabIndex < 0) return false;
    return isTabbableVisible(el);
  });

  const index = elements.indexOf(reference);
  if (index === -1) return null;

  if (forward) {
    return elements[index + 1] || null;
  }
  return elements[index - 1] || null;
}

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Reader playback/navigation shortcuts must not consume menu keystrokes.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      const forward = !event.shiftKey;
      const trigger = triggerRef.current;
      const menuEl = menuRef.current;
      closeMenu(false);

      if (trigger) {
        const target = findAdjacentTabbableElement(trigger, forward, menuEl);
        if (target) {
          target.focus();
        } else {
          trigger.focus();
        }
      }
      return;
    }

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
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
          onKeyDown={handleMenuKeyDown}
          className="fixed z-[160] w-[244px] rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: menuPosition.left, top: menuPosition.top, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto' }}
        >
          {canNativeShare ? (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
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
            tabIndex={-1}
            onClick={() => handleExternalShare('whatsapp')}
            className={itemClassName}
          >
            <MessageCircle aria-hidden="true" className="h-4 w-4 text-emerald-600" />
            WhatsApp
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => handleExternalShare('facebook')}
            className={itemClassName}
          >
            <Facebook aria-hidden="true" className="h-4 w-4 text-blue-600" />
            Facebook
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
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
            tabIndex={-1}
            onClick={() => handleExternalShare('linkedin')}
            className={itemClassName}
          >
            <Linkedin aria-hidden="true" className="h-4 w-4 text-sky-700" />
            LinkedIn
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => handleExternalShare('telegram')}
            className={itemClassName}
          >
            <MessageCircle aria-hidden="true" className="h-4 w-4 text-sky-600" />
            Telegram
          </button>
          <p role="status" className="px-3 text-xs text-zinc-600 dark:text-zinc-300">{shareStatus}</p>
          <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
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
        data-share-action
        disabled={!resolvedUrl}
        aria-haspopup={directWhatsApp ? undefined : 'menu'}
        aria-expanded={directWhatsApp ? undefined : isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={displayedAriaLabel}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'ArrowDown' && !isOpen && !directWhatsApp) {
            event.preventDefault();
            setCopyStatus('idle');
            setShareStatus('');
            setIsOpen(true);
          }
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (directWhatsApp) { handleExternalShare('whatsapp'); return; }
          setCopyStatus('idle');
          setShareStatus('');
          setIsOpen((current) => !current);
        }}
        className={buttonClassName || 'reader-touch-button reader-focus-ring inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'}
      >
        {triggerIcon === 'whatsapp' ? (
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M13.601 2.326A7.85 7.85 0 0 0 8.015 0C3.58 0-.049 3.627-.05 8.064a8.01 8.01 0 0 0 1.05 3.98L0 16l4.062-1.066a8.03 8.03 0 0 0 3.952 1.008h.003c4.435 0 8.064-3.627 8.064-8.064a7.9 7.9 0 0 0-2.48-5.552zm-5.586 12.3h-.003a6.68 6.68 0 0 1-3.402-.93l-.244-.145-2.41.632.643-2.35-.158-.242a6.69 6.69 0 0 1-1.028-3.526c.002-3.692 3.01-6.7 6.706-6.7a6.66 6.66 0 0 1 4.738 1.97 6.67 6.67 0 0 1 1.958 4.74c-.002 3.693-3.01 6.702-6.706 6.702z" />
            <path d="M11.74 9.93c-.202-.101-1.196-.59-1.382-.658-.185-.067-.32-.101-.455.101-.134.202-.522.658-.64.793-.118.134-.236.151-.438.05-.202-.1-.851-.313-1.62-.997-.598-.533-1.002-1.19-1.12-1.392-.118-.202-.013-.311.088-.412.09-.089.202-.236.303-.353.101-.118.135-.202.202-.337.067-.135.034-.253-.017-.354-.05-.101-.455-1.096-.623-1.5-.163-.392-.329-.338-.455-.344-.118-.005-.252-.006-.387-.006s-.354.05-.539.252c-.185.202-.707.69-.707 1.684 0 .994.724 1.955.825 2.09.101.134 1.425 2.176 3.45 3.05.482.208.857.332 1.15.425.483.154.922.132 1.269.08.387-.058 1.196-.488 1.365-.96.168-.472.168-.876.117-.96-.05-.084-.185-.135-.387-.236z" />
          </svg>
        ) : <Share2 className="h-4 w-4" aria-hidden="true" />}
        <span>{displayedTriggerLabel}</span>
      </button>
      {menu}
      {directWhatsApp ? <span role="status" className="sr-only">{shareStatus}</span> : null}
    </div>
  );
}
