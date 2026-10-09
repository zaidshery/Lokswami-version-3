'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { useAppStore } from '@/lib/store/appStore';
import { HOMEPAGE_NAVIGATION, isReaderNavigationActive, isReaderNavigationItemActive } from '@/lib/constants/readerNavigation';

export default function DesktopNav({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const { language: storedLanguage } = useAppStore();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 8 });
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const navRef = useRef<HTMLElement | null>(null);
  const popup = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverOpened = useRef<string | null>(null);
  const language = mounted ? storedLanguage : 'hi';
  const current = HOMEPAGE_NAVIGATION.find(item => item.id === open);
  const width = 240;
  const keepOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const closeSoon = () => { keepOpen(); closeTimer.current = setTimeout(() => setOpen(null), 180); };
  useEffect(() => { setMounted(true); return () => { if (closeTimer.current) clearTimeout(closeTimer.current); }; }, []);
  useEffect(() => { setOpen(null); }, [pathname]);
  useEffect(() => {
    const nav = navRef.current;
    const strip = nav?.parentElement;
    if (!nav || !strip) return;
    const revealActive = () => {
      if (nav.scrollWidth <= strip.clientWidth) {
        strip.scrollLeft = 0;
        return;
      }
      const active = nav.querySelector<HTMLElement>('[data-nav-active="true"]');
      if (!active || !active.getBoundingClientRect().width) return;
      const item = active.getBoundingClientRect();
      const viewport = strip.getBoundingClientRect();
      if (item.left < viewport.left) strip.scrollLeft += item.left - viewport.left - 4;
      else if (item.right > viewport.right) strip.scrollLeft += item.right - viewport.right + 4;
    };
    revealActive();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealActive);
    observer?.observe(nav);
    observer?.observe(strip);
    window.addEventListener('resize', revealActive);
    return () => { observer?.disconnect(); window.removeEventListener('resize', revealActive); };
  }, [language, pathname]);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = buttons.current[open]?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) });
    };
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !buttons.current[open]?.contains(target)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { keepOpen(); setOpen(null); buttons.current[open]?.focus(); }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, width, language]);
  const focusFirst = () => requestAnimationFrame(() => popup.current?.querySelector<HTMLAnchorElement>('a')?.focus());
  const linkClass = `cnp-motion editorial-focus-ring relative min-h-[44px] items-center rounded-editorial-sm px-2.5 py-1.5 text-xs font-semibold tracking-normal transition-colors sm:px-3 sm:text-[13px] md:text-sm xl:text-[14.5px] ${language === 'en' ? 'md:px-2 xl:px-[7px]' : 'xl:px-3.5'}`;
  return (
    <nav ref={navRef} aria-label={language === 'hi' ? 'मुख्य नेविगेशन' : 'Main Navigation'} className={`flex shrink-0 items-center gap-0.5 whitespace-nowrap sm:gap-1 ${language === 'en' ? 'md:gap-0.5 xl:gap-0.5' : 'xl:gap-1.5'} ${className}`}>
      {HOMEPAGE_NAVIGATION.map(item => {
        const active = isReaderNavigationItemActive(pathname, item);
        const classes = `${linkClass} inline-flex ${active ? 'text-brand-500 font-bold dark:text-brand-400' : 'text-zinc-700 hover:text-brand-500 dark:text-zinc-300 dark:hover:text-brand-400'}`;
        const content = <><span>{language === 'hi' ? item.name : item.nameEn}</span>{active && <span aria-hidden="true" className="absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-full bg-brand-500 dark:bg-brand-400" />}</>;
        return item.children ? (
          <button key={item.id} ref={element => { buttons.current[item.id] = element; }} type="button"
            className={`${classes} gap-1`} data-nav-active={active || undefined} aria-expanded={open === item.id} aria-controls={`reader-dropdown-${item.id}`} aria-haspopup="true"
            onMouseEnter={() => {
              if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
              keepOpen();
              if (open !== item.id) hoverOpened.current = item.id;
              setOpen(item.id);
            }} onMouseLeave={() => { hoverOpened.current = null; closeSoon(); }}
            onClick={event => {
              keepOpen();
              const justHovered = event.detail > 0 && hoverOpened.current === item.id;
              hoverOpened.current = null;
              setOpen(previous => justHovered ? item.id : previous === item.id ? null : item.id);
            }}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey && open === item.id)) {
                event.preventDefault(); keepOpen(); setOpen(item.id); focusFirst();
              }
            }}>
            {content}<ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 ${open === item.id ? 'rotate-180' : ''}`} />
          </button>
        ) : <Link key={item.id} href={item.href} data-nav-active={active || undefined} aria-current={active ? 'page' : undefined} className={classes}>{content}</Link>;
      })}
      {mounted && current && createPortal(
        <div ref={popup} id={`reader-dropdown-${current.id}`} aria-label={`${current.nameEn} destinations`}
          style={{ position: 'fixed', ...position, width, maxWidth: 'calc(100vw - 16px)' }}
          className="z-[80] pt-1" onMouseEnter={keepOpen} onMouseLeave={closeSoon}
          onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== buttons.current[current.id]) setOpen(null); }}>
          <div className="rounded-editorial-md border border-zinc-200 bg-white p-1.5 shadow-editorial-lg dark:border-zinc-800 dark:bg-[#16161c]">
            {current.children!.map(link => (
              <Link key={link.href} href={link.href} aria-current={isReaderNavigationActive(pathname, link.href) ? 'page' : undefined}
                onClick={() => setOpen(null)} className={`editorial-focus-ring flex min-h-[44px] items-center rounded-editorial-sm px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40 ${isReaderNavigationActive(pathname, link.href) ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/40' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {language === 'hi' ? link.name : link.nameEn}
              </Link>
            ))}
          </div>
        </div>, document.body)}
    </nav>
  );
}
