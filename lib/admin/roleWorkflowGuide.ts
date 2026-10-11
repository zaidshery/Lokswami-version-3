import type { AdminPageKey } from '@/lib/auth/permissions';
import type { AdminRole } from '@/lib/auth/roles';

export type RoleWorkflowGuideAction = {
  label: string;
  href: string;
  pageKey: AdminPageKey;
};

export type RoleWorkflowGuide = {
  eyebrow: string;
  title: string;
  summary: string;
  authority: string;
  steps: Array<{
    label: string;
    detail: string;
  }>;
  primaryAction: RoleWorkflowGuideAction;
  secondaryAction: RoleWorkflowGuideAction;
};

const GUIDES: Record<AdminRole, RoleWorkflowGuide> = {
  reporter: {
    eyebrow: 'Reporter workflow',
    title: 'Report, submit, respond',
    summary: 'Keep reporting work focused on verified facts, source notes, media, and a clear desk handoff.',
    authority: 'You own your drafts and requested revisions. The desk reviews, approves, schedules, and publishes.',
    steps: [
      { label: 'Build the story', detail: 'Add the reporting, location, source notes, and supporting media.' },
      { label: 'Submit once ready', detail: 'Send a complete draft to the desk instead of publishing directly.' },
      { label: 'Close feedback', detail: 'Address every requested change and resubmit with the desk note in view.' },
    ],
    primaryAction: { label: 'Create story', href: '/admin/stories/new', pageKey: 'story_create' },
    secondaryAction: { label: 'Open my work', href: '/admin/my-work', pageKey: 'my_work' },
  },
  copy_editor: {
    eyebrow: 'Copy desk workflow',
    title: 'Claim, polish, hand off',
    summary: 'Move assigned articles, stories, and videos through review, copy edit, and ready-for-approval with actionable notes.',
    authority: 'You prepare assigned editorial content for Admin approval. Super Admin owns E-Papers and monthly E-Magazine issues, including production, publication, and archiving.',
    steps: [
      { label: 'Claim or open assigned work', detail: 'Start with submitted stories and your assigned editorial work.' },
      { label: 'Review with evidence', detail: 'Check facts, language, headlines, media, and editorial readiness.' },
      { label: 'Route clearly', detail: 'Request specific changes or mark the item ready for admin approval.' },
    ],
    primaryAction: { label: 'Open copy desk', href: '/admin/copy-desk', pageKey: 'copy_desk' },
    secondaryAction: { label: 'Open articles', href: '/admin/articles', pageKey: 'articles' },
  },
  admin: {
    eyebrow: 'Admin desk workflow',
    title: 'Assign, decide, release',
    summary: 'Keep ownership explicit, unblock the desk, approve only ready work, and make final release decisions.',
    authority: 'You manage assignments and release articles, stories, and videos. Super Admin owns E-Papers and E-Magazine releases. E-Paper is daily and city/edition-based; E-Magazine is a monthly issue product.',
    steps: [
      { label: 'Triage and assign', detail: 'Give every active item an owner, priority, and useful due time.' },
      { label: 'Resolve blockers', detail: 'Use desk feedback, readiness checks, and operations signals before approval.' },
      { label: 'Approve and release', detail: 'Schedule or publish only after the workflow and publication gates are clear.' },
    ],
    primaryAction: { label: 'Open assignments', href: '/admin/assignments', pageKey: 'assignments' },
    secondaryAction: { label: 'Open content queue', href: '/admin/content-queue', pageKey: 'content_queue' },
  },
  super_admin: {
    eyebrow: 'Leadership workflow',
    title: 'Govern, monitor, improve',
    summary: 'Keep permissions, platform health, newsroom coverage, and release risk visible without bypassing desk ownership.',
    authority: 'You control governance, system-level settings, and all E-Paper and monthly E-Magazine production, publication, and archiving. Editorial work remains role-accountable and auditable.',
    steps: [
      { label: 'Watch risk', detail: 'Review operational blockers, dependency health, and release readiness.' },
      { label: 'Protect access', detail: 'Audit role coverage, inactive accounts, and leadership-only permissions.' },
      { label: 'Improve the system', detail: 'Use workflow and audience signals to remove recurring newsroom friction.' },
    ],
    primaryAction: { label: 'Open operations', href: '/admin/operations', pageKey: 'operations_center' },
    secondaryAction: { label: 'Review permissions', href: '/admin/permission-review', pageKey: 'permission_review' },
  },
};

export function getRoleWorkflowGuide(role: AdminRole): RoleWorkflowGuide {
  return GUIDES[role];
}
