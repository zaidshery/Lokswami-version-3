import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkQueueOverview, WorkQueueItem } from '@/lib/admin/workQueue';
import { buildEditorialReadiness } from '@/lib/workflow/readiness';
import ActionFirstDashboard from '@/components/admin/ActionFirstDashboard';
import NewsroomError from '@/app/(admin)/admin/error';
import NewsroomLoading from '@/app/(admin)/admin/loading';

// Mock next/link to render a simple anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement('a', { href, ...props }, children),
}));

// Mock app store to control language
const storeMock = vi.hoisted(() => ({
  language: 'en' as 'en' | 'hi',
}));

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: (selector: (state: { language: string }) => unknown) =>
    selector({ language: storeMock.language }),
}));

const baseItem: WorkQueueItem = {
  id: 'item-1',
  contentType: 'article',
  publicationType: null,
  title: 'Test Investigation Story',
  category: 'National',
  author: 'Staff Reporter',
  status: 'draft',
  priority: 'normal',
  assignedToId: 'user-reporter',
  assignedToEmail: 'reporter@lokswami.in',
  assignedToName: 'Test Reporter',
  createdById: 'user-reporter',
  createdByEmail: 'reporter@lokswami.in',
  createdByName: 'Test Reporter',
  dueAt: null,
  scheduledFor: null,
  commentsCount: 0,
  editHref: '/admin/articles/item-1/edit',
  deskHref: '/admin/work',
  updatedAt: new Date().toISOString(),
  readiness: buildEditorialReadiness({
    contentType: 'article',
    title: 'Test Investigation Story',
    category: 'National',
  }),
  version: 1,
  reporterSummary: null,
  copyEditorSummary: null,
  isMine: true,
  isUnassigned: false,
  isOverdue: false,
  availableActions: ['submit'],
  nextAction: 'submit',
  nextActionLabel: 'Submit for review',
};

function createOverview(items: WorkQueueItem[] = []): WorkQueueOverview {
  return {
    items,
    total: items.length,
    nextCursor: null,
    viewCounts: {
      mine: items.filter((i) => i.isMine).length,
      unassigned: items.filter((i) => i.isUnassigned).length,
      review: items.filter((i) =>
        ['submitted', 'in_review', 'copy_edit', 'changes_requested'].includes(i.status)
      ).length,
      approval: items.filter((i) => i.status === 'ready_for_approval').length,
      publishing: items.filter((i) =>
        ['approved', 'scheduled', 'ready_to_publish'].includes(i.status)
      ).length,
      overdue: items.filter((i) => i.isOverdue).length,
      all: items.length,
    },
    filters: {
      view: 'all',
      contentType: 'all',
      status: 'all',
      priority: 'all',
      search: '',
      sort: 'priority_desc',
      assignee: '',
      cursor: 0,
    },
  };
}

describe('Phase 3.6A Role-Aware Mission Dashboard', () => {
  afterEach(() => {
    cleanup();
    storeMock.language = 'en';
  });

  describe('REPORTER Mission', () => {
    it('renders reporter mission header, actions, and priority lanes', () => {
      const items: WorkQueueItem[] = [
        {
          ...baseItem,
          id: 'rep-draft',
          title: 'Draft story needing edits',
          status: 'changes_requested',
        },
        {
          ...baseItem,
          id: 'rep-assigned',
          title: 'Assigned interview pitch',
          status: 'assigned',
        },
        {
          ...baseItem,
          id: 'rep-submitted',
          title: 'Submitted coverage',
          status: 'submitted',
        },
        {
          ...baseItem,
          id: 'rep-approved',
          title: 'Approved investigation',
          status: 'approved',
        },
      ];

      render(
        <ActionFirstDashboard
          overview={createOverview(items)}
          role="reporter"
          userName="Reporter Alice"
        />
      );

      // Verify mission eyebrow and title
      expect(screen.getByText(/Reporter Mission/i)).toBeInTheDocument();
      expect(screen.getByText(/My Assignments & Stories/i)).toBeInTheDocument();
      expect(screen.getByText(/Reporter Alice/i)).toBeInTheDocument();

      // Verify reporter quick action links
      expect(screen.getByRole('link', { name: /Create Story/i })).toHaveAttribute(
        'href',
        '/admin/stories/new'
      );
      expect(screen.getByRole('link', { name: /Create Article/i })).toHaveAttribute(
        'href',
        '/admin/articles/new'
      );
      expect(screen.getByRole('link', { name: /My Work/i })).toHaveAttribute(
        'href',
        '/admin/my-work'
      );

      // Verify reporter action lanes
      expect(screen.getByText(/Changes Requested & Drafts/i)).toBeInTheDocument();
      expect(screen.getByText(/Active Assignments & In Review/i)).toBeInTheDocument();
      expect(screen.getByText(/Submitted for Desk Review/i)).toBeInTheDocument();
      expect(screen.getByText(/Approved & Upcoming Deadlines/i)).toBeInTheDocument();

      // Verify items render in their respective lanes
      expect(screen.getByText('Draft story needing edits')).toBeInTheDocument();
      expect(screen.getByText('Assigned interview pitch')).toBeInTheDocument();
      expect(screen.getByText('Submitted coverage')).toBeInTheDocument();
      expect(screen.getByText('Approved investigation')).toBeInTheDocument();

      // ROLE SAFETY: Reporter must NOT see admin triage controls or Super Admin control plane
      expect(screen.queryByText(/Unassigned Work & Triage/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Awaiting Leadership Approval/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Control Plane:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Team Management/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Global Settings/i)).not.toBeInTheDocument();
    });

    it('renders informative empty states when lanes have no items', () => {
      render(
        <ActionFirstDashboard
          overview={createOverview([])}
          role="reporter"
        />
      );

      expect(
        screen.getByText(/No drafts or returned stories needing edits/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No active assignments in progress/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No submitted stories awaiting desk pickup/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No approved items or overdue deadlines/i)
      ).toBeInTheDocument();
    });
  });

  describe('COPY_EDITOR Mission', () => {
    it('renders copy desk review workload and approval-ready lanes', () => {
      const items: WorkQueueItem[] = [
        {
          ...baseItem,
          id: 'copy-waiting',
          title: 'Incoming news submission',
          status: 'submitted',
        },
        {
          ...baseItem,
          id: 'copy-active',
          title: 'Story in active editing',
          status: 'copy_edit',
        },
        {
          ...baseItem,
          id: 'copy-handoff',
          title: 'Story needing reporter fix',
          status: 'changes_requested',
        },
        {
          ...baseItem,
          id: 'copy-ready',
          title: 'Cleaned piece ready for sign-off',
          status: 'ready_for_approval',
        },
      ];

      render(
        <ActionFirstDashboard
          overview={createOverview(items)}
          role="copy_editor"
          userName="Editor Bob"
        />
      );

      // Verify mission eyebrow and title
      expect(screen.getByText(/Copy Desk Mission/i)).toBeInTheDocument();
      expect(screen.getByText(/Editorial Review & Copy Desk/i)).toBeInTheDocument();

      // Verify copy desk quick action links
      expect(screen.getByRole('link', { name: /Open Copy Desk/i })).toHaveAttribute(
        'href',
        '/admin/copy-desk'
      );
      expect(screen.getByRole('link', { name: /Review Queue/i })).toHaveAttribute(
        'href',
        '/admin/work?view=review'
      );

      // Verify copy editor action lanes
      expect(screen.getByText(/Items Waiting for Review/i)).toBeInTheDocument();
      expect(screen.getByText(/Active Copy Editing Work/i)).toBeInTheDocument();
      expect(screen.getByText(/Returned & Revision Handoffs/i)).toBeInTheDocument();
      expect(screen.getByText(/Ready for Approval & Overdue/i)).toBeInTheDocument();

      // ROLE SAFETY: Copy Editor must NOT see admin triage controls or Super Admin control plane
      expect(screen.queryByText(/Unassigned Work & Triage/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Assignments/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Control Plane:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Team Management/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Global Settings/i)).not.toBeInTheDocument();
    });
  });

  describe('ADMIN Mission', () => {
    it('renders newsroom triage, review backlog, and leadership approval lanes', () => {
      const items: WorkQueueItem[] = [
        {
          ...baseItem,
          id: 'admin-unassigned',
          title: 'Breaking tip unassigned',
          status: 'draft',
          isUnassigned: true,
          assignedToName: '',
        },
        {
          ...baseItem,
          id: 'admin-review',
          title: 'Review backlog item',
          status: 'in_review',
        },
        {
          ...baseItem,
          id: 'admin-approval',
          title: 'Major story awaiting approval',
          status: 'ready_for_approval',
        },
        {
          ...baseItem,
          id: 'admin-publishing',
          title: 'Approved package for release',
          status: 'approved',
        },
      ];

      render(
        <ActionFirstDashboard
          overview={createOverview(items)}
          role="admin"
          userName="Admin Chief"
        />
      );

      // Verify mission eyebrow and title
      expect(screen.getByText(/Newsroom Operations/i)).toBeInTheDocument();
      expect(screen.getByText(/Newsroom Workload & Editorial Triage/i)).toBeInTheDocument();

      // Verify admin quick action links
      expect(screen.getByRole('link', { name: /Assignments/i })).toHaveAttribute(
        'href',
        '/admin/assignments'
      );
      expect(screen.getByRole('link', { name: /Review Queue/i })).toHaveAttribute(
        'href',
        '/admin/review-queue'
      );

      // Verify admin action lanes
      expect(screen.getByText(/Unassigned Work & Triage/i)).toBeInTheDocument();
      expect(screen.getByText(/Editorial Review Backlog/i)).toBeInTheDocument();
      expect(screen.getByText(/Awaiting Leadership Approval/i)).toBeInTheDocument();
      expect(screen.getByText(/Publishing Gate & Overdue Risks/i)).toBeInTheDocument();

      // ROLE SAFETY: Admin must NOT see Super Admin control plane
      expect(screen.queryByText(/Control Plane:/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Team Management/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Global Settings/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Audit Log/i)).not.toBeInTheDocument();
    });
  });

  describe('SUPER_ADMIN Mission', () => {
    it('renders full operational newsroom overview and control plane navigation', () => {
      const items: WorkQueueItem[] = [
        {
          ...baseItem,
          id: 'super-risk',
          title: 'Overdue urgent report',
          status: 'in_review',
          isOverdue: true,
          dueAt: '2020-01-01T00:00:00Z',
          priority: 'urgent',
        },
        {
          ...baseItem,
          id: 'super-approval',
          title: 'Executive clearance needed',
          status: 'ready_for_approval',
        },
        {
          ...baseItem,
          id: 'super-release',
          title: 'Ready to publish headline',
          status: 'ready_to_publish',
        },
        {
          ...baseItem,
          id: 'super-flow',
          title: 'General newsroom piece',
          status: 'copy_edit',
        },
      ];

      render(
        <ActionFirstDashboard
          overview={createOverview(items)}
          role="super_admin"
          userName="Super Chief"
        />
      );

      // Verify mission eyebrow and title
      expect(screen.getByText(/Executive Operations/i)).toBeInTheDocument();
      expect(screen.getByText(/Executive Newsroom & Operations Overview/i)).toBeInTheDocument();

      // Verify super admin action lanes
      expect(screen.getByText(/Operational Risks & Overdue/i)).toBeInTheDocument();
      expect(screen.getByText(/Executive Approval Queue/i)).toBeInTheDocument();
      expect(screen.getByText(/Publication Gate & Releases/i)).toBeInTheDocument();
      expect(screen.getByText(/Active Newsroom Flow/i)).toBeInTheDocument();

      // Verify Super Admin Control Plane Shortcuts
      expect(screen.getByText(/Control Plane:/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Team Management/i })).toHaveAttribute(
        'href',
        '/admin/team'
      );
      expect(screen.getByRole('link', { name: /E-Paper Center/i })).toHaveAttribute(
        'href',
        '/admin/epapers'
      );
      expect(screen.getByRole('link', { name: /Audit Log/i })).toHaveAttribute(
        'href',
        '/admin/audit-log'
      );
      expect(screen.getByRole('link', { name: /Global Settings/i })).toHaveAttribute(
        'href',
        '/admin/settings'
      );
    });
  });

  describe('Accessibility & Priority Indicators', () => {
    it('renders non-color-only priority chips and overdue indicators', () => {
      const items: WorkQueueItem[] = [
        {
          ...baseItem,
          id: 'urgent-item',
          title: 'Urgent Flood Alert',
          priority: 'urgent',
          isBreaking: true,
          isOverdue: true,
          dueAt: '2026-01-01T12:00:00Z',
        },
      ];

      render(
        <ActionFirstDashboard
          overview={createOverview(items)}
          role="reporter"
        />
      );

      // Text labels for non-color-only indicators
      expect(screen.getAllByText(/Breaking/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Urgent/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Late/i).length).toBeGreaterThanOrEqual(1);
    });

    it('renders bilingual Hindi copy when configured', () => {
      storeMock.language = 'hi';

      render(
        <ActionFirstDashboard
          overview={createOverview([])}
          role="reporter"
        />
      );

      expect(screen.getByText(/रिपोर्टर मिशन/i)).toBeInTheDocument();
      expect(screen.getByText(/मेरा कार्य और स्टोरी असाइनमेंट/i)).toBeInTheDocument();
      expect(screen.getByText(/नई स्टोरी बनाएं/i)).toBeInTheDocument();
      expect(screen.getByText(/संशोधन अनुरोध और ड्राफ्ट्स/i)).toBeInTheDocument();
    });
  });

  describe('Error Boundary and Loading States', () => {
    it('renders NewsroomError with retry button and accessible role="alert"', () => {
      const resetMock = vi.fn();
      render(
        <NewsroomError
          error={new Error('Database timeout')}
          reset={resetMock}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Unable to load newsroom dashboard/i)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Try again/i });
      fireEvent.click(retryBtn);
      expect(resetMock).toHaveBeenCalledOnce();

      expect(screen.getByRole('link', { name: /Open Work Queue/i })).toHaveAttribute(
        'href',
        '/admin/work'
      );
    });

    it('renders NewsroomLoading skeleton with role="status"', () => {
      render(<NewsroomLoading />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });
});
