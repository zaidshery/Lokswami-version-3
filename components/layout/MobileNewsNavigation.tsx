'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { HOMEPAGE_NAVIGATION, isReaderNavigationActive, isReaderNavigationItemActive } from '@/lib/constants/readerNavigation';

export default function MobileNewsNavigation({ language, onNavigate }: { language: 'hi' | 'en'; onNavigate: () => void }) {
  const pathname = usePathname();
  const prefix = useId();
  const [open, setOpen] = useState<string | null>(null);
  const base = 'reader-focus-ring flex min-h-12 w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40';
  return <nav aria-label={language === 'hi' ? 'समाचार नेविगेशन' : 'News navigation'} className="mt-2 space-y-1">
    {HOMEPAGE_NAVIGATION.map(item => {
      const active = isReaderNavigationItemActive(pathname, item);
      const label = language === 'hi' ? item.name : item.nameEn;
      const classes = `${base} ${active ? 'text-brand-600 bg-brand-50 dark:bg-brand-950/40' : 'text-zinc-900 dark:text-zinc-100'}`;
      return item.children ? <div key={item.id}>
        <button type="button" className={classes} aria-expanded={open === item.id} aria-controls={`${prefix}-${item.id}`}
          onClick={() => setOpen(previous => previous === item.id ? null : item.id)}>
          {label}<ChevronDown aria-hidden="true" className={`h-4 w-4 ${open === item.id ? 'rotate-180' : ''}`} />
        </button>
        <div id={`${prefix}-${item.id}`} hidden={open !== item.id} className="ml-3 border-l border-zinc-200 pl-2 dark:border-zinc-800">
          {item.children.map(child => <Link key={child.href} href={child.href}
            onClick={onNavigate} aria-current={isReaderNavigationActive(pathname, child.href) ? 'page' : undefined}
            className={`${base} ${isReaderNavigationActive(pathname, child.href) ? 'text-brand-600 bg-brand-50 dark:bg-brand-950/40' : 'text-zinc-700 dark:text-zinc-300'}`}>
            {language === 'hi' ? child.name : child.nameEn}
          </Link>)}
        </div>
      </div> : <Link key={item.id} href={item.href} className={classes} onClick={onNavigate} aria-current={active ? 'page' : undefined}>{label}</Link>;
    })}
  </nav>;
}
