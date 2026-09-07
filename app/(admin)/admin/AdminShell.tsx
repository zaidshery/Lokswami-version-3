'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Activity,
  ClipboardList,
  BarChart3,
  BellRing,
  BookOpen,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Newspaper,
  ListChecks,
  Settings,
  Settings2,
  Search,
  ShieldCheck,
  Share2,
  Sun,
  UserCog,
  Users,
  Video,
  X,
} from 'lucide-react';
import Logo from '@/components/layout/Logo';
import {
  formatUserRoleLabel,
  isAdminRole,
  isCopyEditorRole,
  isReporterDeskRole,
  isSuperAdminRole,
  type AdminRole,
  type UserRole,
} from '@/lib/auth/roles';
import { canViewPage, type AdminPageKey } from '@/lib/auth/permissions';
import { useAppStore } from '@/lib/store/appStore';
import WorkflowNotificationBell from '@/components/admin/WorkflowNotificationBell';

type SidebarItem = {
  href: string;
  labelEn: string;
  labelHi: string;
  icon: typeof LayoutDashboard;
  pageKey: AdminPageKey;
  section: SidebarSectionId;
  visibleRoles?: readonly AdminRole[];
};

type SidebarSectionId = 'workflow' | 'content' | 'insights' | 'governance';

type SidebarSection = {
  labelEn: string;
  labelHi: string;
  items: SidebarItem[];
};

type AdminShellUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: UserRole;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const HI = {
  adminPanel: '\u090f\u0921\u092e\u093f\u0928 \u092a\u0948\u0928\u0932',
  copyEditorPanel: '\u0915\u0949\u092a\u0940 \u090f\u0921\u093f\u091f\u0930 \u092a\u0948\u0928\u0932',
  reporterPanel: '\u0930\u093f\u092a\u094b\u0930\u094d\u091f\u0930 \u092a\u0948\u0928\u0932',
  leadershipConsole: '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940 \u0932\u0940\u0921\u0930\u0936\u093f\u092a',
  adminDashboard: '\u090f\u0921\u092e\u093f\u0928 \u0921\u0948\u0936\u092c\u094b\u0930\u094d\u0921',
  copyEditorDashboard: '\u0915\u0949\u092a\u0940 \u090f\u0921\u093f\u091f\u0930 \u0921\u0948\u0936\u092c\u094b\u0930\u094d\u0921',
  reporterDesk: '\u0930\u093f\u092a\u094b\u0930\u094d\u091f\u0930 \u0921\u0947\u0938\u094d\u0915',
  leadershipDashboard: '\u0932\u094b\u0915\u0938\u094d\u0935\u093e\u092e\u0940 \u0932\u0940\u0921\u0930\u0936\u093f\u092a',
  dashboard: '\u0921\u0948\u0936\u092c\u094b\u0930\u094d\u0921',
  newsroomOverview: '\u0928\u094d\u092f\u0942\u091c\u0930\u0942\u092e \u0913\u0935\u0930\u0935\u094d\u092f\u0942',
  reviewQueue: '\u0930\u093f\u0935\u094d\u092f\u0942 \u0915\u094d\u092f\u0942',
  assignments: '\u0905\u0938\u093e\u0907\u0928\u092e\u0947\u0902\u091f\u094d\u0938',
  contentQueue: '\u0915\u0902\u091f\u0947\u0902\u091f \u0915\u094d\u092f\u0942',
  pushAlerts: '\u092a\u0941\u0936 \u0905\u0932\u0930\u094d\u091f\u094d\u0938',
  copyDesk: '\u0915\u0949\u092a\u0940 \u0921\u0947\u0938\u094d\u0915',
  myWork: '\u092e\u0947\u0930\u093e \u0915\u093e\u092e',
  workQueue: '\u0935\u0930\u094d\u0915 \u0915\u094d\u092f\u0942',
  articles: '\u0932\u0947\u0916',
  myArticles: '\u092e\u0947\u0930\u0947 \u0932\u0947\u0916',
  myStories: '\u092e\u0947\u0930\u0940 \u0938\u094d\u091f\u094b\u0930\u0940\u091c\u093c',
  categories: '\u0936\u094d\u0930\u0947\u0923\u093f\u092f\u093e\u0901',
  polls: '\u092a\u094b\u0932\u094d\u0938',
  stories: '\u0938\u094d\u091f\u094b\u0930\u0940\u091c\u093c',
  articleCreate: '\u0932\u0947\u0916 \u092c\u0928\u093e\u090f\u0902',
  videos: '\u0935\u0940\u0921\u093f\u092f\u094b',
  socialPosts: '\u0938\u094b\u0936\u0932 \u092a\u094b\u0938\u094d\u091f',
  epapers: '\u0908-\u092a\u0947\u092a\u0930',
  emagazines: '\u0908-\u092e\u0948\u0917\u091c\u093c\u0940\u0928',
  media: '\u092e\u0940\u0921\u093f\u092f\u093e',
  analytics: '\u090f\u0928\u093e\u0932\u093f\u091f\u093f\u0915\u094d\u0938',
  revenue: '\u0930\u0947\u0935\u0947\u0928\u094d\u092f\u0942 \u0914\u0930 \u090f\u0921\u094d\u0938',
  auditLog: '\u0911\u0921\u093f\u091f \u0932\u0949\u0917',
  permissionReview: '\u092a\u0930\u092e\u093f\u0936\u0928 \u0930\u093f\u0935\u094d\u092f\u0942',
  operationsDiagnostics: '\u0911\u092a\u0930\u0947\u0936\u0928 \u0921\u093e\u092f\u0917\u094d\u0928\u094b\u0938\u094d\u091f\u093f\u0915\u094d\u0938',
  operationsCenter: '\u0911\u092a\u0930\u0947\u0936\u0928 \u0938\u0947\u0902\u091f\u0930',
  team: '\u091f\u0940\u092e',
  settings: '\u0938\u0947\u091f\u093f\u0902\u0917\u094d\u0938',
  newsroomSettings: '\u0928\u094d\u092f\u0942\u091c\u0930\u0942\u092e \u0938\u0947\u091f\u093f\u0902\u0917\u094d\u0938',
  logout: '\u0932\u0949\u0917\u0906\u0909\u091f',
  viewSite: '\u0938\u093e\u0907\u091f \u0926\u0947\u0916\u0947\u0902',
  language: '\u092d\u093e\u0937\u093e',
  switchToHindi: '\u0939\u093f\u0928\u094d\u0926\u0940 \u092e\u0947\u0902 \u092c\u0926\u0932\u0947\u0902',
  switchToEnglish: '\u0905\u0902\u0917\u094d\u0930\u0947\u091c\u0940 \u092e\u0947\u0902 \u092c\u0926\u0932\u0947\u0902',
  theme: '\u0925\u0940\u092e',
  lightTheme: '\u0932\u093e\u0907\u091f',
  darkTheme: '\u0921\u093e\u0930\u094d\u0915',
} as const;

const ADMIN_SURFACES: SidebarItem[] = [
  { icon: LayoutDashboard, labelEn: 'Dashboard', labelHi: HI.dashboard, href: '/admin', pageKey: 'dashboard', section: 'workflow' },
  { icon: ClipboardList, labelEn: 'Work Queue', labelHi: HI.workQueue, href: '/admin/work', pageKey: 'work_queue', section: 'workflow' },
  { icon: BellRing, labelEn: 'Push Alerts', labelHi: HI.pushAlerts, href: '/admin/push-alerts', pageKey: 'push_alerts', section: 'workflow' },
  { icon: FileText, labelEn: 'Copy Desk', labelHi: HI.copyDesk, href: '/admin/copy-desk', pageKey: 'copy_desk', section: 'workflow' },
  { icon: UserCog, labelEn: 'Team', labelHi: HI.team, href: '/admin/team', pageKey: 'team', section: 'workflow' },
  { icon: Activity, labelEn: 'Operations Center', labelHi: HI.operationsCenter, href: '/admin/operations', pageKey: 'operations_center', section: 'workflow' },
  { icon: FileText, labelEn: 'Articles', labelHi: HI.articles, href: '/admin/articles', pageKey: 'articles', section: 'content' },
  { icon: FileText, labelEn: 'Article Create', labelHi: HI.articleCreate, href: '/admin/articles/new', pageKey: 'article_create', section: 'content', visibleRoles: ['reporter'] },
  { icon: FileText, labelEn: 'Stories', labelHi: HI.stories, href: '/admin/stories', pageKey: 'stories', section: 'content' },
  { icon: Video, labelEn: 'Videos', labelHi: HI.videos, href: '/admin/videos', pageKey: 'videos', section: 'content' },
  { icon: Share2, labelEn: 'Social Posts', labelHi: HI.socialPosts, href: '/admin/social-posts', pageKey: 'social_posts', section: 'content' },
  { icon: Newspaper, labelEn: 'E-Papers', labelHi: HI.epapers, href: '/admin/epapers', pageKey: 'epapers', section: 'content' },
  { icon: BookOpen, labelEn: 'E-Magazines', labelHi: HI.emagazines, href: '/admin/emagazines', pageKey: 'epapers', section: 'content' },
  { icon: ImageIcon, labelEn: 'Media', labelHi: HI.media, href: '/admin/media', pageKey: 'media', section: 'content' },
  { icon: ListChecks, labelEn: 'Polls', labelHi: HI.polls, href: '/admin/polls', pageKey: 'polls', section: 'content' },
  { icon: FolderOpen, labelEn: 'Categories', labelHi: HI.categories, href: '/admin/categories', pageKey: 'categories', section: 'content' },
  { icon: BellRing, labelEn: 'Contact Messages', labelHi: '\u0938\u0902\u092a\u0930\u094d\u0915 \u0938\u0902\u0926\u0947\u0936', href: '/admin/contact-messages', pageKey: 'contact_messages', section: 'content' },
  { icon: BarChart3, labelEn: 'Analytics', labelHi: HI.analytics, href: '/admin/analytics', pageKey: 'analytics', section: 'insights' },
  { icon: BarChart3, labelEn: 'Business Value', labelHi: '\u092c\u093f\u091c\u093c\u0928\u0947\u0938 \u0935\u0948\u0932\u094d\u092f\u0942', href: '/admin/analytics/business-value', pageKey: 'business_value', section: 'insights' },
  { icon: BarChart3, labelEn: 'Revenue', labelHi: HI.revenue, href: '/admin/revenue', pageKey: 'revenue', section: 'insights' },
  { icon: Settings2, labelEn: 'AI Ops', labelHi: '\u090f\u0906\u0908 \u0911\u092a\u0930\u0947\u0936\u0902\u0938', href: '/admin/ai', pageKey: 'ai_ops', section: 'insights' },
  { icon: ClipboardList, labelEn: 'Audit Log', labelHi: HI.auditLog, href: '/admin/audit-log', pageKey: 'audit_log', section: 'governance' },
  { icon: ShieldCheck, labelEn: 'Permission Review', labelHi: HI.permissionReview, href: '/admin/permission-review', pageKey: 'permission_review', section: 'governance' },
  { icon: Users, labelEn: 'Users & Subscribers', labelHi: 'उपयोगकर्ता एवं ग्राहक', href: '/admin/users', pageKey: 'users', section: 'governance' },
  { icon: Activity, labelEn: 'Operations Diagnostics', labelHi: HI.operationsDiagnostics, href: '/admin/operations-diagnostics', pageKey: 'operations_diagnostics', section: 'governance' },
  { icon: Activity, labelEn: 'Elections', labelHi: '\u091a\u0941\u0928\u093e\u0935', href: '/admin/settings/elections', pageKey: 'newsroom_settings', section: 'governance' },
  { icon: Settings2, labelEn: 'Newsroom Settings', labelHi: HI.newsroomSettings, href: '/admin/settings/newsroom', pageKey: 'newsroom_settings', section: 'governance' },
  { icon: Settings, labelEn: 'Settings', labelHi: HI.settings, href: '/admin/settings', pageKey: 'settings', section: 'governance' },
];

const ADMIN_MOBILE_DOCK_HREFS = [
  '/admin',
  '/admin/work',
  '/admin/copy-desk',
  '/admin/push-alerts',
  '/admin/team',
] as const;

const COPY_EDITOR_MOBILE_DOCK_HREFS = [
  '/admin',
  '/admin/work',
  '/admin/copy-desk',
  '/admin/articles',
  '/admin/media',
] as const;

const SUPER_ADMIN_MOBILE_DOCK_HREFS = [
  '/admin',
  '/admin/work',
  '/admin/analytics',
  '/admin/operations',
  '/admin/settings',
] as const;

function getSidebarItems(role: UserRole | undefined): SidebarItem[] {
  if (!isAdminRole(role)) return [];

  return ADMIN_SURFACES.filter(
    (surface) =>
      canViewPage(role, surface.pageKey) &&
      (!surface.visibleRoles || surface.visibleRoles.includes(role))
  ).map((surface) =>
    role === 'reporter' && surface.pageKey === 'stories'
      ? { ...surface, labelEn: 'My Stories', labelHi: HI.myStories }
      : surface
  );
}

function getSidebarSections(
  role: UserRole | undefined,
  sidebarItems: SidebarItem[]
): SidebarSection[] {
  if (isReporterDeskRole(role)) {
    return [{ labelEn: 'Reporter Desk', labelHi: HI.reporterDesk, items: sidebarItems }];
  }

  const labels: Array<{ id: SidebarSectionId; labelEn: string; labelHi: string }> = [
    { id: 'workflow', labelEn: 'Desk Workflow', labelHi: '\u0921\u0947\u0938\u094d\u0915 \u0935\u0930\u094d\u0915\u092b\u094d\u0932\u094b' },
    { id: 'content', labelEn: 'Content', labelHi: '\u0915\u0902\u091f\u0947\u0902\u091f' },
    { id: 'insights', labelEn: 'Insights', labelHi: '\u0907\u0928\u0938\u093e\u0907\u091f\u094d\u0938' },
    { id: 'governance', labelEn: 'Governance & Settings', labelHi: '\u0917\u0935\u0930\u094d\u0928\u0947\u0902\u0938 \u0914\u0930 \u0938\u0947\u091f\u093f\u0902\u0917\u094d\u0938' },
  ];

  return labels
    .map(({ id, labelEn, labelHi }) => ({
      labelEn,
      labelHi,
      items: sidebarItems.filter((item) => item.section === id),
    }))
    .filter((section) => section.items.length > 0);
}

function getMobileDockItems(
  role: UserRole | undefined,
  sidebarItems: SidebarItem[]
): SidebarItem[] {
  if (isReporterDeskRole(role)) {
    return sidebarItems;
  }

  if (isCopyEditorRole(role)) {
    return COPY_EDITOR_MOBILE_DOCK_HREFS
      .map((href) => sidebarItems.find((item) => item.href === href))
      .filter((item): item is SidebarItem => Boolean(item));
  }

  if (role === 'admin') {
    return ADMIN_MOBILE_DOCK_HREFS
      .map((href) => sidebarItems.find((item) => item.href === href))
      .filter((item): item is SidebarItem => Boolean(item));
  }

  if (isSuperAdminRole(role)) {
    return SUPER_ADMIN_MOBILE_DOCK_HREFS
      .map((href) => sidebarItems.find((item) => item.href === href))
      .filter((item): item is SidebarItem => Boolean(item));
  }

  return [];
}

function getMobileDockGridClass(itemCount: number) {
  switch (itemCount) {
    case 4:
      return 'grid-cols-4';
    case 5:
      return 'grid-cols-5';
    default:
      return 'grid-cols-4';
  }
}

function isActiveNavItem(pathname: string, href: string) {
  const hrefPath = href.split('?')[0] || href;
  if (hrefPath === '/admin') {
    return pathname === '/admin';
  }

  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

function findActiveSidebarItem(pathname: string, items: SidebarItem[]) {
  return items
    .filter((item) => isActiveNavItem(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length)[0];
}

function trapTabKey(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return;

  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getConsoleLabel(role: UserRole | undefined, isHindi: boolean) {
  if (isSuperAdminRole(role)) {
    return isHindi ? HI.leadershipConsole : 'Lokswami Leadership';
  }

  if (isReporterDeskRole(role)) {
    return isHindi ? HI.reporterPanel : 'Reporter Panel';
  }

  if (isCopyEditorRole(role)) {
    return isHindi ? HI.copyEditorPanel : 'Copy Editor Panel';
  }

  return isHindi ? HI.adminPanel : 'Admin Panel';
}

function getHeaderLabel(role: UserRole | undefined, isHindi: boolean) {
  if (isSuperAdminRole(role)) {
    return isHindi ? HI.leadershipDashboard : 'Lokswami Leadership';
  }

  if (isReporterDeskRole(role)) {
    return isHindi ? HI.reporterDesk : 'Reporter Desk';
  }

  if (isCopyEditorRole(role)) {
    return isHindi ? HI.copyEditorDashboard : 'Copy Editor Dashboard';
  }

  return isHindi ? HI.adminDashboard : 'Admin Dashboard';
}

function ThemeModeSwitcher({
  theme,
  isHindi,
  onChange,
  alwaysShowLabels = false,
}: {
  theme: 'dark' | 'light';
  isHindi: boolean;
  onChange: (theme: 'dark' | 'light') => void;
  alwaysShowLabels?: boolean;
}) {
  const options = [
    {
      value: 'light' as const,
      label: isHindi ? HI.lightTheme : 'Light',
      icon: Sun,
    },
    {
      value: 'dark' as const,
      label: isHindi ? HI.darkTheme : 'Dark',
      icon: Moon,
    },
  ];

  return (
    <div className="admin-shell-segmented inline-flex items-center rounded-2xl p-1">
      {options.map((option) => {
        const isActive = theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            aria-label={`Switch to ${option.label} theme`}
            data-active={isActive ? 'true' : 'false'}
            className="admin-shell-segmented-option inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold"
          >
            <option.icon className="h-4 w-4" />
            <span className={alwaysShowLabels ? 'inline' : 'hidden sm:inline'}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function AdminShell({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser: AdminShellUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toolSearch, setToolSearch] = useState('');
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const mobileNavButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const mobileToolsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileToolsMenuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme, language, toggleLanguage } = useAppStore();

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    setMobileToolsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileNavOpen(false);
        setMobileToolsOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;

    if (mobileNavOpen || mobileToolsOpen) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileNavOpen, mobileToolsOpen]);

  useEffect(() => {
    if (mobileNavOpen) {
      setMobileToolsOpen(false);
    }
  }, [mobileNavOpen]);

  useEffect(() => {
    const drawer = mobileDrawerRef.current;
    if (!drawer) return;

    drawer.toggleAttribute('inert', !mobileNavOpen);
    if (mobileNavOpen) {
      window.requestAnimationFrame(() => {
        drawer.querySelector<HTMLElement>('button[aria-label="Close navigation"]')?.focus();
      });
    }
  }, [mobileNavOpen]);

  useEffect(() => {
    if (mobileToolsOpen) {
      window.requestAnimationFrame(() => {
        mobileToolsMenuRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
      });
    }
  }, [mobileToolsOpen]);

  useEffect(() => {
    if (!mobileNavOpen && !mobileToolsOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (mobileNavOpen) {
        setMobileNavOpen(false);
        window.requestAnimationFrame(() => mobileNavButtonRef.current?.focus());
      } else {
        setMobileToolsOpen(false);
        window.requestAnimationFrame(() => mobileToolsButtonRef.current?.focus());
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileNavOpen, mobileToolsOpen]);

  const resolvedUser = {
    name: initialUser.name ?? null,
    email: initialUser.email ?? null,
    image: initialUser.image ?? null,
    role: initialUser.role as UserRole | undefined,
  };
  const isHindi = isHydrated ? language === 'hi' : true;
  const effectiveTheme = isHydrated ? theme : 'dark';
  const sidebarItems = useMemo(() => getSidebarItems(resolvedUser.role), [resolvedUser.role]);
  const sidebarSections = useMemo(
    () => {
      const query = toolSearch.trim().toLocaleLowerCase();
      const matches = query
        ? sidebarItems.filter((item) =>
            `${item.labelEn} ${item.labelHi}`.toLocaleLowerCase().includes(query)
          )
        : sidebarItems;
      return getSidebarSections(resolvedUser.role, matches).filter((section) => section.items.length);
    },
    [resolvedUser.role, sidebarItems, toolSearch]
  );
  const mobileDockItems = useMemo(
    () => getMobileDockItems(resolvedUser.role, sidebarItems),
    [resolvedUser.role, sidebarItems]
  );
  const adminName =
    resolvedUser.name?.trim() ||
    resolvedUser.email?.split('@')[0]?.trim() ||
    'Admin';
  const adminEmail = resolvedUser.email?.trim() || '';
  const adminImage = resolvedUser.image?.trim() || '';
  const adminRoleLabel = formatUserRoleLabel(resolvedUser.role);
  const adminInitial = (adminName.charAt(0) || 'A').toUpperCase();
  const consoleLabel = getConsoleLabel(resolvedUser.role, isHindi);
  const activeSidebarItem = findActiveSidebarItem(pathname, sidebarItems);
  const headerLabel = activeSidebarItem
    ? isHindi
      ? activeSidebarItem.labelHi
      : activeSidebarItem.labelEn
    : getHeaderLabel(resolvedUser.role, isHindi);
  const isReporterView = isReporterDeskRole(resolvedUser.role);
  const isCopyEditorView = isCopyEditorRole(resolvedUser.role);
  const sidebarLabel = isReporterView
    ? adminName
    : isCopyEditorView
      ? adminName
      : consoleLabel;
  const headerSubtitle = isReporterView || isCopyEditorView
    ? adminName
    : adminRoleLabel;
  const hasMobileDock = mobileDockItems.length > 0;
  const mobileHeaderLabel = headerLabel;

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
    } catch {
      // Ignore client sign-out errors and still force navigation to signin.
    }

    router.push('/signin');
    router.refresh();
  };

  const sidebarContent = (
    <>
      <div className="flex h-[68px] items-center gap-3 border-b border-[color:var(--admin-shell-border)] px-4">
        <Link href="/admin" className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex-shrink-0">
            <Logo size="sm" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs text-[color:var(--admin-shell-text-muted)]">
              {sidebarLabel}
            </div>
            <div className="truncate text-[11px] font-semibold text-[color:var(--admin-shell-text)]">
              {adminRoleLabel}
            </div>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => {
            setMobileNavOpen(false);
            window.requestAnimationFrame(() => mobileNavButtonRef.current?.focus());
          }}
          className="admin-shell-toolbar-btn inline-flex h-10 w-10 items-center justify-center rounded-xl lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pt-3">
        <label className="flex items-center gap-2 rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-3 focus-within:ring-2 focus-within:ring-red-500">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[color:var(--admin-shell-text-muted)]" />
          <input
            type="search"
            value={toolSearch}
            onChange={(event) => setToolSearch(event.target.value)}
            aria-label={isHindi ? 'न्यूजरूम टूल खोजें' : 'Find newsroom tools'}
            placeholder={isHindi ? 'टूल खोजें…' : 'Find a tool…'}
            className="h-11 min-w-0 w-full bg-transparent text-sm text-[color:var(--admin-shell-text)] outline-none"
          />
        </label>
      </div>
      <nav aria-label="Newsroom tools" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 pb-20">
        {sidebarSections.length === 0 ? (
          <div role="status" className="px-2 py-3 text-sm text-[color:var(--admin-shell-text-muted)]">
            <p>{isHindi ? 'कोई टूल नहीं मिला।' : 'No matching tools.'}</p>
            <button type="button" onClick={() => setToolSearch('')} className="mt-2 min-h-11 font-semibold text-red-600 dark:text-red-400">
              {isHindi ? 'खोज साफ़ करें' : 'Clear search'}
            </button>
          </div>
        ) : null}
        {sidebarSections.map((section) => (
          <div key={section.labelEn} className="space-y-1.5">
            <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[color:var(--admin-shell-text-muted)]">
              {isHindi ? section.labelHi : section.labelEn}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = activeSidebarItem?.href === item.href;

                return (
                  <Link
                    key={`${item.href}-${item.labelEn}`}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all ${
                      isActive
                        ? 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-300'
                        : 'text-[color:var(--admin-shell-text-muted)] hover:bg-[color:var(--admin-shell-surface-muted)] hover:text-[color:var(--admin-shell-text)]'
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                          : 'bg-[color:var(--admin-shell-surface-muted)] text-[color:var(--admin-shell-text-muted)] group-hover:text-[color:var(--admin-shell-text)]'
                      }`}
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                    </div>
                    <span className="truncate text-[13px] font-semibold">
                      {isHindi ? item.labelHi : item.labelEn}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[color:var(--admin-shell-border)] p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[color:var(--admin-shell-text-muted)] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          type="button"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">{isHindi ? HI.logout : 'Logout'}</span>
        </button>
      </div>
    </>
  );

  return (
    <div
      suppressHydrationWarning
      className="admin-shell min-h-screen text-[color:var(--admin-shell-text)] transition-colors lg:flex lg:h-screen lg:overflow-hidden"
    >
      {mobileNavOpen || mobileToolsOpen ? (
        <button
          type="button"
          aria-label={mobileNavOpen ? 'Close mobile navigation' : 'Close mobile tools'}
          onClick={() => {
            const restoreTarget = mobileNavOpen
              ? mobileNavButtonRef.current
              : mobileToolsButtonRef.current;
            setMobileNavOpen(false);
            setMobileToolsOpen(false);
            window.requestAnimationFrame(() => restoreTarget?.focus());
          }}
          className="fixed inset-0 z-30 bg-black/55 lg:hidden"
        />
      ) : null}
      <aside
        className="admin-shell-surface-strong fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col overflow-hidden border-r border-[color:var(--admin-shell-border-strong)] lg:flex"
      >
        {sidebarContent}
      </aside>
      <aside
        ref={mobileDrawerRef}
        id="admin-mobile-navigation"
        aria-hidden={!mobileNavOpen}
        onKeyDown={trapTabKey}
        className={cx(
          'admin-shell-surface-strong fixed inset-y-0 left-0 z-40 flex w-[min(86vw,320px)] flex-col overflow-hidden border-r border-[color:var(--admin-shell-border-strong)] transition-transform duration-300 lg:hidden',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>

      <main
        className="relative min-h-screen min-w-0 flex-1 overflow-y-auto transition-colors lg:ml-[248px] lg:h-screen"
      >
        <header
          className={cx(
            'admin-shell-surface fixed left-0 right-0 top-0 flex h-[68px] flex-nowrap items-center justify-between gap-3 border-b border-[color:var(--admin-shell-border)] px-4 sm:px-6 lg:left-[248px]',
            mobileToolsOpen ? 'z-50' : 'z-20'
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              ref={mobileNavButtonRef}
              type="button"
              onClick={() => setMobileNavOpen((current) => !current)}
              className="admin-shell-toolbar-btn inline-flex h-10 w-10 items-center justify-center rounded-xl lg:hidden"
              aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileNavOpen}
              aria-controls="admin-mobile-navigation"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-[color:var(--admin-shell-text)] sm:text-lg">
                <span className="sm:hidden">{mobileHeaderLabel}</span>
                <span className="hidden sm:inline">{headerLabel}</span>
              </p>
              <p className="truncate text-xs text-[color:var(--admin-shell-text-muted)]">
                {headerSubtitle}
              </p>
            </div>
          </div>

          <div className="relative ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <WorkflowNotificationBell />
            <button
              onClick={toggleLanguage}
              className="admin-shell-toolbar-btn hidden items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold sm:inline-flex"
              aria-label={isHindi ? 'Switch to English' : 'Switch to Hindi'}
              type="button"
            >
              <Languages className="h-3.5 w-3.5" />
              <span>{isHindi ? '\u0939\u093f' : 'EN'}</span>
            </button>
            <button
              ref={mobileToolsButtonRef}
              type="button"
              onClick={() => {
                setMobileNavOpen(false);
                setMobileToolsOpen((current) => !current);
              }}
              className="admin-shell-toolbar-btn inline-flex h-10 w-10 items-center justify-center rounded-xl sm:hidden"
              aria-label={mobileToolsOpen ? 'Close display and language tools' : 'Open display and language tools'}
              aria-expanded={mobileToolsOpen}
              aria-controls="admin-mobile-tools-menu"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <div className="hidden sm:block">
              <ThemeModeSwitcher
                theme={effectiveTheme}
                isHindi={isHindi}
                onChange={setTheme}
                alwaysShowLabels={false}
              />
            </div>
            <Link
              href="/main"
              className="admin-shell-toolbar-btn hidden rounded-xl px-3 py-2 text-sm font-medium md:inline-flex"
            >
              {isHindi ? HI.viewSite : 'View Site'}
            </Link>
            <div className="admin-shell-surface hidden rounded-2xl px-3 py-2 text-right sm:block">
              <p className="text-sm font-semibold text-[color:var(--admin-shell-text)]">
                {adminName}
              </p>
              {adminEmail ? (
                <p className="text-xs text-[color:var(--admin-shell-text-muted)]">{adminEmail}</p>
              ) : null}
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-red-600 shadow-sm ring-1 ring-white/10">
              {adminImage ? (
                <Image
                  src={adminImage}
                  alt={adminName}
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-sm font-bold text-white">{adminInitial}</span>
              )}
            </div>

            {mobileToolsOpen ? (
              <div
                ref={mobileToolsMenuRef}
                id="admin-mobile-tools-menu"
                role="dialog"
                aria-label="Display and language tools"
                onKeyDown={trapTabKey}
                className="admin-shell-surface-strong absolute right-0 top-12 z-50 w-[min(calc(100vw-2rem),18rem)] rounded-[24px] p-3 shadow-[var(--admin-shell-shadow-strong)] sm:hidden"
              >
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">
                  {isHindi ? HI.language : 'Language'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    toggleLanguage();
                    setMobileToolsOpen(false);
                  }}
                  aria-label={isHindi ? HI.switchToEnglish : HI.switchToHindi}
                  className="admin-shell-toolbar-btn mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-sm font-semibold [&>span:first-child]:hidden"
                >
                  <span>{isHindi ? 'English' : 'हिन्दी'}</span>
                  <span>{isHindi ? HI.switchToEnglish : HI.switchToHindi}</span>
                  <span className="text-xs text-[color:var(--admin-shell-text-muted)]">{isHindi ? 'EN' : 'HI'}</span>
                </button>
                <div className="mt-3">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--admin-shell-text-muted)]">
                    {isHindi ? HI.theme : 'Theme'}
                  </p>
                  <div className="mt-2">
                    <ThemeModeSwitcher
                      theme={effectiveTheme}
                      isHindi={isHindi}
                      onChange={(nextTheme) => {
                        setTheme(nextTheme);
                        setMobileToolsOpen(false);
                      }}
                      alwaysShowLabels
                    />
                  </div>
                </div>
                <Link
                  href="/main"
                  onClick={() => setMobileToolsOpen(false)}
                  className="admin-shell-toolbar-btn mt-3 flex w-full items-center justify-center rounded-2xl px-3 py-2 text-sm font-medium"
                >
                  {isHindi ? HI.viewSite : 'View Site'}
                </Link>
              </div>
            ) : null}
          </div>
        </header>

        <div
          className={cx(
            'relative p-3 pt-20 sm:p-5 sm:pt-[88px] lg:p-6 lg:pt-[92px] xl:p-7 xl:pt-[96px]',
            hasMobileDock && 'pb-28 lg:pb-8'
          )}
        >
          {children}
        </div>
      </main>

      {hasMobileDock ? (
        <nav aria-label="Quick newsroom navigation" className="admin-shell-surface-strong fixed inset-x-4 bottom-4 z-20 rounded-[26px] px-2 py-2 shadow-[var(--admin-shell-shadow-strong)] lg:hidden">
          <div className={cx('grid gap-1', getMobileDockGridClass(mobileDockItems.length))}>
            {mobileDockItems.map((item) => {
              const isActive = activeSidebarItem?.href === item.href;

              return (
                <Link
                  key={`${item.href}-${item.labelEn}-mobile`}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cx(
                    'flex min-w-0 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-center text-[10px] font-semibold transition-colors',
                    isActive
                      ? 'bg-[color:var(--admin-shell-active)] text-[color:var(--admin-shell-active-text)]'
                      : 'text-[color:var(--admin-shell-text-muted)]'
                  )}
                >
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="w-full truncate">{isHindi ? item.labelHi : item.labelEn}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
