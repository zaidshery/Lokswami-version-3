import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkQueueWorkbench from '@/components/admin/WorkQueueWorkbench';
import { useAppStore } from '@/lib/store/appStore';
import type { WorkQueueOverview } from '@/lib/admin/workQueue';
import { buildEditorialReadiness } from '@/lib/workflow/readiness';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: pushMock }) }));

const overview: WorkQueueOverview = {
  total: 31,
  nextCursor: '30',
  viewCounts: { mine: 31, unassigned: 1, review: 2, approval: 1, publishing: 1, overdue: 1, all: 31 },
  filters: { view: 'mine', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 },
  items: [{
    contentType: 'story', publicationType: null, id: 'story-1', title: 'My next story', category: 'Regional', author: 'Reporter', updatedAt: '2026-07-16T09:00:00.000Z', status: 'changes_requested', priority: 'high',
    assignedToId: 'reporter-1', assignedToEmail: 'reporter@example.com', assignedToName: 'Reporter', createdById: 'reporter-1', createdByEmail: 'reporter@example.com', createdByName: 'Reporter', dueAt: '2026-07-17T09:00:00.000Z', scheduledFor: null, commentsCount: 1,
    readiness: buildEditorialReadiness({ contentType: 'story', title: 'My next story', category: 'Regional', mediaUrl: '/story.jpg' }),
    editHref: '/admin/stories/story-1/edit', deskHref: '/admin/stories', reporterSummary: null, copyEditorSummary: null,
    isMine: true, isUnassigned: false, isOverdue: false, availableActions: ['submit'], nextAction: 'submit', nextActionLabel: 'Submit for review',
  }],
};

describe('WorkQueueWorkbench interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: 'en' });
  });

  it('opens an accessible preview, focuses close, and closes with Escape', () => {
    render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/work" />);
    fireEvent.click(screen.getByRole('button', { name: /my next story/i }));
    expect(screen.getByRole('dialog', { name: /my next story/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close work item details' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps pagination in the URL and exposes mobile-safe triage selection to an authorized Admin', () => {
    render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/work" />);
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/admin/work?view=mine&cursor=30');
    expect(screen.getByText('Select for triage')).toBeInTheDocument();
  });

  it('navigates cleanly via router.push when applying search filters without server action errors', () => {
    const { container } = render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/work" />);
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form).not.toHaveAttribute('action');
    fireEvent.submit(form!);
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/admin/work?view=mine'));
  });
});
