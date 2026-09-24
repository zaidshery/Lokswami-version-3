import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkQueueWorkbench from '@/components/admin/WorkQueueWorkbench';
import type { WorkQueueOverview } from '@/lib/admin/workQueue';
import { canViewPage } from '@/lib/auth/permissions';
import { useAppStore } from '@/lib/store/appStore';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

function createOverview(overrides: Partial<WorkQueueOverview> = {}): WorkQueueOverview {
  return {
    total: 0,
    nextCursor: null,
    viewCounts: {
      mine: 0,
      unassigned: 0,
      review: 0,
      approval: 0,
      publishing: 0,
      overdue: 0,
      all: 0,
    },
    filters: {
      view: 'review',
      contentType: 'all',
      status: 'all',
      priority: 'all',
      assignee: '',
      search: '',
      sort: 'updated_desc',
      cursor: 0,
    },
    items: [],
    ...overrides,
  };
}

describe('Phase 3.6D: Review Queue + Content Queue Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: 'en' });
  });

  describe('A: Route-context headers', () => {
    it('renders Review Queue identity on /admin/review-queue', () => {
      const overview = createOverview({ filters: { view: 'review', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/review-queue" />);

      expect(screen.getByText('Review desk')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Review Queue' })).toBeInTheDocument();
      expect(
        screen.getByText('Editorial review, fact-checking, copy editing, and pre-approval triage across all desks.')
      ).toBeInTheDocument();
    });

    it('renders Content Queue identity on /admin/content-queue', () => {
      const overview = createOverview({ filters: { view: 'publishing', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/content-queue" />);

      expect(screen.getByText('Publishing desk')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Content Queue' })).toBeInTheDocument();
      expect(
        screen.getByText('Approved articles, stories, videos, and editions waiting for schedule and publication release.')
      ).toBeInTheDocument();
    });

    it('preserves My Work identity on /admin/my-work', () => {
      const overview = createOverview({ filters: { view: 'mine', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      expect(screen.getByText('My Work', { selector: 'p' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'My Work' })).toBeInTheDocument();
      expect(
        screen.getByText('Personal stories, drafts, reviews, and assignments assigned to or created by you.')
      ).toBeInTheDocument();
    });

    it('preserves canonical Work Queue identity on /admin/work', () => {
      const overview = createOverview({ filters: { view: 'all', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/work" />);

      expect(screen.getByText('Action desk')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Work Queue' })).toBeInTheDocument();
      expect(
        screen.getByText('One role-aware workspace for reporting, review, assignments, production, approval, and release.')
      ).toBeInTheDocument();
    });
  });

  describe('B: Canonical tab navigation', () => {
    it('routes out-of-context tabs to /admin/work when on /admin/review-queue', () => {
      const overview = createOverview({ filters: { view: 'review', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/review-queue" />);

      // Current view remains on dedicated entrypoint
      expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/admin/review-queue?view=review');

      // Switching away goes to canonical work queue
      expect(screen.getByRole('link', { name: /publishing/i })).toHaveAttribute('href', '/admin/work?view=publishing');
      expect(screen.getByRole('link', { name: /unassigned/i })).toHaveAttribute('href', '/admin/work?view=unassigned');
      expect(screen.getByRole('link', { name: /approval/i })).toHaveAttribute('href', '/admin/work?view=approval');
      expect(screen.getByRole('link', { name: /mine/i })).toHaveAttribute('href', '/admin/work?view=mine');
      expect(screen.getByRole('link', { name: /overdue/i })).toHaveAttribute('href', '/admin/work?view=overdue');
    });

    it('routes out-of-context tabs to /admin/work when on /admin/content-queue', () => {
      const overview = createOverview({ filters: { view: 'publishing', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/content-queue" />);

      // Current view remains on dedicated entrypoint
      expect(screen.getByRole('link', { name: /publishing/i })).toHaveAttribute('href', '/admin/content-queue?view=publishing');

      // Switching away goes to canonical work queue
      expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/admin/work?view=review');
      expect(screen.getByRole('link', { name: /unassigned/i })).toHaveAttribute('href', '/admin/work?view=unassigned');
      expect(screen.getByRole('link', { name: /approval/i })).toHaveAttribute('href', '/admin/work?view=approval');
      expect(screen.getByRole('link', { name: /mine/i })).toHaveAttribute('href', '/admin/work?view=mine');
    });

    it('routes all tabs to /admin/work when on canonical /admin/work', () => {
      const overview = createOverview({ filters: { view: 'all', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/work" />);

      expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/admin/work?view=review');
      expect(screen.getByRole('link', { name: /publishing/i })).toHaveAttribute('href', '/admin/work?view=publishing');
      expect(screen.getByRole('link', { name: /unassigned/i })).toHaveAttribute('href', '/admin/work?view=unassigned');
      expect(screen.getByRole('link', { name: /approval/i })).toHaveAttribute('href', '/admin/work?view=approval');
      expect(screen.getByRole('link', { name: /mine/i })).toHaveAttribute('href', '/admin/work?view=mine');
    });
  });

  describe('C: Copy Desk navigation', () => {
    it('points Back To Review Queue to accessible /admin/work?view=review and never to forbidden /admin/review-queue', () => {
      const source = fs.readFileSync(path.resolve(process.cwd(), 'app/(admin)/admin/copy-desk/page.tsx'), 'utf8');
      expect(source).toContain('href="/admin/work?view=review"');
      expect(source).not.toContain('href="/admin/review-queue"');
    });

    it('allows copy_editor to access /admin/work (work_queue) while keeping dedicated /admin/review-queue denied', () => {
      expect(canViewPage('copy_editor', 'work_queue')).toBe(true);
      expect(canViewPage('copy_editor', 'review_queue')).toBe(false);
      expect(canViewPage('copy_editor', 'content_queue')).toBe(false);
    });
  });

  describe('D & E: Filter harmony', () => {
    it('restricts status dropdown on /admin/content-queue to publishing-relevant states', () => {
      const overview = createOverview({ filters: { view: 'publishing', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/content-queue" />);

      const select = screen.getByRole('combobox', { name: 'Status' });
      const options = Array.from(select.querySelectorAll('option')).map((opt) => opt.value);

      expect(options).toEqual(['all', 'approved', 'scheduled', 'ready_to_publish']);
      expect(options).not.toContain('draft');
      expect(options).not.toContain('submitted');
      expect(options).not.toContain('in_review');
      expect(options).not.toContain('copy_edit');
      expect(options).not.toContain('changes_requested');
      expect(screen.getByText('All publishing statuses')).toBeInTheDocument();
    });

    it('restricts status dropdown on /admin/review-queue to review-relevant states', () => {
      const overview = createOverview({ filters: { view: 'review', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/review-queue" />);

      const select = screen.getByRole('combobox', { name: 'Status' });
      const options = Array.from(select.querySelectorAll('option')).map((opt) => opt.value);

      expect(options).toEqual([
        'all',
        'submitted',
        'assigned',
        'in_review',
        'copy_edit',
        'changes_requested',
        'pages_ready',
        'ocr_review',
        'hotspot_mapping',
      ]);
      expect(options).not.toContain('approved');
      expect(options).not.toContain('scheduled');
      expect(options).not.toContain('ready_to_publish');
      expect(screen.getByText('All review statuses')).toBeInTheDocument();
    });

    it('preserves full status options on canonical /admin/work', () => {
      const overview = createOverview({ filters: { view: 'all', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 } });
      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/work" />);

      const select = screen.getByRole('combobox', { name: 'Status' });
      const options = Array.from(select.querySelectorAll('option')).map((opt) => opt.value);

      expect(options).toContain('draft');
      expect(options).toContain('submitted');
      expect(options).toContain('in_review');
      expect(options).toContain('approved');
      expect(options).toContain('scheduled');
      expect(options).toContain('ready_to_publish');
    });
  });

  describe('F: Role access policy', () => {
    it('maintains strict role matrix for review and content queues', () => {
      expect(canViewPage('super_admin', 'review_queue')).toBe(true);
      expect(canViewPage('super_admin', 'content_queue')).toBe(true);
      expect(canViewPage('admin', 'review_queue')).toBe(true);
      expect(canViewPage('admin', 'content_queue')).toBe(true);
      expect(canViewPage('copy_editor', 'review_queue')).toBe(false);
      expect(canViewPage('copy_editor', 'content_queue')).toBe(false);
      expect(canViewPage('reporter', 'review_queue')).toBe(false);
      expect(canViewPage('reporter', 'content_queue')).toBe(false);
    });
  });
});
