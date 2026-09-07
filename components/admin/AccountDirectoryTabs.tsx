'use client';

import Link from 'next/link';
import { ShieldCheck, Users } from 'lucide-react';

type AccountDirectoryTabsProps = {
  active: 'readers' | 'newsroom';
};

const tabs = [
  {
    key: 'readers' as const,
    href: '/admin/users',
    label: 'Readers & Subscribers',
    description: 'Accounts, WhatsApp subscriptions and access status',
    icon: Users,
  },
  {
    key: 'newsroom' as const,
    href: '/admin/team',
    label: 'Newsroom Team',
    description: 'Editorial roles, setup links and staff access',
    icon: ShieldCheck,
  },
];

export default function AccountDirectoryTabs({ active }: AccountDirectoryTabsProps) {
  return (
    <nav
      aria-label="Account data management"
      className="grid gap-2 rounded-[20px] border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] p-2 sm:grid-cols-2"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.key;

        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${
              isActive
                ? 'border-red-500/30 bg-white text-zinc-950 shadow-sm dark:bg-zinc-900 dark:text-white'
                : 'border-transparent text-[color:var(--admin-shell-text-muted)] hover:border-[color:var(--admin-shell-border)] hover:bg-[color:var(--admin-shell-surface)]'
            }`}
          >
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? 'bg-red-600 text-white' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{tab.label}</span>
              <span className="hidden truncate text-xs font-medium text-[color:var(--admin-shell-text-muted)] md:block">
                {tab.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
