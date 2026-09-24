import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkQueueWorkbench from '@/components/admin/WorkQueueWorkbench';
import { useAppStore } from '@/lib/store/appStore';
import type { WorkQueueOverview } from '@/lib/admin/workQueue';
import { buildEditorialReadiness } from '@/lib/workflow/readiness';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const mockOverview: WorkQueueOverview = {
  total: 1,
  nextCursor: null,
  viewCounts: { mine: 1, unassigned: 0, review: 0, approval: 0, publishing: 0, overdue: 0, all: 1 },
  filters: { view: 'mine', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 },
  items: [
    {
      contentType: 'story',
      publicationType: null,
      id: 'story-drawer-1',
      title: 'Accessible Drawer Test Story',
      category: 'Local',
      author: 'Reporter',
      updatedAt: '2026-09-21T09:00:00.000Z',
      status: 'submitted',
      priority: 'normal',
      assignedToId: '',
      assignedToEmail: '',
      assignedToName: '',
      createdById: 'rep-1',
      createdByEmail: 'rep@lokswami.com',
      createdByName: 'Reporter',
      dueAt: null,
      scheduledFor: null,
      commentsCount: 0,
      readiness: buildEditorialReadiness({
        contentType: 'story',
        title: 'Accessible Drawer Test Story',
        category: 'Local',
      }),
      editHref: '/admin/stories/story-drawer-1/edit',
      deskHref: '/admin/stories',
      reporterSummary: null,
      copyEditorSummary: null,
      isMine: true,
      isUnassigned: true,
      isOverdue: false,
      availableActions: ['start_review'],
      nextAction: 'start_review',
      nextActionLabel: 'Start Review',
    },
  ],
};

describe('WorkQueueWorkbench Drawer Focus Management & Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: 'en' });
  });

  it('renders drawer with role="dialog", aria-modal="true", and moves focus to close button', () => {
    render(<WorkQueueWorkbench role="copy_editor" overview={mockOverview} routePath="/admin/work" />);

    const triggerButton = screen.getByRole('button', { name: /accessible drawer test story/i });
    triggerButton.focus();
    expect(document.activeElement).toBe(triggerButton);

    fireEvent.click(triggerButton);

    const dialog = screen.getByRole('dialog', { name: /accessible drawer test story/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Close button receives focus
    const closeBtn = screen.getByRole('button', { name: 'Close work item details' });
    expect(document.activeElement).toBe(closeBtn);
  });

  it('traps Tab and Shift+Tab key navigation inside drawer', () => {
    render(<WorkQueueWorkbench role="copy_editor" overview={mockOverview} routePath="/admin/work" />);

    const triggerButton = screen.getByRole('button', { name: /accessible drawer test story/i });
    fireEvent.click(triggerButton);

    const dialog = screen.getByRole('dialog', { name: /accessible drawer test story/i });
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => el.getAttribute('tabindex') !== '-1');

    expect(focusable.length).toBeGreaterThan(1);
    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    // Shift+Tab from first element wraps to last element
    firstElement.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastElement);

    // Tab from last element wraps to first element
    lastElement.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(firstElement);
  });

  it('closes drawer on Escape and restores focus to original trigger element', () => {
    render(<WorkQueueWorkbench role="copy_editor" overview={mockOverview} routePath="/admin/work" />);

    const triggerButton = screen.getByRole('button', { name: /accessible drawer test story/i });
    triggerButton.focus();
    fireEvent.click(triggerButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(triggerButton);
  });
});
