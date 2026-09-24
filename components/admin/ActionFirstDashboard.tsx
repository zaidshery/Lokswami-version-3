'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Edit3,
  FileCheck2,
  FileText,
  Inbox,
  ListChecks,
  Plus,
  Send,
  Settings,
  Sparkles,
  UserCheck,
  UserRoundX,
  Users,
  Shield,
  BookOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { WorkQueueItem, WorkQueueOverview } from '@/lib/admin/workQueue';
import type { AdminRole } from '@/lib/auth/roles';
import { useAppStore } from '@/lib/store/appStore';

type DashboardCopy = {
  eyebrow: string;
  title: string;
  summary: string;
  metricsHeading: string;
  emptyLaneFallback: string;
};

type MetricCardConfig = {
  id: string;
  label: string;
  count: number;
  href: string;
  icon: LucideIcon;
};

type ActionLaneConfig = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  items: WorkQueueItem[];
  empty: string;
};

type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  primary?: boolean;
};

type ControlPlaneShortcut = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const TERMINAL_STATUSES = new Set(['published', 'archived']);

function pretty(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dueLabel(value: string | null, language: 'en' | 'hi'): string {
  if (!value) return language === 'hi' ? 'कोई समय-सीमा नहीं' : 'No deadline';
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function priorityChip(priority: string | null | undefined, language: 'en' | 'hi') {
  if (priority === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        <span>{language === 'hi' ? 'अत्यावश्यक' : 'Urgent'}</span>
      </span>
    );
  }
  if (priority === 'high') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
        <span>{language === 'hi' ? 'उच्च' : 'High'}</span>
      </span>
    );
  }
  return null;
}

function ActionRow({ item, language }: { item: WorkQueueItem; language: 'en' | 'hi' }) {
  const isOverdue = item.isOverdue;
  return (
    <Link
      href={item.editHref}
      className="group grid gap-2 border-b border-[color:var(--admin-shell-border)] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-[color:var(--admin-shell-surface-muted)] focus-visible:bg-[color:var(--admin-shell-surface-muted)] focus-visible:outline-2 focus-visible:outline-blue-600 sm:grid-cols-[minmax(0,1fr)_130px_145px_auto] sm:items-center"
      aria-label={`${item.title}, ${item.status}, ${item.nextActionLabel}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-sm font-black text-[color:var(--admin-shell-text)]">
            {item.title}
          </p>
          {item.isBreaking ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.2 text-[10px] font-black uppercase tracking-wider text-white">
              <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
              <span>{language === 'hi' ? 'ब्रेकिंग' : 'Breaking'}</span>
            </span>
          ) : null}
          {priorityChip(item.priority, language)}
        </div>
        <p className="mt-0.5 text-xs text-[color:var(--admin-shell-text-muted)]">
          {item.publicationType === 'emagazine'
            ? 'E-Magazine'
            : pretty(item.contentType)}{' '}
          · <span className="font-semibold">{pretty(item.status)}</span>
        </p>
      </div>

      <div className="text-xs text-[color:var(--admin-shell-text-muted)]">
        <span className="font-bold text-[color:var(--admin-shell-text)]">
          {item.assignedToName || (language === 'hi' ? 'बिना ओनर' : 'Unassigned')}
        </span>
      </div>

      <div
        className={`text-xs ${
          isOverdue
            ? 'font-bold text-rose-600 dark:text-rose-400'
            : 'text-[color:var(--admin-shell-text-muted)]'
        }`}
      >
        <Clock3 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
        <span>{dueLabel(item.dueAt, language)}</span>
        {isOverdue ? (
          <span className="ml-1 text-[10px] uppercase tracking-wider">
            ({language === 'hi' ? 'देरी' : 'Late'})
          </span>
        ) : null}
      </div>

      <span className="inline-flex items-center justify-between gap-2 text-xs font-black text-blue-600 dark:text-blue-400 sm:justify-end">
        <span>{item.nextActionLabel}</span>
        <ArrowUpRight
          className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

function Lane({
  icon: Icon,
  title,
  description,
  href,
  items,
  language,
  empty,
}: ActionLaneConfig & { language: 'en' | 'hi' }) {
  return (
    <section
      className="admin-shell-surface flex flex-col justify-between overflow-hidden rounded-[22px] border border-[color:var(--admin-shell-border)] shadow-sm"
      aria-labelledby={`lane-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div>
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--admin-shell-border)] px-4 py-4 sm:px-5">
          <div className="flex min-w-0 gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h2
                id={`lane-${title.toLowerCase().replace(/\s+/g, '-')}`}
                className="text-base font-black text-[color:var(--admin-shell-text)] sm:text-lg"
              >
                {title}
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-[color:var(--admin-shell-text-muted)]">
                {description}
              </p>
            </div>
          </div>
          <Link
            href={href}
            className="admin-shell-toolbar-btn shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition hover:bg-[color:var(--admin-shell-surface-muted)] focus-visible:outline-2 focus-visible:outline-blue-600"
            aria-label={`${items.length} items in ${title}`}
          >
            {items.length}
          </Link>
        </div>

        {items.length ? (
          <div className="divide-y divide-[color:var(--admin-shell-border)]">
            {items.slice(0, 5).map((item) => (
              <ActionRow
                key={`${item.contentType}:${item.id}`}
                item={item}
                language={language}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-5 py-8 text-center">
            <p className="text-sm font-medium text-[color:var(--admin-shell-text-muted)]">
              {empty}
            </p>
          </div>
        )}
      </div>

      {items.length > 5 ? (
        <div className="border-t border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)]/50 px-4 py-2 text-right">
          <Link
            href={href}
            className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
          >
            {language === 'hi'
              ? `सभी ${items.length} आइटम देखें →`
              : `View all ${items.length} items →`}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export default function ActionFirstDashboard({
  overview,
  role,
  userName,
}: {
  overview: WorkQueueOverview;
  role: AdminRole;
  userName?: string | null;
}) {
  const language = useAppStore((state) => state.language) === 'hi' ? 'hi' : 'en';

  const active = overview.items.filter((item) => !TERMINAL_STATUSES.has(item.status));

  // Role-specific missions setup
  let copy: DashboardCopy;
  let quickActions: QuickAction[] = [];
  let controlPlaneShortcuts: ControlPlaneShortcut[] = [];
  let metrics: MetricCardConfig[] = [];
  let lanes: ActionLaneConfig[] = [];

  switch (role) {
    case 'reporter': {
      copy = {
        en: {
          eyebrow: 'Reporter Mission',
          title: 'My Assignments & Stories',
          summary:
            'Prioritize your active reporting assignments, draft writing, desk revision handoffs, and upcoming deadlines.',
          metricsHeading: 'My Reporting Workload',
          emptyLaneFallback: 'No active stories in this lane.',
        },
        hi: {
          eyebrow: 'रिपोर्टर मिशन',
          title: 'मेरा कार्य और स्टोरी असाइनमेंट',
          summary:
            'अपने सक्रिय असाइनमेंट, ड्राफ्ट लेखन, डेस्क से लौटाए गए संशोधन और आने वाली समय-सीमा पर ध्यान दें।',
          metricsHeading: 'मेरा रिपोर्टिंग वर्कलोड',
          emptyLaneFallback: 'इस सेक्शन में कोई स्टोरी लंबित नहीं है।',
        },
      }[language];

      quickActions = [
        {
          label: language === 'hi' ? 'नई स्टोरी बनाएं' : 'Create Story',
          href: '/admin/stories/new',
          icon: Plus,
          primary: true,
        },
        {
          label: language === 'hi' ? 'नया लेख लिखें' : 'Create Article',
          href: '/admin/articles/new',
          icon: FileText,
        },
        {
          label: language === 'hi' ? 'मेरा काम' : 'My Work',
          href: '/admin/my-work',
          icon: UserCheck,
        },
      ];

      // Filter Reporter Mission Items
      const draftsAndChanges = active.filter(
        (item) => item.status === 'draft' || item.status === 'changes_requested'
      );
      const assignedAndReview = active.filter(
        (item) => item.status === 'assigned' || item.status === 'in_review'
      );
      const submittedForDesk = active.filter((item) => item.status === 'submitted');
      const approvedAndDeadlines = active.filter(
        (item) => item.status === 'approved' || item.isOverdue
      );

      metrics = [
        {
          id: 'drafts',
          label: language === 'hi' ? 'ड्राफ्ट व संशोधन' : 'Drafts & Revisions',
          count: draftsAndChanges.length,
          href: '/admin/my-work',
          icon: Edit3,
        },
        {
          id: 'assigned',
          label: language === 'hi' ? 'सक्रिय असाइनमेंट' : 'Assigned to Me',
          count: active.filter((item) => item.status === 'assigned').length,
          href: '/admin/work?view=mine',
          icon: ListChecks,
        },
        {
          id: 'submitted',
          label: language === 'hi' ? 'समीक्षा में सबमिट' : 'In Review',
          count: active.filter((item) => item.status === 'submitted' || item.status === 'in_review').length,
          href: '/admin/work?view=mine',
          icon: Inbox,
        },
        {
          id: 'approved',
          label: language === 'hi' ? 'स्वीकृत स्टोरीज़' : 'Approved',
          count: active.filter((item) => item.status === 'approved').length,
          href: '/admin/work?view=mine',
          icon: CheckCircle2,
        },
        {
          id: 'overdue',
          label: language === 'hi' ? 'छूटी समय-सीमा' : 'Overdue Own Work',
          count: active.filter((item) => item.isOverdue).length,
          href: '/admin/work?view=mine',
          icon: AlertTriangle,
        },
      ];

      lanes = [
        {
          id: 'lane-reporter-revisions',
          icon: Edit3,
          title:
            language === 'hi'
              ? 'संशोधन अनुरोध और ड्राफ्ट्स'
              : 'Changes Requested & Drafts',
          description:
            language === 'hi'
              ? 'संशोधन के लिए लौटाई गई स्टोरीज़ या प्रगतिरत ड्राफ्ट्स जिन्हें पूरा करना है।'
              : 'Stories returned for revision or in-progress drafts needing your action.',
          href: '/admin/my-work',
          items: draftsAndChanges,
          empty:
            language === 'hi'
              ? 'कोई ड्राफ्ट या संशोधन के लिए स्टोरी लंबित नहीं है।'
              : 'No drafts or returned stories needing edits.',
        },
        {
          id: 'lane-reporter-assigned',
          icon: ListChecks,
          title:
            language === 'hi'
              ? 'सक्रिय असाइनमेंट और समीक्षा में'
              : 'Active Assignments & In Review',
          description:
            language === 'hi'
              ? 'असाइन की गई स्टोरीज़ और संपादकीय समीक्षा में चल रहा कार्य।'
              : 'Assigned pitches and stories currently undergoing desk review.',
          href: '/admin/work?view=mine',
          items: assignedAndReview,
          empty:
            language === 'hi'
              ? 'वर्तमान में कोई सक्रिय असाइनमेंट नहीं है।'
              : 'No active assignments in progress.',
        },
        {
          id: 'lane-reporter-submitted',
          icon: Inbox,
          title:
            language === 'hi'
              ? 'डेस्क समीक्षा के लिए सबमिट'
              : 'Submitted for Desk Review',
          description:
            language === 'hi'
              ? 'कॉपी डेस्क को भेजी गई सामग्री जो समीक्षा के इंतज़ार में है।'
              : 'Work handed off to the copy desk awaiting editorial pickup.',
          href: '/admin/work?view=mine',
          items: submittedForDesk,
          empty:
            language === 'hi'
              ? 'समीक्षा के इंतज़ार में कोई स्टोरी नहीं है।'
              : 'No submitted stories awaiting desk pickup.',
        },
        {
          id: 'lane-reporter-deadlines',
          icon: CheckCircle2,
          title:
            language === 'hi'
              ? 'स्वीकृत कार्य और समय-सीमा'
              : 'Approved & Upcoming Deadlines',
          description:
            language === 'hi'
              ? 'स्वीकृत स्टोरीज़ या जिनकी समय-सीमा नज़दीक अथवा पार हो चुकी है।'
              : 'Approved stories ready for next steps and items with approaching deadlines.',
          href: '/admin/work?view=mine',
          items: approvedAndDeadlines,
          empty:
            language === 'hi'
              ? 'कोई स्वीकृत आइटम या छूटी समय-सीमा नहीं है।'
              : 'No approved items or overdue deadlines.',
        },
      ];
      break;
    }

    case 'copy_editor': {
      copy = {
        en: {
          eyebrow: 'Copy Desk Mission',
          title: 'Editorial Review & Copy Desk',
          summary:
            'Prioritize incoming submissions, active copy editing, fact checks, revision handoffs, and approval sign-offs.',
          metricsHeading: 'Copy Desk Workload',
          emptyLaneFallback: 'No active items on the copy desk in this lane.',
        },
        hi: {
          eyebrow: 'कॉपी डेस्क मिशन',
          title: 'संपादकीय समीक्षा और कॉपी डेस्क',
          summary:
            'आने वाले सबमिशन, सक्रिय कॉपी संपादन, फैक्ट-चेक, रिपोर्टर संशोधन और अप्रूवल की प्राथमिकताओं पर कार्य करें।',
          metricsHeading: 'कॉपी डेस्क वर्कलोड',
          emptyLaneFallback: 'इस सेक्शन में कॉपी डेस्क का कोई कार्य लंबित नहीं है।',
        },
      }[language];

      quickActions = [
        {
          label: language === 'hi' ? 'कॉपी डेस्क खोलें' : 'Open Copy Desk',
          href: '/admin/copy-desk',
          icon: FileCheck2,
          primary: true,
        },
        {
          label: language === 'hi' ? 'रिव्यू क्यू' : 'Review Queue',
          href: '/admin/work?view=review',
          icon: Inbox,
        },
        {
          label: language === 'hi' ? 'नया लेख बनाएं' : 'Create Article',
          href: '/admin/articles/new',
          icon: FileText,
        },
      ];

      // Filter Copy Editor Mission Items
      const waitingReview = active.filter((item) => item.status === 'submitted');
      const activeCopyWork = active.filter(
        (item) => item.status === 'copy_edit' || item.status === 'in_review'
      );
      const revisionHandoffs = active.filter(
        (item) => item.status === 'changes_requested'
      );
      const readyForApproval = active.filter(
        (item) => item.status === 'ready_for_approval' || item.isOverdue
      );

      metrics = [
        {
          id: 'waiting',
          label: language === 'hi' ? 'समीक्षा के इंतज़ार में' : 'Waiting for Review',
          count: waitingReview.length,
          href: '/admin/copy-desk',
          icon: Inbox,
        },
        {
          id: 'copy-work',
          label: language === 'hi' ? 'सक्रिय कॉपी संपादन' : 'Active Copy Desk',
          count: activeCopyWork.length,
          href: '/admin/copy-desk',
          icon: FileCheck2,
        },
        {
          id: 'returned',
          label: language === 'hi' ? 'रिपोर्टर संशोधन स्थिति' : 'Revision Handoffs',
          count: revisionHandoffs.length,
          href: '/admin/work?view=review',
          icon: Clock3,
        },
        {
          id: 'approval-ready',
          label: language === 'hi' ? 'अप्रूवल के लिए तैयार' : 'Ready for Approval',
          count: active.filter((item) => item.status === 'ready_for_approval').length,
          href: '/admin/work?view=approval',
          icon: CheckCircle2,
        },
        {
          id: 'overdue-reviews',
          label: language === 'hi' ? 'देरी वाली समीक्षाएं' : 'Overdue Review Items',
          count: active.filter((item) => item.isOverdue).length,
          href: '/admin/work?view=overdue',
          icon: AlertTriangle,
        },
      ];

      lanes = [
        {
          id: 'lane-copy-waiting',
          icon: Inbox,
          title:
            language === 'hi'
              ? 'समीक्षा के इंतज़ार में कार्य'
              : 'Items Waiting for Review',
          description:
            language === 'hi'
              ? 'डेस्क पिकअप, प्रूफरीडिंग और फैक्ट-चेक के लिए तैयार नए सबमिशन।'
              : 'Fresh submissions ready for copy desk pickup, proofreading, and fact checks.',
          href: '/admin/copy-desk',
          items: waitingReview,
          empty:
            language === 'hi'
              ? 'डेस्क पिकअप के लिए कोई सबमिशन लंबित नहीं है।'
              : 'No submissions waiting for copy desk pickup.',
        },
        {
          id: 'lane-copy-active',
          icon: FileCheck2,
          title:
            language === 'hi'
              ? 'सक्रिय कॉपी संपादन'
              : 'Active Copy Editing Work',
          description:
            language === 'hi'
              ? 'स्टोरीज़ जिनका प्रूफरीडिंग, हेडिंग और कॉपी संपादन चल रहा है।'
              : 'Stories and articles actively undergoing proofreading and headline editing.',
          href: '/admin/copy-desk',
          items: activeCopyWork,
          empty:
            language === 'hi'
              ? 'वर्तमान में कोई स्टोरी कॉपी संपादन में नहीं है।'
              : 'No stories currently undergoing copy editing.',
        },
        {
          id: 'lane-copy-handoffs',
          icon: Clock3,
          title:
            language === 'hi'
              ? 'संशोधन और रिपोर्टर हैंडऑफ'
              : 'Returned & Revision Handoffs',
          description:
            language === 'hi'
              ? 'रिपोर्टर्स को सुधार, स्पष्टीकरण या स्रोत सत्यापन के लिए भेजी गई स्टोरीज़।'
              : 'Items returned to reporters for clarification, verification, or factual rewrites.',
          href: '/admin/work?view=review',
          items: revisionHandoffs,
          empty:
            language === 'hi'
              ? 'रिपोर्टर्स के पास संशोधन के लिए कोई स्टोरी नहीं है।'
              : 'No items currently with reporters for revisions.',
        },
        {
          id: 'lane-copy-approval',
          icon: CheckCircle2,
          title:
            language === 'hi'
              ? 'अप्रूवल के लिए तैयार और देरी में'
              : 'Ready for Approval & Overdue',
          description:
            language === 'hi'
              ? 'डेस्क से पास कार्य जो अप्रूवल के इंतज़ार में हैं या समय-सीमा पार कर चुके हैं।'
              : 'Desk-cleared work ready for leadership sign-off or past target deadlines.',
          href: '/admin/work?view=approval',
          items: readyForApproval,
          empty:
            language === 'hi'
              ? 'अप्रूवल या देरी में कोई आइटम नहीं है।'
              : 'No items waiting for approval or overdue.',
        },
      ];
      break;
    }

    case 'admin': {
      copy = {
        en: {
          eyebrow: 'Newsroom Operations',
          title: 'Newsroom Workload & Editorial Triage',
          summary:
            'Manage unassigned pitches, editorial review bottlenecks, desk assignments, approval queues, and publishing readiness.',
          metricsHeading: 'Newsroom Operational Workload',
          emptyLaneFallback: 'No newsroom items in this triage lane.',
        },
        hi: {
          eyebrow: 'न्यूज़रूम ऑपरेशन्स',
          title: 'न्यूज़रूम वर्कलोड और संपादकीय ट्राइएज',
          summary:
            'बिना ओनर कार्य, संपादकीय समीक्षा रुकावटें, डेस्क असाइनमेंट, अप्रूवल कतार और पब्लिशिंग तत्परता का प्रबंधन करें।',
          metricsHeading: 'न्यूज़रूम संचालन वर्कलोड',
          emptyLaneFallback: 'इस ट्राइएज सेक्शन में कोई कार्य लंबित नहीं है।',
        },
      }[language];

      quickActions = [
        {
          label: language === 'hi' ? 'असाइनमेंट प्रबंधन' : 'Assignments',
          href: '/admin/assignments',
          icon: Users,
          primary: true,
        },
        {
          label: language === 'hi' ? 'रिव्यू कतार' : 'Review Queue',
          href: '/admin/review-queue',
          icon: Inbox,
        },
        {
          label: language === 'hi' ? 'वर्क क्यू' : 'Work Queue',
          href: '/admin/work',
          icon: ListChecks,
        },
      ];

      // Filter Admin Mission Items
      const unassignedWork = active.filter((item) => item.isUnassigned);
      const reviewBacklog = active.filter((item) =>
        ['submitted', 'in_review', 'copy_edit', 'changes_requested'].includes(item.status)
      );
      const approvalQueue = active.filter(
        (item) => item.status === 'ready_for_approval'
      );
      const publishingGate = active.filter(
        (item) =>
          item.isOverdue ||
          ['approved', 'scheduled', 'ready_to_publish'].includes(item.status)
      );

      metrics = [
        {
          id: 'unassigned',
          label: language === 'hi' ? 'बिना ओनर ट्राइएज' : 'Unassigned Work',
          count: overview.viewCounts.unassigned,
          href: '/admin/assignments',
          icon: UserRoundX,
        },
        {
          id: 'review-backlog',
          label: language === 'hi' ? 'समीक्षा बैकग्राउंड' : 'Review Backlog',
          count: overview.viewCounts.review,
          href: '/admin/review-queue',
          icon: Inbox,
        },
        {
          id: 'approval-queue',
          label: language === 'hi' ? 'अप्रूवल कतार' : 'Awaiting Approval',
          count: overview.viewCounts.approval,
          href: '/admin/work?view=approval',
          icon: CheckCircle2,
        },
        {
          id: 'publishing-gate',
          label: language === 'hi' ? 'पब्लिशिंग तैयारी' : 'Ready to Publish',
          count: overview.viewCounts.publishing,
          href: '/admin/work?view=publishing',
          icon: Send,
        },
        {
          id: 'overdue-newsroom',
          label: language === 'hi' ? 'देरी वाला कार्य' : 'Overdue Newsroom Items',
          count: overview.viewCounts.overdue,
          href: '/admin/work?view=overdue',
          icon: AlertTriangle,
        },
      ];

      lanes = [
        {
          id: 'lane-admin-unassigned',
          icon: UserRoundX,
          title:
            language === 'hi'
              ? 'बिना ओनर कार्य और ट्राइएज'
              : 'Unassigned Work & Triage',
          description:
            language === 'hi'
              ? 'नई स्टोरीज़ और पिच जिन्हें रिपोर्टर या डेस्क ओनर असाइन करने की आवश्यकता है।'
              : 'New pitches and incoming stories requiring editor assignment and triage.',
          href: '/admin/assignments',
          items: unassignedWork,
          empty:
            language === 'hi'
              ? 'सभी सक्रिय कार्यों के ओनर असाइन हैं।'
              : 'All active newsroom items have an assigned owner.',
        },
        {
          id: 'lane-admin-review',
          icon: Inbox,
          title:
            language === 'hi'
              ? 'संपादकीय समीक्षा बैकग्राउंड'
              : 'Editorial Review Backlog',
          description:
            language === 'hi'
              ? 'कॉपी संपादन, फैक्ट-चेक और रिपोर्टर संशोधन में प्रगतिरत कार्य।'
              : 'Submissions actively moving through copy editing, fact checks, and revisions.',
          href: '/admin/review-queue',
          items: reviewBacklog,
          empty:
            language === 'hi'
              ? 'संपादकीय समीक्षा में कोई कार्य लंबित नहीं है।'
              : 'No items currently in the editorial review backlog.',
        },
        {
          id: 'lane-admin-approval',
          icon: CheckCircle2,
          title:
            language === 'hi'
              ? 'लीडरशिप अप्रूवल के इंतज़ार में'
              : 'Awaiting Leadership Approval',
          description:
            language === 'hi'
              ? 'डेस्क द्वारा सत्यापित सामग्री जो वरिष्ठ संपादकीय मंज़ूरी के इंतज़ार में है।'
              : 'Desk-cleared stories and packages waiting for senior editorial sign-off.',
          href: '/admin/work?view=approval',
          items: approvalQueue,
          empty:
            language === 'hi'
              ? 'अप्रूवल के इंतज़ार में कोई स्टोरी नहीं है।'
              : 'No items currently awaiting editorial approval.',
        },
        {
          id: 'lane-admin-publishing',
          icon: Send,
          title:
            language === 'hi'
              ? 'पब्लिशिंग गेट और समय जोखिम'
              : 'Publishing Gate & Overdue Risks',
          description:
            language === 'hi'
              ? 'रिलीज़ के लिए तैयार स्वीकृत कार्य, शेड्यूल्ड पोस्ट और समय-सीमा जोखिम।'
              : 'Approved releases ready for publish, scheduled dispatches, and overdue risks.',
          href: '/admin/work?view=publishing',
          items: publishingGate,
          empty:
            language === 'hi'
              ? 'कोई पब्लिशिंग रुकावट या देरी वाला कार्य नहीं है।'
              : 'No publishing blockers or overdue items.',
        },
      ];
      break;
    }

    case 'super_admin':
    default: {
      copy = {
        en: {
          eyebrow: 'Executive Operations',
          title: 'Executive Newsroom & Operations Overview',
          summary:
            'Comprehensive operational oversight: editorial throughput, approvals, release schedules, cross-desk risks, and system controls.',
          metricsHeading: 'Executive Newsroom Metrics',
          emptyLaneFallback: 'No newsroom items in this operational lane.',
        },
        hi: {
          eyebrow: 'कार्यकारी ऑपरेशन्स',
          title: 'कार्यकारी न्यूज़रूम और संचालन अवलोकन',
          summary:
            'संपादकीय प्रवाह, अप्रूवल्स, रिलीज़ शेड्यूल, डेस्क जोखिम और सिस्टम नियंत्रणों का संपूर्ण अवलोकन।',
          metricsHeading: 'कार्यकारी न्यूज़रूम मेट्रिक्स',
          emptyLaneFallback: 'इस संचालन सेक्शन में कोई कार्य लंबित नहीं है।',
        },
      }[language];

      quickActions = [
        {
          label: language === 'hi' ? 'वर्क क्यू खोलें' : 'Open Work Queue',
          href: '/admin/work',
          icon: ListChecks,
          primary: true,
        },
        {
          label: language === 'hi' ? 'रिव्यू कतार' : 'Review Queue',
          href: '/admin/review-queue',
          icon: Inbox,
        },
        {
          label: language === 'hi' ? 'नया लेख बनाएं' : 'Create Article',
          href: '/admin/articles/new',
          icon: FileText,
        },
      ];

      // Super Admin Control Plane Shortcuts
      controlPlaneShortcuts = [
        {
          label: language === 'hi' ? 'टीम प्रबंधन' : 'Team Management',
          href: '/admin/team',
          icon: Users,
        },
        {
          label: language === 'hi' ? 'ई-पेपर सेंटर' : 'E-Paper Center',
          href: '/admin/epapers',
          icon: BookOpen,
        },
        {
          label: language === 'hi' ? 'ऑडिट लॉग' : 'Audit Log',
          href: '/admin/audit-log',
          icon: Shield,
        },
        {
          label: language === 'hi' ? 'सिस्टम सेटिंग्स' : 'Global Settings',
          href: '/admin/settings',
          icon: Settings,
        },
      ];

      // Filter Super Admin Mission Items
      const operationalRisks = active.filter(
        (item) =>
          item.isOverdue ||
          (item.isUnassigned && (item.priority === 'urgent' || item.priority === 'high'))
      );
      const executiveApprovals = active.filter(
        (item) => item.status === 'ready_for_approval'
      );
      const publicationGate = active.filter((item) =>
        ['approved', 'scheduled', 'ready_to_publish'].includes(item.status)
      );
      const newsroomFlow = active.filter((item) =>
        ['submitted', 'assigned', 'in_review', 'copy_edit'].includes(item.status)
      );

      metrics = [
        {
          id: 'total-active',
          label: language === 'hi' ? 'सक्रिय कार्य कुल' : 'Total Active Work',
          count: active.length,
          href: '/admin/work?view=all',
          icon: ListChecks,
        },
        {
          id: 'unassigned-total',
          label: language === 'hi' ? 'बिना ओनर कार्य' : 'Unassigned Work',
          count: overview.viewCounts.unassigned,
          href: '/admin/work?view=unassigned',
          icon: UserRoundX,
        },
        {
          id: 'review-total',
          label: language === 'hi' ? 'समीक्षा बैकग्राउंड' : 'Review Backlog',
          count: overview.viewCounts.review,
          href: '/admin/work?view=review',
          icon: Inbox,
        },
        {
          id: 'approval-total',
          label: language === 'hi' ? 'अप्रूवल कतार' : 'Awaiting Approval',
          count: overview.viewCounts.approval,
          href: '/admin/work?view=approval',
          icon: CheckCircle2,
        },
        {
          id: 'publishing-total',
          label: language === 'hi' ? 'पब्लिशिंग तैयार' : 'Ready to Publish',
          count: overview.viewCounts.publishing,
          href: '/admin/work?view=publishing',
          icon: Send,
        },
        {
          id: 'overdue-total',
          label: language === 'hi' ? 'देरी के जोखिम' : 'Overdue Risks',
          count: overview.viewCounts.overdue,
          href: '/admin/work?view=overdue',
          icon: AlertTriangle,
        },
      ];

      lanes = [
        {
          id: 'lane-super-risks',
          icon: AlertTriangle,
          title:
            language === 'hi'
              ? 'संचालन जोखिम और देरी'
              : 'Operational Risks & Overdue',
          description:
            language === 'hi'
              ? 'सभी डेस्कों में उच्च-प्राथमिकता वाले बिना ओनर आइटम और छूटी समय-सीमाएं।'
              : 'High-priority unassigned items and overdue deadlines across all desks.',
          href: '/admin/work?view=overdue',
          items: operationalRisks,
          empty:
            language === 'hi'
              ? 'कोई संचालन जोखिम या छूटी समय-सीमा नहीं पाई गई।'
              : 'No operational risks or overdue deadlines detected.',
        },
        {
          id: 'lane-super-approval',
          icon: CheckCircle2,
          title:
            language === 'hi'
              ? 'कार्यकारी अप्रूवल कतार'
              : 'Executive Approval Queue',
          description:
            language === 'hi'
              ? 'अंतिम नेतृत्व मंज़ूरी के इंतज़ार में डेस्क-स्वीकृत सामग्री।'
              : 'Desk-cleared content requiring final executive sign-off before publication.',
          href: '/admin/work?view=approval',
          items: executiveApprovals,
          empty:
            language === 'hi'
              ? 'कार्यकारी अप्रूवल के लिए कोई सामग्री लंबित नहीं है।'
              : 'No content awaiting executive approval.',
        },
        {
          id: 'lane-super-release',
          icon: Send,
          title:
            language === 'hi'
              ? 'पब्लिकेशन गेट और रिलीज़'
              : 'Publication Gate & Releases',
          description:
            language === 'hi'
              ? 'रिलीज़ गेट पर स्वीकृत स्टोरीज़, शेड्यूल्ड पोस्ट और ई-पेपर संस्करण।'
              : 'Approved stories, scheduled dispatches, and E-Paper editions at the release gate.',
          href: '/admin/work?view=publishing',
          items: publicationGate,
          empty:
            language === 'hi'
              ? 'कोई आइटम शेड्यूल या रिलीज़ के लिए लंबित नहीं है।'
              : 'No items scheduled or pending release.',
        },
        {
          id: 'lane-super-flow',
          icon: ListChecks,
          title:
            language === 'hi'
              ? 'सक्रिय न्यूज़रूम प्रवाह'
              : 'Active Newsroom Flow',
          description:
            language === 'hi'
              ? 'न्यूज़रूम डेस्कों के माध्यम से सक्रिय रूप से आगे बढ़ रहा कार्य।'
              : 'Articles, video packages, and editions actively progressing through desks.',
          href: '/admin/work?view=all',
          items: newsroomFlow,
          empty:
            language === 'hi'
              ? 'वर्तमान में कोई ड्राफ्टिंग या समीक्षा सक्रिय नहीं है।'
              : 'No active editorial drafting or review underway.',
        },
      ];
      break;
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-3 pb-10 sm:px-5">
      {/* Mission Hero Banner */}
      <header className="admin-shell-surface-strong rounded-[24px] border border-[color:var(--admin-shell-border)] p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">
                {copy.eyebrow}
              </span>
              <span className="text-xs font-semibold text-[color:var(--admin-shell-text-muted)]">
                · {pretty(role)}
              </span>
              {userName ? (
                <span className="text-xs font-bold text-[color:var(--admin-shell-text)]">
                  · {userName}
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[color:var(--admin-shell-text)] sm:text-3xl lg:text-4xl">
              {copy.title}
            </h1>
            <p className="mt-2.5 max-w-3xl text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
              {copy.summary}
            </p>
          </div>

          <nav
            aria-label={language === 'hi' ? 'त्वरित कार्य' : 'Quick Actions'}
            className="flex flex-wrap items-center gap-2.5 sm:gap-3"
          >
            {quickActions.map(({ label, href, icon: Icon, primary }) => (
              <Link
                key={href}
                href={href}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black transition sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  primary
                    ? 'bg-zinc-950 text-white shadow hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200'
                    : 'admin-shell-surface border border-[color:var(--admin-shell-border)] text-[color:var(--admin-shell-text)] hover:bg-[color:var(--admin-shell-surface-muted)]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </div>

        {/* Super Admin Executive Control Plane Navigation */}
        {controlPlaneShortcuts.length ? (
          <nav
            aria-label={
              language === 'hi'
                ? 'सुपर एडमिन नियंत्रण पैनल'
                : 'Super Admin Control Plane'
            }
            className="mt-5 border-t border-[color:var(--admin-shell-border)] pt-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-black uppercase tracking-wider text-[color:var(--admin-shell-text-muted)]">
                {language === 'hi' ? 'नियंत्रण कक्ष:' : 'Control Plane:'}
              </span>
              {controlPlaneShortcuts.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface)] px-3 py-1 text-xs font-bold text-[color:var(--admin-shell-text)] transition hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  <Icon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      {/* Role-Specific Mission Action Lanes (2x2 on Desktop, 1-col on Tablet & Mobile) */}
      <main className="grid gap-5 xl:grid-cols-2">
        {lanes.map((lane) => (
          <Lane key={lane.id} {...lane} language={language} />
        ))}
      </main>

      {/* Role-Specific Metrics At A Glance */}
      <section
        aria-labelledby="metrics-heading"
        className="pt-2"
      >
        <h2
          id="metrics-heading"
          className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[color:var(--admin-shell-text-muted)]"
        >
          {copy.metricsHeading}
        </h2>
        <div
          className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
            metrics.length > 5 ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
          }`}
        >
          {metrics.map(({ id, label, count, href, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              className="admin-shell-surface group rounded-[18px] border border-[color:var(--admin-shell-border)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-500/40 focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-2xl font-black text-[color:var(--admin-shell-text)]">
                  {count}
                </span>
              </div>
              <p className="mt-3 truncate text-xs font-bold text-[color:var(--admin-shell-text-muted)] group-hover:text-[color:var(--admin-shell-text)]">
                {label}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
