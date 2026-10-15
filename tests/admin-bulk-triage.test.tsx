import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BulkTriageClient from '@/app/(admin)/admin/work/bulk/BulkTriageClient';
import type { WorkQueueItem } from '@/lib/admin/workQueue';
import { buildEditorialReadiness } from '@/lib/workflow/readiness';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const readiness = buildEditorialReadiness({
  contentType: 'story',
  title: 'Bulk item',
  category: 'News',
  mediaUrl: '/image.jpg',
});

function item(id: string, title: string): WorkQueueItem {
  return {
    contentType: 'story',
    publicationType: null,
    id,
    version: 1,
    title,
    category: 'News',
    author: 'Reporter',
    updatedAt: '2026-09-20T10:00:00.000Z',
    status: 'submitted',
    priority: 'normal',
    assignedToId: '',
    assignedToEmail: '',
    assignedToName: '',
    createdById: 'reporter-1',
    createdByEmail: 'reporter@example.com',
    createdByName: 'Reporter',
    dueAt: null,
    scheduledFor: null,
    commentsCount: 0,
    readiness,
    editHref: `/admin/stories/${id}/edit`,
    deskHref: '/admin/stories',
    reporterSummary: null,
    copyEditorSummary: null,
    isMine: false,
    isUnassigned: true,
    isOverdue: false,
    availableActions: ['assign'],
    nextAction: 'assign',
    nextActionLabel: 'Assign owner',
  };
}

describe('BulkTriageClient safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    refreshMock.mockReset();
  });

  it('requires explicit confirmation and reconciles a partial result to failed items only', async () => {
    const items = [item('story-1', 'First story'), item('story-2', 'Second story')];
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).includes('assignee-suggestions')) {
        return Response.json({
          success: true,
          data: [{
            id: 'copy-1',
            name: 'Copy Editor',
            role: 'copy_editor',
            isActive: true,
            activeWorkload: 4,
            overdueWorkload: 2,
          }],
        });
      }
      expect(String(input)).toBe('/api/admin/work-queue/bulk');
      const body = JSON.parse(String(init?.body));
      expect(body.items.map((entry: { id: string }) => entry.id)).toEqual(['story-1', 'story-2']);
      return Response.json({
        success: false,
        partial: true,
        data: {
          succeeded: 1,
          failed: 1,
          results: [
            { contentType: 'story', id: 'story-1', success: true, status: 200 },
            { contentType: 'story', id: 'story-2', success: false, status: 409, error: 'Refresh and retry.' },
          ],
        },
      });
    });

    render(<BulkTriageClient items={items} />);
    expect(screen.getByRole('heading', { name: '2 selected items' })).toBeInTheDocument();
    const assignee = await screen.findByRole('combobox', { name: /Assign to/ });
    fireEvent.change(assignee, { target: { value: 'copy-1' } });

    const apply = screen.getByRole('button', { name: 'Apply triage to 2 items' });
    expect(apply).toBeDisabled();
    expect(screen.getByText(/Target owner: Copy Editor/)).toBeInTheDocument();
    expect(screen.getByText(/4 active assigned items · 2 overdue/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm assigning exactly 2 selected items/ }));
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    await waitFor(() => expect(screen.getByRole('heading', { name: '1 selected item' })).toBeInTheDocument());
    expect(screen.queryByText('First story')).not.toBeInTheDocument();
    expect(screen.getByText('Second story')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('1 updated · 1 failed');
    expect(screen.getByRole('alert')).toHaveTextContent('Refresh and retry.');
    expect(refreshMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
