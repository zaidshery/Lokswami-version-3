import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkQueueWorkbench from '@/components/admin/WorkQueueWorkbench';
import WorkQueuePage from '@/components/admin/WorkQueuePage';
import { getWorkQueueOverview, type WorkQueueItem, type WorkQueueOverview } from '@/lib/admin/workQueue';
import { buildEditorialReadiness } from '@/lib/workflow/readiness';
import { useAppStore } from '@/lib/store/appStore';

const pushMock = vi.fn();
const redirectMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  redirect: (target: string) => {
    redirectMock(target);
    throw new Error(`REDIRECT:${target}`);
  },
}));

const { getAllWorkflowDeskItemsMock, mockSession } = vi.hoisted(() => ({
  getAllWorkflowDeskItemsMock: vi.fn(),
  mockSession: {
    admin: null as null | {
      id: string;
      email: string;
      name: string;
      role: 'super_admin' | 'admin' | 'copy_editor' | 'reporter';
    },
  },
}));

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: vi.fn(async () => mockSession.admin),
}));

vi.mock('@/lib/admin/articleWorkflowOverview', async () => {
  const actual = await vi.importActual<typeof import('@/lib/admin/articleWorkflowOverview')>(
    '@/lib/admin/articleWorkflowOverview'
  );
  return { ...actual, getAllWorkflowDeskItems: getAllWorkflowDeskItemsMock };
});

const readiness = buildEditorialReadiness({
  contentType: 'story',
  title: 'Test story',
  category: 'Regional',
  mediaUrl: '/media.jpg',
});

const baseDeskItem = {
  publicationType: null,
  version: 1,
  category: 'Regional',
  author: 'Reporter One',
  priority: 'normal' as const,
  assignedToId: 'reporter-1',
  assignedToEmail: 'reporter@example.com',
  assignedToName: 'Reporter One',
  createdById: 'reporter-1',
  createdByEmail: 'reporter@example.com',
  createdByName: 'Reporter One',
  dueAt: null,
  scheduledFor: null,
  commentsCount: 0,
  readiness,
  deskHref: '/admin/stories',
  editHref: '/admin/stories/1/edit',
  reporterSummary: null,
  copyEditorSummary: null,
};

function createWorkbenchOverview(
  overrides: Partial<WorkQueueOverview> = {},
  items: WorkQueueItem[] = []
): WorkQueueOverview {
  return {
    total: items.length,
    nextCursor: null,
    viewCounts: {
      mine: items.filter((i) => i.isMine).length,
      unassigned: items.filter((i) => i.isUnassigned).length,
      review: 0,
      approval: 0,
      publishing: 0,
      overdue: items.filter((i) => i.isOverdue).length,
      all: items.length,
    },
    filters: {
      view: 'mine',
      contentType: 'all',
      status: 'all',
      priority: 'all',
      assignee: '',
      search: '',
      sort: 'updated_desc',
      cursor: 0,
    },
    items,
    ...overrides,
  };
}

describe('Phase 3.6B: Work Queue + My Work Refinement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: 'en' });
    mockSession.admin = null;
  });

  describe('A. Canonical Unauthorized Destination', () => {
    it('redirects unauthenticated users to the signin flow', async () => {
      mockSession.admin = null;

      await expect(
        WorkQueuePage({
          searchParams: Promise.resolve({}),
          defaultView: 'mine',
          routePath: '/admin/my-work',
          requiredPageKey: 'my_work',
        })
      ).rejects.toThrow('REDIRECT:/signin?redirect=%2Fadmin%2Fmy-work');
    });

    it('redirects authenticated but unauthorized reporter on assignments to /admin/work?access=denied', async () => {
      mockSession.admin = {
        id: 'rep-1',
        email: 'rep@example.com',
        name: 'Reporter',
        role: 'reporter',
      };

      await expect(
        WorkQueuePage({
          searchParams: Promise.resolve({}),
          defaultView: 'unassigned',
          routePath: '/admin/assignments',
          requiredPageKey: 'assignments',
        })
      ).rejects.toThrow('REDIRECT:/admin/work?access=denied');
    });

    it('redirects authenticated but unauthorized reporter on review-queue to /admin/work?access=denied', async () => {
      mockSession.admin = {
        id: 'rep-1',
        email: 'rep@example.com',
        name: 'Reporter',
        role: 'reporter',
      };

      await expect(
        WorkQueuePage({
          searchParams: Promise.resolve({}),
          defaultView: 'review',
          routePath: '/admin/review-queue',
          requiredPageKey: 'review_queue',
        })
      ).rejects.toThrow('REDIRECT:/admin/work?access=denied');
    });

    it('redirects super_admin attempting /admin/my-work to /admin/work?access=denied', async () => {
      mockSession.admin = {
        id: 'sup-1',
        email: 'super@example.com',
        name: 'Super Admin',
        role: 'super_admin',
      };

      await expect(
        WorkQueuePage({
          searchParams: Promise.resolve({}),
          defaultView: 'mine',
          routePath: '/admin/my-work',
          requiredPageKey: 'my_work',
        })
      ).rejects.toThrow('REDIRECT:/admin/work?access=denied');
    });
  });

  describe('B. Reporter My Work Quick Filters', () => {
    it('renders all 6 role-appropriate quick filter pills on My Work', () => {
      const overview = createWorkbenchOverview();
      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      expect(screen.getByRole('link', { name: 'All My Work' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Drafts' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'In Review' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Changes Requested' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Approved' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Overdue' })).toBeInTheDocument();
    });

    it('indicates active state on the selected quick filter pill', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'mine',
          contentType: 'all',
          status: 'draft',
          priority: 'all',
          assignee: '',
          search: '',
          sort: 'updated_desc',
          cursor: 0,
        },
      });
      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      const draftPill = screen.getByRole('link', { name: 'Drafts' });
      expect(draftPill).toHaveAttribute('aria-current', 'page');

      const allPill = screen.getByRole('link', { name: 'All My Work' });
      expect(allPill).not.toHaveAttribute('aria-current');
    });

    it('preserves search and priority params in quick filter hrefs', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'mine',
          contentType: 'all',
          status: 'all',
          priority: 'urgent',
          assignee: '',
          search: 'budget',
          sort: 'updated_desc',
          cursor: 0,
        },
      });
      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      const draftPill = screen.getByRole('link', { name: 'Drafts' });
      expect(draftPill.getAttribute('href')).toContain('status=draft');
      expect(draftPill.getAttribute('href')).toContain('priority=urgent');
      expect(draftPill.getAttribute('href')).toContain('search=budget');
    });
  });

  describe('C. Data Isolation & Server-Side Filtering (mineOnly)', () => {
    it('restricts My Work data to only personal items even for an Admin role', async () => {
      getAllWorkflowDeskItemsMock.mockResolvedValue([
        {
          ...baseDeskItem,
          contentType: 'story',
          id: 'admin-own',
          title: 'Admin Personal Draft',
          status: 'draft',
          createdById: 'admin-1',
          assignedToId: 'admin-1',
          updatedAt: '2026-07-16T10:00:00Z',
        },
        {
          ...baseDeskItem,
          contentType: 'article',
          id: 'other-staff-item',
          title: 'Reporter Other Draft',
          status: 'draft',
          createdById: 'reporter-99',
          assignedToId: 'reporter-99',
          updatedAt: '2026-07-16T11:00:00Z',
        },
      ]);

      const adminUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Desk Admin',
        role: 'admin' as const,
      };

      const personalOverview = await getWorkQueueOverview(adminUser, {
        view: 'mine',
        mineOnly: true,
      });

      expect(personalOverview.items.map((i) => i.id)).toEqual(['admin-own']);
      expect(personalOverview.total).toBe(1);

      const fullOverview = await getWorkQueueOverview(adminUser, { view: 'all' });
      expect(fullOverview.items.length).toBe(2);
    });

    it('matches in_review status filter for both in_review and submitted items', async () => {
      getAllWorkflowDeskItemsMock.mockResolvedValue([
        {
          ...baseDeskItem,
          contentType: 'story',
          id: 'sub-1',
          title: 'Submitted Item',
          status: 'submitted',
          createdById: 'rep-1',
          assignedToId: 'rep-1',
          updatedAt: '2026-07-16T10:00:00Z',
        },
        {
          ...baseDeskItem,
          contentType: 'story',
          id: 'rev-1',
          title: 'Actively In Review',
          status: 'in_review',
          createdById: 'rep-1',
          assignedToId: 'rep-1',
          updatedAt: '2026-07-16T11:00:00Z',
        },
        {
          ...baseDeskItem,
          contentType: 'story',
          id: 'draft-1',
          title: 'Draft Item',
          status: 'draft',
          createdById: 'rep-1',
          assignedToId: 'rep-1',
          updatedAt: '2026-07-16T09:00:00Z',
        },
      ]);

      const reporter = {
        id: 'rep-1',
        email: 'rep@example.com',
        name: 'Reporter',
        role: 'reporter' as const,
      };

      const overview = await getWorkQueueOverview(reporter, {
        view: 'mine',
        status: 'in_review',
      });

      expect(overview.items.map((i) => i.id)).toEqual(['rev-1', 'sub-1']);
    });
  });

  describe('D. Contextual Empty States', () => {
    it('shows contextual empty state for Reporter with Drafts filter', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'mine',
          contentType: 'all',
          status: 'draft',
          priority: 'all',
          assignee: '',
          search: '',
          sort: 'updated_desc',
          cursor: 0,
        },
      });

      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      expect(screen.getByText('No drafts waiting right now.')).toBeInTheDocument();
      expect(
        screen.getByText(
          'All drafts have been submitted or you have not started any new drafts.'
        )
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Create Story' })).toHaveAttribute(
        'href',
        '/admin/stories/new'
      );
    });

    it('shows contextual empty state for Reporter with Changes Requested filter', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'mine',
          contentType: 'all',
          status: 'changes_requested',
          priority: 'all',
          assignee: '',
          search: '',
          sort: 'updated_desc',
          cursor: 0,
        },
      });

      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      expect(
        screen.getByText('No stories have been returned for revision.')
      ).toBeInTheDocument();
    });

    it('shows contextual empty state for Copy Editor on Review view with Open Copy Desk link', () => {
      const overview = createWorkbenchOverview({
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
      });

      render(<WorkQueueWorkbench role="copy_editor" overview={overview} routePath="/admin/work" />);

      expect(
        screen.getByText('No review items are waiting for your desk.')
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open Copy Desk' })).toHaveAttribute(
        'href',
        '/admin/copy-desk'
      );
      // Copy Editor must NEVER see Create Story
      expect(screen.queryByRole('link', { name: 'Create Story' })).not.toBeInTheDocument();
    });

    it('shows contextual empty state for Admin on Unassigned view with View All Work link', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'unassigned',
          contentType: 'all',
          status: 'all',
          priority: 'all',
          assignee: '',
          search: '',
          sort: 'updated_desc',
          cursor: 0,
        },
      });

      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/assignments" />);

      expect(
        screen.getByText('No unassigned newsroom work is waiting for triage.')
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View All Work' })).toHaveAttribute(
        'href',
        '/admin/work?view=all'
      );
    });

    it('shows contextual empty state for active search with reset action', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'mine',
          contentType: 'all',
          status: 'all',
          priority: 'all',
          assignee: '',
          search: 'nonexistent-query',
          sort: 'updated_desc',
          cursor: 0,
        },
      });

      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      expect(screen.getByText('No matching work items')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reset filters' })).toHaveAttribute(
        'href',
        '/admin/my-work?view=mine'
      );
    });

    it('renders bilingual Hindi copy for empty states when language is hi', () => {
      useAppStore.setState({ language: 'hi' });
      const overview = createWorkbenchOverview({
        filters: {
          view: 'mine',
          contentType: 'all',
          status: 'draft',
          priority: 'all',
          assignee: '',
          search: '',
          sort: 'updated_desc',
          cursor: 0,
        },
      });

      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      expect(screen.getByText('वर्तमान में कोई ड्राफ्ट लंबित नहीं है।')).toBeInTheDocument();
      expect(
        screen.getByText(
          'आपके सभी ड्राफ्ट सबमिट हो चुके हैं या आपने कोई नया ड्राफ्ट शुरू नहीं किया है।'
        )
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'नई स्टोरी बनाएं' })).toHaveAttribute(
        'href',
        '/admin/stories/new'
      );
    });

    it('shows overdue empty state when no items are overdue', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'overdue',
          contentType: 'all',
          status: 'all',
          priority: 'all',
          assignee: '',
          search: '',
          sort: 'updated_desc',
          cursor: 0,
        },
      });

      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/work" />);

      expect(screen.getByText('No overdue deadlines.')).toBeInTheDocument();
      expect(
        screen.getByText(
          'All active items are on schedule and within their editorial deadlines.'
        )
      ).toBeInTheDocument();
    });

    it('shows personal queue clear state for mine view', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'mine',
          contentType: 'all',
          status: 'all',
          priority: 'all',
          assignee: '',
          search: '',
          sort: 'updated_desc',
          cursor: 0,
        },
      });

      render(<WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />);

      expect(screen.getByText('Your personal queue is clear.')).toBeInTheDocument();
    });

    it('uses contextual copy instead of the generic fallback for an empty all-work view', () => {
      const overview = createWorkbenchOverview({
        filters: {
          view: 'all',
          contentType: 'video',
          status: 'all',
          priority: 'low',
          assignee: '',
          search: '',
          sort: 'updated_desc',
          cursor: 0,
        },
      });

      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/work" />);

      expect(screen.getByText('No work is waiting in All work.')).toBeInTheDocument();
      expect(screen.queryByText('This view is clear')).not.toBeInTheDocument();
    });
  });

  describe('E. Search and Filter Form Integration', () => {
    it('submits form via router.push including active view and filter inputs', () => {
      const overview = createWorkbenchOverview();
      const { container } = render(
        <WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/my-work" />
      );

      const form = container.querySelector('form');
      expect(form).not.toBeNull();

      fireEvent.submit(form!);
      expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/admin/my-work?view=mine'));
    });
  });

  describe('F. Preservation of 7 Queue Views', () => {
    it('preserves all 7 queue view counts and navigation', () => {
      const overview = createWorkbenchOverview({
        viewCounts: {
          mine: 5,
          unassigned: 3,
          review: 4,
          approval: 2,
          publishing: 1,
          overdue: 1,
          all: 10,
        },
      });

      render(<WorkQueueWorkbench role="admin" overview={overview} routePath="/admin/work" />);

      expect(screen.getAllByText('Mine').length).toBeGreaterThan(0);
      expect(screen.getByText('Unassigned')).toBeInTheDocument();
      expect(screen.getByText('Review')).toBeInTheDocument();
      expect(screen.getByText('Approval')).toBeInTheDocument();
      expect(screen.getByText('Publishing')).toBeInTheDocument();
      expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
    });
  });

  describe('G. Phase 3.6C Assignment Triage', () => {
    function assignmentItem(overrides: Partial<WorkQueueItem> = {}): WorkQueueItem {
      return {
        ...baseDeskItem,
        contentType: 'story',
        id: 'story-assignment-1',
        title: 'Assignment test story',
        status: 'assigned',
        updatedAt: '2026-09-20T10:00:00Z',
        isMine: false,
        isUnassigned: false,
        isOverdue: false,
        availableActions: ['assign'],
        nextAction: 'assign',
        nextActionLabel: 'Review assignment',
        ...overrides,
      };
    }

    it.each(['reporter', 'copy_editor'] as const)(
      'does not expose assignment-management controls to %s',
      async (role) => {
        const item = assignmentItem();
        render(
          <WorkQueueWorkbench
            role={role}
            overview={createWorkbenchOverview({}, [item])}
            routePath={role === 'reporter' ? '/admin/my-work' : '/admin/work'}
          />
        );

        expect(screen.queryByLabelText(`Select ${item.title}`)).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: /Assignment test story|Review assignment/ })[0]);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.queryByText('Assignment triage')).not.toBeInTheDocument();
      }
    );

    it('shows an Admin reassignment immediately and reconciles workload without a refresh', async () => {
      const item = assignmentItem();
      const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('assignee-suggestions')) {
          return Response.json({
            success: true,
            data: [
              {
                id: 'copy-2',
                name: 'Copy Two',
                role: 'copy_editor',
                isActive: true,
                activeWorkload: 3,
                overdueWorkload: 1,
              },
              {
                id: 'reporter-1',
                name: 'Reporter One',
                role: 'reporter',
                isActive: true,
                activeWorkload: 1,
                overdueWorkload: 0,
              },
            ],
          });
        }
        expect(url).toBe('/api/admin/work-queue/actions');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          contentType: 'story',
          id: item.id,
          action: 'assign',
          assignedToId: 'copy-2',
        });
        return Response.json({ success: true });
      });

      render(
        <WorkQueueWorkbench
          role="admin"
          overview={createWorkbenchOverview({}, [item])}
          routePath="/admin/assignments"
        />
      );
      fireEvent.click(screen.getAllByRole('button', { name: /Assignment test story|Review assignment/ })[0]);

      expect(await screen.findByText('Current owner:')).toBeInTheDocument();
      expect(screen.getAllByText('Reporter One').length).toBeGreaterThan(0);
      const assignee = await screen.findByRole('combobox', { name: 'Eligible staff' });
      fireEvent.change(assignee, { target: { value: 'copy-2' } });
      expect(screen.getByText(/3 active assigned items · 1 overdue/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Reassign owner' }));

      await waitFor(() =>
        expect(screen.getByText('Current owner:').parentElement).toHaveTextContent(
          'Current owner: Copy Two'
        )
      );
      expect(screen.getByRole('status')).toHaveTextContent('is now assigned to Copy Two');
      expect(screen.getByText(/4 active assigned items · 1 overdue/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reassign owner' })).toBeDisabled();
      expect(screen.getAllByText('Copy Two').length).toBeGreaterThan(1);
      fetchMock.mockRestore();
    });

    it('shows an unassigned item assignment immediately without a refresh', async () => {
      const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        if (String(input).includes('assignee-suggestions')) {
          return Response.json({
            success: true,
            data: [{
              id: 'reporter-2',
              name: 'Reporter Two',
              role: 'reporter',
              isActive: true,
              activeWorkload: 0,
              overdueWorkload: 0,
            }],
          });
        }
        return Response.json({ success: true });
      });
      const item = assignmentItem({
        status: 'submitted',
        assignedToId: '',
        assignedToEmail: '',
        assignedToName: '',
        isUnassigned: true,
      });
      render(
        <WorkQueueWorkbench
          role="super_admin"
          overview={createWorkbenchOverview({}, [item])}
          routePath="/admin/assignments"
        />
      );
      fireEvent.click(screen.getAllByRole('button', { name: /Assignment test story|Review assignment/ })[0]);
      const assignee = await screen.findByRole('combobox', { name: 'Eligible staff' });
      fireEvent.change(assignee, { target: { value: 'reporter-2' } });

      expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Assign owner' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Assign owner' }));

      await waitFor(() =>
        expect(screen.getByText('Current owner:').parentElement).toHaveTextContent(
          'Current owner: Reporter Two'
        )
      );
      expect(screen.getByRole('status')).toHaveTextContent('is now assigned to Reporter Two');
      expect(screen.getByText(/1 active assigned item · 0 overdue/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reassign owner' })).toBeDisabled();
      expect(screen.getAllByText('Reporter Two').length).toBeGreaterThan(1);
      fetchMock.mockRestore();
    });
  });
});
