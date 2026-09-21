'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Filter,
  Inbox,
  ListChecks,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import DeskWorkflowActions from '@/app/(admin)/admin/DeskWorkflowActions';
import AssignmentTriageControl, {
  type AssignmentChange,
} from '@/components/admin/AssignmentTriageControl';
import { CmsWorkflowPriorityBadge, CmsWorkflowStatusBadge } from '@/components/admin/CmsWorkflowStatusBadge';
import type { AdminRole } from '@/lib/auth/roles';
import type { WorkQueueItem, WorkQueueOverview, WorkQueueView } from '@/lib/admin/workQueue';
import { useAppStore } from '@/lib/store/appStore';

type WorkQueueWorkbenchProps = {
  role: AdminRole;
  overview: WorkQueueOverview;
  routePath: string;
};

const WORK_QUEUE_VIEWS: WorkQueueView[] = [
  'mine',
  'unassigned',
  'review',
  'approval',
  'publishing',
  'overdue',
  'all',
];

const VIEW_LABELS: Record<WorkQueueView, { en: string; hi: string }> = {
  mine: { en: 'Mine', hi: '\u092e\u0947\u0930\u093e \u0915\u093e\u092e' },
  unassigned: { en: 'Unassigned', hi: '\u092c\u093f\u0928\u093e \u0905\u0938\u093e\u0907\u0928' },
  review: { en: 'Review', hi: '\u0930\u093f\u0935\u094d\u092f\u0942' },
  approval: { en: 'Approval', hi: '\u0905\u0928\u0941\u092e\u094b\u0926\u0928' },
  publishing: { en: 'Publishing', hi: '\u092a\u094d\u0930\u0915\u093e\u0936\u0928' },
  overdue: { en: 'Overdue', hi: '\u0932\u0902\u092c\u093f\u0924' },
  all: { en: 'All work', hi: '\u0938\u092d\u0940 \u0915\u093e\u0930\u094d\u092f' },
};

type QuickFilterOption = {
  id: string;
  view: WorkQueueView;
  status?: string;
  label: { en: string; hi: string };
};

const MY_WORK_QUICK_FILTERS: QuickFilterOption[] = [
  { id: 'all', view: 'mine', status: 'all', label: { en: 'All My Work', hi: 'मेरा सारा काम' } },
  { id: 'draft', view: 'mine', status: 'draft', label: { en: 'Drafts', hi: 'ड्राफ्ट्स' } },
  { id: 'in_review', view: 'mine', status: 'in_review', label: { en: 'In Review', hi: 'समीक्षा में' } },
  { id: 'changes_requested', view: 'mine', status: 'changes_requested', label: { en: 'Changes Requested', hi: 'संशोधन अपेक्षित' } },
  { id: 'approved', view: 'mine', status: 'approved', label: { en: 'Approved', hi: 'स्वीकृत' } },
  { id: 'overdue', view: 'overdue', label: { en: 'Overdue', hi: 'लंबित' } },
];

type QueueRouteContext = {
  eyebrow: { en: string; hi: string };
  title: { en: string; hi: string };
  description: { en: string; hi: string };
};

const QUEUE_ROUTE_HEADERS: Record<string, QueueRouteContext> = {
  '/admin/review-queue': {
    eyebrow: { en: 'Review desk', hi: 'रिव्यू डेस्क' },
    title: { en: 'Review Queue', hi: 'रिव्यू क्यू' },
    description: {
      en: 'Editorial review, fact-checking, copy editing, and pre-approval triage across all desks.',
      hi: 'संपादकीय समीक्षा, तथ्य-जांच, कॉपी संपादन और अनुमोदन-पूर्व ट्राइएज।',
    },
  },
  '/admin/content-queue': {
    eyebrow: { en: 'Publishing desk', hi: 'प्रकाशन डेस्क' },
    title: { en: 'Content Queue', hi: 'कंटेंट क्यू' },
    description: {
      en: 'Approved articles, stories, videos, and editions waiting for schedule and publication release.',
      hi: 'स्वीकृत लेख, स्टोरी, वीडियो और संस्करण जो शेड्यूलिंग और अंतिम प्रकाशन के लिए तैयार हैं।',
    },
  },
  '/admin/my-work': {
    eyebrow: { en: 'My Work', hi: 'माई वर्क' },
    title: { en: 'My Work', hi: 'मेरा काम' },
    description: {
      en: 'Personal stories, drafts, reviews, and assignments assigned to or created by you.',
      hi: 'आपके द्वारा बनाई गई या आपको सौंपी गई व्यक्तिगत स्टोरी, ड्राफ्ट और असाइनमेंट।',
    },
  },
  '/admin/assignments': {
    eyebrow: { en: 'Assignment desk', hi: 'असाइनमेंट डेस्क' },
    title: { en: 'Assignments', hi: 'असाइनमेंट्स' },
    description: {
      en: 'Unassigned newsroom items waiting for triage, reporter assignment, and editorial prioritization.',
      hi: 'न्यूज़रूम के बिना ओनर वाले कार्य जिन्हें ट्राइएज, रिपोर्टर असाइनमेंट और संपादकीय प्राथमिकता की आवश्यकता है।',
    },
  },
};

const DEFAULT_ROUTE_HEADER: QueueRouteContext = {
  eyebrow: { en: 'Action desk', hi: 'एक्शन डेस्क' },
  title: { en: 'Work Queue', hi: 'वर्क क्यू' },
  description: {
    en: 'One role-aware workspace for reporting, review, assignments, production, approval, and release.',
    hi: 'रिपोर्टिंग, रिव्यू, असाइनमेंट, प्रोडक्शन, अनुमोदन और प्रकाशन के लिए एक वर्कस्पेस।',
  },
};

type StatusFilterOption = {
  value: string;
  label: { en: string; hi: string };
};

const ALL_STATUS_OPTIONS: StatusFilterOption[] = [
  { value: 'all', label: { en: 'Status: All', hi: 'स्टेटस: सभी' } },
  { value: 'draft', label: { en: 'Draft', hi: 'ड्राफ्ट' } },
  { value: 'submitted', label: { en: 'Submitted', hi: 'सबमिट' } },
  { value: 'assigned', label: { en: 'Assigned', hi: 'असाइन किया गया' } },
  { value: 'in_review', label: { en: 'In review', hi: 'समीक्षा में' } },
  { value: 'copy_edit', label: { en: 'Copy edit', hi: 'कॉपी संपादन' } },
  { value: 'changes_requested', label: { en: 'Changes requested', hi: 'संशोधन अपेक्षित' } },
  { value: 'ready_for_approval', label: { en: 'Ready for approval', hi: 'अनुमोदन के लिए तैयार' } },
  { value: 'approved', label: { en: 'Approved', hi: 'स्वीकृत' } },
  { value: 'scheduled', label: { en: 'Scheduled', hi: 'शेड्यूल किया गया' } },
  { value: 'ready_to_publish', label: { en: 'Ready to publish', hi: 'प्रकाशन के लिए तैयार' } },
];

const CONTENT_QUEUE_STATUS_OPTIONS: StatusFilterOption[] = [
  { value: 'all', label: { en: 'All publishing statuses', hi: 'सभी प्रकाशन स्टेटस' } },
  { value: 'approved', label: { en: 'Approved', hi: 'स्वीकृत' } },
  { value: 'scheduled', label: { en: 'Scheduled', hi: 'शेड्यूल किया गया' } },
  { value: 'ready_to_publish', label: { en: 'Ready to publish', hi: 'प्रकाशन के लिए तैयार' } },
];

const REVIEW_QUEUE_STATUS_OPTIONS: StatusFilterOption[] = [
  { value: 'all', label: { en: 'All review statuses', hi: 'सभी समीक्षा स्टेटस' } },
  { value: 'submitted', label: { en: 'Submitted', hi: 'सबमिट' } },
  { value: 'assigned', label: { en: 'Assigned', hi: 'असाइन किया गया' } },
  { value: 'in_review', label: { en: 'In review', hi: 'समीक्षा में' } },
  { value: 'copy_edit', label: { en: 'Copy edit', hi: 'कॉपी संपादन' } },
  { value: 'changes_requested', label: { en: 'Changes requested', hi: 'संशोधन अपेक्षित' } },
  { value: 'pages_ready', label: { en: 'Pages ready', hi: 'पृष्ठ तैयार' } },
  { value: 'ocr_review', label: { en: 'OCR review', hi: 'ओसीआर समीक्षा' } },
  { value: 'hotspot_mapping', label: { en: 'Hotspot mapping', hi: 'हॉटस्पॉट मैपिंग' } },
];

type EmptyStateContent = {
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
};

function getEmptyState({
  role,
  view,
  status,
  search,
  routePath,
  language,
}: {
  role: AdminRole;
  view: WorkQueueView;
  status: string;
  search: string;
  routePath: string;
  language: 'en' | 'hi';
}): EmptyStateContent {
  const isHi = language === 'hi';

  if (search.trim()) {
    return {
      title: isHi ? 'कोई मेल नहीं मिला' : 'No matching work items',
      description: isHi
        ? `"${search}" से मेल खाने वाला कोई कार्य नहीं मिला। फ़िल्टर रीसेट करने का प्रयास करें।`
        : `No work items matched "${search}". Try adjusting your keywords or filters.`,
      action: {
        label: isHi ? 'फ़िल्टर रीसेट करें' : 'Reset filters',
        href: `${routePath}?view=${view}`,
      },
    };
  }

  if (status === 'draft') {
    return {
      title: isHi ? 'वर्तमान में कोई ड्राफ्ट लंबित नहीं है।' : 'No drafts waiting right now.',
      description: isHi
        ? 'आपके सभी ड्राफ्ट सबमिट हो चुके हैं या आपने कोई नया ड्राफ्ट शुरू नहीं किया है।'
        : 'All drafts have been submitted or you have not started any new drafts.',
      action:
        role === 'reporter' || role === 'admin' || role === 'super_admin'
          ? {
              label: isHi ? 'नई स्टोरी बनाएं' : 'Create Story',
              href: '/admin/stories/new',
            }
          : role === 'copy_editor'
            ? {
                label: isHi ? 'नया लेख बनाएं' : 'Create Article',
                href: '/admin/articles/new',
              }
            : undefined,
    };
  }

  if (status === 'changes_requested') {
    return {
      title: isHi
        ? 'संशोधन के लिए कोई स्टोरी नहीं लौटाई गई है।'
        : 'No stories have been returned for revision.',
      description: isHi
        ? 'आपके सबमिट किए गए कार्य पर वर्तमान में कोई संशोधन लंबित नहीं है।'
        : 'None of your submitted stories are currently returned for revision.',
    };
  }

  if (status === 'in_review') {
    return {
      title: isHi ? 'कोई समीक्षा कार्य लंबित नहीं है।' : 'No items currently in review.',
      description: isHi
        ? 'डेस्क समीक्षा के लिए सबमिट की गई स्टोरी यहाँ दिखाई देंगी।'
        : 'Stories and articles submitted for desk review will appear here.',
    };
  }

  if (status === 'approved') {
    return {
      title: isHi
        ? 'प्रकाशन के लिए कोई स्वीकृत स्टोरी लंबित नहीं है।'
        : 'No approved stories waiting for release.',
      description: isHi
        ? 'स्वीकृत स्टोरी जो रिलीज या शेड्यूलिंग के लिए तैयार हैं, यहाँ दिखाई देंगी।'
        : 'Stories that have been approved and await scheduling or release will appear here.',
    };
  }

  if (view === 'review') {
    return {
      title: isHi
        ? 'डेस्क के लिए कोई समीक्षा कार्य लंबित नहीं है।'
        : 'No review items are waiting for your desk.',
      description: isHi
        ? 'सभी आने वाली स्टोरी और लेखों की समीक्षा हो चुकी है।'
        : 'All incoming stories and articles have been reviewed or are in good order.',
      action:
        role === 'copy_editor' || role === 'admin' || role === 'super_admin'
          ? {
              label: isHi ? 'कॉपी डेस्क खोलें' : 'Open Copy Desk',
              href: '/admin/copy-desk',
            }
          : undefined,
    };
  }

  if (view === 'unassigned') {
    return {
      title: isHi
        ? 'ट्राइएज के लिए कोई बिना ओनर कार्य नहीं है।'
        : 'No unassigned newsroom work is waiting for triage.',
      description: isHi
        ? 'न्यूज़रूम में सभी सक्रिय स्टोरी और लेखों को ओनर सौंपा जा चुका है।'
        : 'All incoming newsroom work currently has an assigned reporter or editor.',
      action:
        role === 'admin' || role === 'super_admin'
          ? {
              label: isHi ? 'सभी कार्य देखें' : 'View All Work',
              href: '/admin/work?view=all',
            }
          : undefined,
    };
  }

  if (view === 'overdue') {
    return {
      title: isHi ? 'कोई कार्य समय सीमा पार नहीं है।' : 'No overdue deadlines.',
      description: isHi
        ? 'सभी सक्रिय कार्य समय पर हैं और उनकी संपादकीय समय सीमा सुरक्षित है।'
        : 'All active items are on schedule and within their editorial deadlines.',
    };
  }

  if (view === 'approval') {
    return {
      title: isHi
        ? 'अनुमोदन के लिए कोई कार्य लंबित नहीं है।'
        : 'No items awaiting leadership approval.',
      description: isHi
        ? 'अनुमोदन के लिए तैयार सभी कार्यों पर निर्णय लिया जा चुका है।'
        : 'All items marked ready for approval have been decided.',
    };
  }

  if (view === 'publishing') {
    return {
      title: isHi
        ? 'प्रकाशन पाइपलाइन में कोई कार्य नहीं है।'
        : 'No items waiting in publishing pipeline.',
      description: isHi
        ? 'प्रकाशन के लिए स्वीकृत और निर्धारित स्टोरी यहाँ दिखाई देंगी।'
        : 'Stories and editions ready for release will appear here.',
    };
  }

  if (view === 'mine' || routePath === '/admin/my-work') {
    return {
      title: isHi ? 'आपकी कार्य सूची पूरी तरह खाली है।' : 'Your personal queue is clear.',
      description: isHi
        ? 'वर्तमान में आपके पास कोई सक्रिय असाइनमेंट या प्रगति पर स्टोरी नहीं है।'
        : 'You have no active assignments or in-progress stories requiring attention right now.',
      action:
        role === 'reporter'
          ? {
              label: isHi ? 'नई स्टोरी बनाएं' : 'Create Story',
              href: '/admin/stories/new',
            }
          : role === 'copy_editor'
            ? {
                label: isHi ? 'कॉपी डेस्क खोलें' : 'Open Copy Desk',
                href: '/admin/copy-desk',
              }
            : role === 'admin' || role === 'super_admin'
              ? {
                  label: isHi ? 'अनअसाइंड ट्राइएज देखें' : 'Check Unassigned',
                  href: '/admin/work?view=unassigned',
                }
              : undefined,
    };
  }

  const viewLabel = VIEW_LABELS[view][language];
  return {
    title: isHi ? `${viewLabel} में कोई कार्य लंबित नहीं है।` : `No work is waiting in ${viewLabel}.`,
    description: isHi
      ? 'वर्तमान फ़िल्टर्स से मेल खाने वाला कोई अनुमत न्यूज़रूम कार्य नहीं है।'
      : 'No permitted newsroom items match the current filters for this view.',
  };
}

const COPY = {
  en: {
    eyebrow: 'Action desk',
    title: 'Work Queue',
    description: 'One role-aware workspace for reporting, review, assignments, production, approval, and release.',
    search: 'Search title, desk, owner...',
    filters: 'Filters',
    content: 'Content',
    status: 'Status',
    priority: 'Priority',
    sort: 'Sort',
    apply: 'Apply filters',
    reset: 'Reset',
    item: 'Item',
    owner: 'Owner',
    due: 'Due',
    readiness: 'Readiness',
    next: 'Next action',
    emptyTitle: 'This view is clear',
    emptyText: 'No work currently matches these filters.',
    selected: 'selected',
    bulkHint: 'Safe bulk triage is available for assignment, priority, and due date.',
    clear: 'Clear selection',
    details: 'Work item details',
    blockers: 'Publish blockers',
    warnings: 'Review warnings',
    checks: 'Readiness checklist',
    activity: 'Activity notes',
    overdue: 'Overdue',
    unassigned: 'Unassigned',
    ready: 'Ready',
    needsAttention: 'Needs attention',
    blocked: 'Blocked',
  },
  hi: {
    eyebrow: '\u090f\u0915\u094d\u0936\u0928 \u0921\u0947\u0938\u094d\u0915',
    title: '\u0935\u0930\u094d\u0915 \u0915\u094d\u092f\u0942',
    description: '\u0930\u093f\u092a\u094b\u0930\u094d\u091f\u093f\u0902\u0917, \u0930\u093f\u0935\u094d\u092f\u0942, \u0905\u0938\u093e\u0907\u0928\u092e\u0947\u0902\u091f, \u092a\u094d\u0930\u094b\u0921\u0915\u094d\u0936\u0928, \u0905\u0928\u0941\u092e\u094b\u0926\u0928 \u0914\u0930 \u092a\u094d\u0930\u0915\u093e\u0936\u0928 \u0915\u0947 \u0932\u093f\u090f \u090f\u0915 \u0935\u0930\u094d\u0915\u0938\u094d\u092a\u0947\u0938\u0964',
    search: '\u0936\u0940\u0930\u094d\u0937\u0915, \u0921\u0947\u0938\u094d\u0915, \u0913\u0928\u0930 \u0916\u094b\u091c\u0947\u0902...',
    filters: '\u092b\u093f\u0932\u094d\u091f\u0930',
    content: '\u0915\u0902\u091f\u0947\u0902\u091f',
    status: '\u0938\u094d\u091f\u0947\u091f\u0938',
    priority: '\u092a\u094d\u0930\u093e\u0925\u092e\u093f\u0915\u0924\u093e',
    sort: '\u0915\u094d\u0930\u092e',
    apply: '\u092b\u093f\u0932\u094d\u091f\u0930 \u0932\u093e\u0917\u0942 \u0915\u0930\u0947\u0902',
    reset: '\u0930\u0940\u0938\u0947\u091f',
    item: '\u0906\u0907\u091f\u092e',
    owner: '\u0913\u0928\u0930',
    due: '\u0921\u094d\u092f\u0942',
    readiness: '\u0924\u0948\u092f\u093e\u0930\u0940',
    next: '\u0905\u0917\u0932\u093e \u090f\u0915\u094d\u0936\u0928',
    emptyTitle: '\u092f\u0939 \u0935\u094d\u092f\u0942 \u0915\u094d\u0932\u093f\u092f\u0930 \u0939\u0948',
    emptyText: '\u0915\u094b\u0908 \u0915\u093e\u0930\u094d\u092f \u0907\u0928 \u092b\u093f\u0932\u094d\u091f\u0930\u094d\u0938 \u0938\u0947 \u092e\u0947\u0932 \u0928\u0939\u0940\u0902 \u0916\u093e\u0924\u093e\u0964',
    selected: '\u091a\u092f\u0928\u093f\u0924',
    bulkHint: '\u0905\u0938\u093e\u0907\u0928\u092e\u0947\u0902\u091f, \u092a\u094d\u0930\u093e\u0925\u092e\u093f\u0915\u0924\u093e \u0914\u0930 \u0921\u094d\u092f\u0942 \u0921\u0947\u091f \u0915\u0947 \u0932\u093f\u090f \u0938\u0947\u092b \u092c\u0932\u094d\u0915 \u091f\u094d\u0930\u093e\u090f\u091c \u0909\u092a\u0932\u092c\u094d\u0927 \u0939\u0948\u0964',
    clear: '\u091a\u092f\u0928 \u0939\u091f\u093e\u090f\u0902',
    details: '\u0935\u0930\u094d\u0915 \u0906\u0907\u091f\u092e \u0935\u093f\u0935\u0930\u0923',
    blockers: '\u092a\u094d\u0930\u0915\u093e\u0936\u0928 \u092c\u094d\u0932\u0949\u0915\u0930',
    warnings: '\u0930\u093f\u0935\u094d\u092f\u0942 \u0935\u093e\u0930\u094d\u0928\u093f\u0902\u0917',
    checks: '\u0930\u0947\u0921\u0940\u0928\u0947\u0938 \u091a\u0947\u0915\u0932\u093f\u0938\u094d\u091f',
    activity: '\u090f\u0915\u094d\u091f\u093f\u0935\u093f\u091f\u0940 \u0928\u094b\u091f\u094d\u0938',
    overdue: '\u0932\u0902\u092c\u093f\u0924',
    unassigned: '\u092c\u093f\u0928\u093e \u0905\u0938\u093e\u0907\u0928',
    ready: '\u0924\u0948\u092f\u093e\u0930',
    needsAttention: '\u0927\u094d\u092f\u093e\u0928 \u091a\u093e\u0939\u093f\u090f',
    blocked: '\u092c\u094d\u0932\u0949\u0915',
  },
} as const;

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function formatDate(value: string | null, language: 'en' | 'hi') {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function itemTypeLabel(item: WorkQueueItem) {
  if (item.publicationType === 'emagazine') return 'E-Magazine';
  if (item.contentType === 'epaper') return 'E-Paper';
  return item.contentType.charAt(0).toUpperCase() + item.contentType.slice(1);
}

function readinessTone(item: WorkQueueItem) {
  if (item.readiness.state === 'blocked') return 'border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-300';
  if (item.readiness.state === 'needs_attention') return 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}

export default function WorkQueueWorkbench({ role, overview, routePath }: WorkQueueWorkbenchProps) {
  const router = useRouter();
  const canManageAssignments = role === 'admin' || role === 'super_admin';
  const language = useAppStore((state) => state.language) === 'hi' ? 'hi' : 'en';
  const t = COPY[language];
  const [items, setItems] = useState(overview.items);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const previewItem = useMemo(
    () => items.find((item) => `${item.contentType}:${item.id}` === previewId) || null,
    [items, previewId]
  );
  const emptyState = useMemo(
    () =>
      getEmptyState({
        role,
        view: overview.filters.view,
        status: overview.filters.status,
        search: overview.filters.search,
        routePath,
        language,
      }),
    [role, overview.filters.view, overview.filters.status, overview.filters.search, routePath, language]
  );

  useEffect(() => {
    setItems(overview.items);
  }, [overview.items]);

  useEffect(() => {
    if (!previewItem) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewId(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [previewItem]);

  function viewHref(targetView: WorkQueueView) {
    const isCurrentDedicatedReview = routePath === '/admin/review-queue' && targetView === 'review';
    const isCurrentDedicatedContent = routePath === '/admin/content-queue' && targetView === 'publishing';
    const isCurrentDedicatedMyWork = routePath === '/admin/my-work' && targetView === 'mine';
    const isCurrentDedicatedAssignments = routePath === '/admin/assignments' && targetView === 'unassigned';

    let basePath = '/admin/work';
    if (isCurrentDedicatedReview) basePath = '/admin/review-queue';
    else if (isCurrentDedicatedContent) basePath = '/admin/content-queue';
    else if (isCurrentDedicatedMyWork) basePath = '/admin/my-work';
    else if (isCurrentDedicatedAssignments) basePath = '/admin/assignments';

    const params = new URLSearchParams();
    params.set('view', targetView);
    return `${basePath}?${params.toString()}`;
  }

  function quickFilterHref(targetView: WorkQueueView, targetStatus?: string) {
    const params = new URLSearchParams();
    params.set('view', targetView);
    if (targetStatus && targetStatus !== 'all') {
      params.set('status', targetStatus);
    }
    if (overview.filters.search) params.set('search', overview.filters.search);
    if (overview.filters.contentType !== 'all') params.set('contentType', overview.filters.contentType);
    if (overview.filters.priority !== 'all') params.set('priority', overview.filters.priority);
    if (overview.filters.assignee) params.set('assignee', overview.filters.assignee);
    if (overview.filters.sort !== 'updated_desc') params.set('sort', overview.filters.sort);
    return `${routePath}?${params.toString()}`;
  }

  function isQuickFilterActive(option: QuickFilterOption) {
    if (option.view === 'overdue') {
      return overview.filters.view === 'overdue';
    }
    if (overview.filters.view !== 'mine') return false;
    if (!option.status || option.status === 'all') {
      return overview.filters.status === 'all' || !overview.filters.status;
    }
    return overview.filters.status === option.status;
  }

  function toggleSelection(item: WorkQueueItem) {
    const key = `${item.contentType}:${item.id}`;
    setSelectedIds((current) =>
      current.includes(key) ? current.filter((id) => id !== key) : [...current, key]
    );
  }

  function reconcileAssignment(change: AssignmentChange) {
    setItems((current) =>
      current.map((item) =>
        item.contentType === change.contentType && item.id === change.id
          ? {
              ...item,
              assignedToId: change.assignedToId,
              assignedToName: change.assignedToName,
              isUnassigned: false,
              ...(typeof change.version === 'number' ? { version: change.version } : {}),
            }
          : item
      )
    );
  }

  function paginationHref(cursor: number) {
    const params = new URLSearchParams();
    params.set('view', overview.filters.view);
    if (overview.filters.search) params.set('search', overview.filters.search);
    if (overview.filters.contentType !== 'all') params.set('contentType', overview.filters.contentType);
    if (overview.filters.status !== 'all') params.set('status', overview.filters.status);
    if (overview.filters.priority !== 'all') params.set('priority', overview.filters.priority);
    if (overview.filters.assignee) params.set('assignee', overview.filters.assignee);
    if (overview.filters.sort !== 'updated_desc') params.set('sort', overview.filters.sort);
    if (cursor > 0) params.set('cursor', String(cursor));
    return `${routePath}?${params.toString()}`;
  }

  const routeHeader = QUEUE_ROUTE_HEADERS[routePath] || DEFAULT_ROUTE_HEADER;
  const statusOptions =
    routePath === '/admin/content-queue'
      ? CONTENT_QUEUE_STATUS_OPTIONS
      : routePath === '/admin/review-queue'
        ? REVIEW_QUEUE_STATUS_OPTIONS
        : ALL_STATUS_OPTIONS;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 pb-10 sm:px-5 lg:px-6">
      <section className="admin-shell-surface-strong overflow-hidden rounded-[24px] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-600">
              {routeHeader.eyebrow[language]}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[color:var(--admin-shell-text)]">
              {routeHeader.title[language]}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[color:var(--admin-shell-text-muted)]">
              {routeHeader.description[language]}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:min-w-[620px]">
            {WORK_QUEUE_VIEWS.filter((view) => view !== 'all').map((view) => (
              <Link
                key={view}
                href={viewHref(view)}
                className={cx(
                  'rounded-2xl border px-3 py-2.5 text-left transition-colors',
                  overview.filters.view === view
                    ? 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                    : 'border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] text-[color:var(--admin-shell-text-muted)] hover:text-[color:var(--admin-shell-text)]'
                )}
              >
                <span className="block text-lg font-black">{overview.viewCounts[view]}</span>
                <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-[0.1em]">{VIEW_LABELS[view][language]}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {routePath === '/admin/my-work' || overview.filters.view === 'mine' ? (
        <section aria-label={language === 'hi' ? 'त्वरित फ़िल्टर' : 'Quick filters'} className="admin-shell-surface rounded-[22px] p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--admin-shell-text-muted)]">
            {language === 'hi' ? 'त्वरित फ़िल्टर' : 'Quick Filters'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {MY_WORK_QUICK_FILTERS.map((filter) => {
              const active = isQuickFilterActive(filter);
              return (
                <Link
                  key={filter.id}
                  href={quickFilterHref(filter.view, filter.status)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'inline-flex items-center rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors',
                    active
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                      : 'border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] text-[color:var(--admin-shell-text-muted)] hover:text-[color:var(--admin-shell-text)]'
                  )}
                >
                  {filter.label[language]}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="admin-shell-surface rounded-[22px] p-4 sm:p-5">
        <form
          method="get"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const params = new URLSearchParams();
            formData.forEach((value, key) => {
              if (typeof value === 'string' && value.trim()) {
                params.set(key, value.trim());
              }
            });
            router.push(`${routePath}?${params.toString()}`);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="view" value={overview.filters.view} />
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--admin-shell-text-muted)]">
            <Filter className="h-4 w-4" /> {t.filters}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(130px,0.7fr))_auto]">
            <label className="relative min-w-0">
              <span className="sr-only">{t.search}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--admin-shell-text-muted)]" />
              <input name="search" defaultValue={overview.filters.search} placeholder={t.search} className="h-11 w-full rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] pl-10 pr-3 text-sm text-[color:var(--admin-shell-text)] outline-none focus:border-rose-500" />
            </label>
            <select name="contentType" defaultValue={overview.filters.contentType} aria-label={t.content} className="h-11 rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-3 text-sm text-[color:var(--admin-shell-text)]">
              <option value="all">{t.content}: All</option><option value="article">Articles</option><option value="story">Stories</option><option value="video">Videos</option><option value="epaper">Publications</option>
            </select>
            <select name="status" defaultValue={overview.filters.status} aria-label={t.status} className="h-11 rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-3 text-sm text-[color:var(--admin-shell-text)]">
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label[language]}
                </option>
              ))}
            </select>
            <select name="priority" defaultValue={overview.filters.priority} aria-label={t.priority} className="h-11 rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-3 text-sm text-[color:var(--admin-shell-text)]">
              <option value="all">{t.priority}: All</option><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
            </select>
            <select name="sort" defaultValue={overview.filters.sort} aria-label={t.sort} className="h-11 rounded-xl border border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-3 text-sm text-[color:var(--admin-shell-text)]">
              <option value="updated_desc">Recently updated</option><option value="due_asc">Due soon</option><option value="priority_desc">Highest priority</option><option value="title_asc">Title A–Z</option>
            </select>
            <div className="flex gap-2">
              <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-xs font-bold uppercase tracking-[0.1em] text-white dark:bg-white dark:text-zinc-950"><SlidersHorizontal className="h-4 w-4" />{t.apply}</button>
              <Link href={`${routePath}?view=${overview.filters.view}`} className="inline-flex h-11 items-center rounded-xl border border-[color:var(--admin-shell-border)] px-3 text-xs font-bold text-[color:var(--admin-shell-text-muted)]">{t.reset}</Link>
            </div>
          </div>
        </form>
      </section>

      {canManageAssignments && selectedIds.length ? (
        <section className="sticky top-[76px] z-20 flex flex-col gap-3 rounded-2xl border border-blue-500/25 bg-blue-600 px-4 py-3 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold">{selectedIds.length} {t.selected}</p><p className="text-xs text-blue-100">{t.bulkHint}</p></div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/work/bulk?items=${encodeURIComponent(selectedIds.join(','))}`} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-blue-700">Open bulk triage</Link>
            <button type="button" onClick={() => setSelectedIds([])} className="rounded-xl border border-white/30 px-3 py-2 text-xs font-bold">{t.clear}</button>
          </div>
        </section>
      ) : null}

      <section className="admin-shell-surface overflow-hidden rounded-[22px]">
        <div className="flex items-center justify-between border-b border-[color:var(--admin-shell-border)] px-4 py-4 sm:px-5">
          <div><h2 className="text-lg font-black text-[color:var(--admin-shell-text)]">{VIEW_LABELS[overview.filters.view][language]}</h2><p className="text-xs text-[color:var(--admin-shell-text-muted)]">{overview.total} work item{overview.total === 1 ? '' : 's'}</p></div>
          <ListChecks className="h-5 w-5 text-rose-500" />
        </div>
        <div className={cx(
          'hidden gap-3 border-b border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell-surface-muted)] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--admin-shell-text-muted)] lg:grid',
          canManageAssignments
            ? 'grid-cols-[36px_minmax(260px,1.55fr)_0.55fr_0.75fr_0.65fr_0.65fr_160px]'
            : 'grid-cols-[minmax(260px,1.55fr)_0.55fr_0.75fr_0.65fr_0.65fr_160px]'
        )}>
          {canManageAssignments ? <span /> : null}<span>{t.item}</span><span>{t.status}</span><span>{t.owner}</span><span>{t.due}</span><span>{t.readiness}</span><span>{t.next}</span>
        </div>
        {items.length ? (
          <div className="divide-y divide-[color:var(--admin-shell-border)]">
            {items.map((item) => {
              const key = `${item.contentType}:${item.id}`;
              return (
                <article key={key} className={cx(
                  'group grid gap-3 px-4 py-4 transition-colors hover:bg-[color:var(--admin-shell-surface-muted)] lg:items-center',
                  canManageAssignments
                    ? 'lg:grid-cols-[36px_minmax(260px,1.55fr)_0.55fr_0.75fr_0.65fr_0.65fr_160px]'
                    : 'lg:grid-cols-[minmax(260px,1.55fr)_0.55fr_0.75fr_0.65fr_0.65fr_160px]'
                )}>
                  {canManageAssignments ? <label className="hidden lg:block"><span className="sr-only">Select {item.title}</span><input type="checkbox" checked={selectedIds.includes(key)} onChange={() => toggleSelection(item)} className="h-4 w-4 rounded border-zinc-400 accent-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500" /></label> : null}
                  <button type="button" onClick={() => setPreviewId(key)} className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-600">{itemTypeLabel(item)}</span>{item.isOverdue ? <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600">{t.overdue}</span> : null}{item.isUnassigned ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">{t.unassigned}</span> : null}</div>
                    <h3 className="mt-1 line-clamp-2 text-sm font-bold text-[color:var(--admin-shell-text)]">{item.title}</h3>
                    <p className="mt-1 truncate text-xs text-[color:var(--admin-shell-text-muted)]">{item.category} · Updated {formatDate(item.updatedAt, language)}</p>
                  </button>
                  <div><CmsWorkflowStatusBadge status={item.status} />{item.priority ? <div className="mt-1"><CmsWorkflowPriorityBadge priority={item.priority} /></div> : null}</div>
                  <div className="flex items-center gap-2 text-xs text-[color:var(--admin-shell-text-muted)]"><UserRound className="h-4 w-4 shrink-0" /><span className="truncate">{item.assignedToName || t.unassigned}</span></div>
                  <div className={cx('flex items-center gap-2 text-xs', item.isOverdue ? 'font-bold text-rose-600' : 'text-[color:var(--admin-shell-text-muted)]')}><CalendarClock className="h-4 w-4 shrink-0" />{formatDate(item.dueAt || item.scheduledFor, language)}</div>
                  <div><span className={cx('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]', readinessTone(item))}>{item.readiness.score}% · {item.readiness.state === 'ready' ? t.ready : item.readiness.state === 'blocked' ? t.blocked : t.needsAttention}</span></div>
                  <button type="button" onClick={() => setPreviewId(key)} className="inline-flex h-9 items-center justify-between gap-2 rounded-xl border border-[color:var(--admin-shell-border)] px-3 text-xs font-bold text-[color:var(--admin-shell-text)] hover:border-rose-500/35">{item.nextActionLabel}<ChevronRight className="h-4 w-4" /></button>
                  {canManageAssignments ? <label className="flex items-center gap-2 lg:hidden"><input type="checkbox" checked={selectedIds.includes(key)} onChange={() => toggleSelection(item)} className="h-4 w-4 accent-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500" /><span className="text-xs text-[color:var(--admin-shell-text-muted)]">Select for triage</span></label> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <Inbox className="mx-auto h-10 w-10 text-emerald-500" />
            <h3 className="mt-4 text-lg font-black text-[color:var(--admin-shell-text)]">{emptyState.title}</h3>
            <p className="mt-1 text-sm text-[color:var(--admin-shell-text-muted)]">{emptyState.description}</p>
            {emptyState.action ? (
              <div className="mt-5">
                <Link
                  href={emptyState.action.href}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-rose-700"
                >
                  {emptyState.action.label}
                </Link>
              </div>
            ) : null}
          </div>
        )}
        {overview.filters.cursor > 0 || overview.nextCursor ? (
          <div className="flex items-center justify-between border-t border-[color:var(--admin-shell-border)] px-4 py-3 text-xs font-bold">
            {overview.filters.cursor > 0 ? <Link href={paginationHref(Math.max(0, overview.filters.cursor - 30))} className="admin-shell-toolbar-btn rounded-xl px-3 py-2">{language === 'hi' ? '\u092a\u093f\u091b\u0932\u093e \u092a\u0947\u091c' : 'Previous page'}</Link> : <span />}
            {overview.nextCursor ? <Link href={paginationHref(Number(overview.nextCursor))} className="admin-shell-toolbar-btn rounded-xl px-3 py-2">{language === 'hi' ? '\u0905\u0917\u0932\u093e \u092a\u0947\u091c' : 'Next page'}</Link> : null}
          </div>
        ) : null}
      </section>

      {previewItem ? (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/45 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="work-item-title">
          <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 cursor-default" onClick={() => setPreviewId(null)} />
          <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-[color:var(--admin-shell-border)] bg-[color:var(--admin-shell)] p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600">{t.details}</p><h2 id="work-item-title" className="mt-2 text-2xl font-black text-[color:var(--admin-shell-text)]">{previewItem.title}</h2><p className="mt-2 text-sm text-[color:var(--admin-shell-text-muted)]">{itemTypeLabel(previewItem)} · {previewItem.category}</p></div><button ref={closeButtonRef} type="button" onClick={() => setPreviewId(null)} aria-label={language === 'hi' ? '\u0935\u093f\u0935\u0930\u0923 \u092c\u0902\u0926 \u0915\u0930\u0947\u0902' : 'Close work item details'} className="rounded-xl border border-[color:var(--admin-shell-border)] p-2 text-[color:var(--admin-shell-text)]"><X className="h-5 w-5" /></button></div>
            <div className="mt-5 flex flex-wrap gap-2"><CmsWorkflowStatusBadge status={previewItem.status} />{previewItem.priority ? <CmsWorkflowPriorityBadge priority={previewItem.priority} /> : null}{previewItem.isOverdue ? <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-600">{t.overdue}</span> : null}</div>
            <div className="mt-6 grid grid-cols-2 gap-3"><div className="admin-shell-surface-muted rounded-2xl p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">{t.owner}</p><p className="mt-1 text-sm font-bold text-[color:var(--admin-shell-text)]">{previewItem.assignedToName || t.unassigned}</p></div><div className="admin-shell-surface-muted rounded-2xl p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--admin-shell-text-muted)]">{t.due}</p><p className="mt-1 text-sm font-bold text-[color:var(--admin-shell-text)]">{formatDate(previewItem.dueAt || previewItem.scheduledFor, language)}</p></div></div>
            {canManageAssignments ? (
              <AssignmentTriageControl item={previewItem} onAssigned={reconcileAssignment} />
            ) : null}
            <section className="mt-6"><h3 className="flex items-center gap-2 text-sm font-black text-[color:var(--admin-shell-text)]"><CheckCircle2 className="h-4 w-4 text-emerald-500" />{t.checks}</h3><div className="mt-3 space-y-2">{previewItem.readiness.checks.map((check) => <div key={check.id} className="admin-shell-surface-muted flex gap-3 rounded-2xl p-3">{check.status === 'complete' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : check.status === 'blocked' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}<div><p className="text-sm font-bold text-[color:var(--admin-shell-text)]">{check.label}</p><p className="mt-0.5 text-xs leading-5 text-[color:var(--admin-shell-text-muted)]">{check.detail}</p></div></div>)}</div></section>
            {previewItem.contentType !== 'epaper' ? <div className="mt-6"><DeskWorkflowActions role={role} contentType={previewItem.contentType} contentId={previewItem.id} version={previewItem.version} status={previewItem.status} editHref={previewItem.editHref} hasAssignment={!previewItem.isUnassigned} assignedToName={previewItem.assignedToName} isAssignedToCurrentUser={previewItem.isMine} canFastPublish={previewItem.availableActions.includes('fast_publish')} /></div> : <Link href={previewItem.editHref} className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-rose-600 px-4 text-sm font-bold text-white">Open publication production</Link>}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
