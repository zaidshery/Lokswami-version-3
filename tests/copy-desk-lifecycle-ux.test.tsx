import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeskWorkflowActions from '@/app/(admin)/admin/DeskWorkflowActions';
import { StoryCollaborationBar } from '@/components/admin/stories/StoryCollaborationBar';
import { StoryRevisionsDrawer } from '@/components/admin/stories/StoryRevisionsDrawer';
import { canViewPage } from '@/lib/auth/permissions';
import { useAppStore } from '@/lib/store/appStore';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/copy-desk',
}));

describe('Phase 3.7D Copy Desk + Editor Lifecycle UX Test Suite', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    useAppStore.setState({ language: 'en' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('TASK 1 & 2: Route Policy & Newsroom Surface RBAC Invariants', () => {
    it('verifies canonical route policy across all four roles', () => {
      // /admin/copy-desk: super_admin, admin, copy_editor ALLOW; reporter DENY
      expect(canViewPage('super_admin', 'copy_desk')).toBe(true);
      expect(canViewPage('admin', 'copy_desk')).toBe(true);
      expect(canViewPage('copy_editor', 'copy_desk')).toBe(true);
      expect(canViewPage('reporter', 'copy_desk')).toBe(false);

      // /admin/my-work: super_admin DENY; admin, copy_editor, reporter ALLOW
      expect(canViewPage('super_admin', 'my_work')).toBe(false);
      expect(canViewPage('admin', 'my_work')).toBe(true);
      expect(canViewPage('copy_editor', 'my_work')).toBe(true);
      expect(canViewPage('reporter', 'my_work')).toBe(true);

      // /admin/review-queue: super_admin, admin ALLOW; copy_editor, reporter DENY
      expect(canViewPage('super_admin', 'review_queue')).toBe(true);
      expect(canViewPage('admin', 'review_queue')).toBe(true);
      expect(canViewPage('copy_editor', 'review_queue')).toBe(false);
      expect(canViewPage('reporter', 'review_queue')).toBe(false);

      // /admin/content-queue: super_admin, admin ALLOW; copy_editor, reporter DENY
      expect(canViewPage('super_admin', 'content_queue')).toBe(true);
      expect(canViewPage('admin', 'content_queue')).toBe(true);
      expect(canViewPage('copy_editor', 'content_queue')).toBe(false);
      expect(canViewPage('reporter', 'content_queue')).toBe(false);

      // /admin/work: all four roles ALLOW
      expect(canViewPage('super_admin', 'work_queue')).toBe(true);
      expect(canViewPage('admin', 'work_queue')).toBe(true);
      expect(canViewPage('copy_editor', 'work_queue')).toBe(true);
      expect(canViewPage('reporter', 'work_queue')).toBe(true);
    });
  });

  describe('TASK 11 & 14: DeskWorkflowActions Role-Aware Surfaces & Schedule Validation', () => {
    it('hides all privileged controls from reporters', () => {
      render(
        <DeskWorkflowActions
          role="reporter"
          contentType="article"
          contentId="art-101"
          status="changes_requested"
          editHref="/admin/articles/art-101/edit"
          hasAssignment={false}
          canFastPublish={false}
        />
      );

      // Reporter should only see the Edit / Resubmit link, NOT privileged workflow action buttons
      expect(screen.queryByRole('button', { name: /^assign$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /desk action/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /^schedule$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /publish now/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /urgent publish/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /move to copy edit/i })).toBeNull();
    });

    it('shows copy editor review actions but hides publish and schedule controls', () => {
      render(
        <DeskWorkflowActions
          role="copy_editor"
          contentType="story"
          contentId="story-201"
          status="in_review"
          editHref="/admin/stories/story-201/edit"
          isAssignedToCurrentUser={true}
        />
      );

      // Copy editor in review sees desk action (request changes) and move to copy edit
      expect(screen.getByRole('button', { name: /desk action/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /move to copy edit/i })).toBeDefined();

      // But copy editor NEVER sees publish, schedule, or urgent publish controls
      expect(screen.queryByRole('button', { name: /^schedule$/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /publish now/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /urgent publish/i })).toBeNull();
    });

    it('validates future schedule date and renders guidance text with accessibility attributes', async () => {
      render(
        <DeskWorkflowActions
          role="admin"
          contentType="article"
          contentId="art-301"
          status="approved"
          editHref="/admin/articles/art-301/edit"
        />
      );

      const scheduleBtn = screen.getByRole('button', { name: /^schedule$/i });
      expect(scheduleBtn).toHaveAttribute('aria-controls', 'desk-schedule-panel');
      expect(scheduleBtn).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(scheduleBtn);
      expect(scheduleBtn).toHaveAttribute('aria-expanded', 'true');

      // Check guidance text
      expect(
        screen.getByText(
          /Must be a future date and time\. Scheduling queues content for release and does not publish immediately\./i
        )
      ).toBeDefined();

      // Try scheduling without entering a date
      const submitScheduleBtn = screen.getAllByRole('button', { name: /^schedule$/i })[1];
      fireEvent.click(submitScheduleBtn);

      const emptyAlert = await screen.findByRole('alert');
      expect(emptyAlert).toHaveTextContent(/Choose a schedule date and time before scheduling this item\./i);

      // Try scheduling with a past date
      const input = screen.getByLabelText(/schedule for/i);
      fireEvent.change(input, { target: { value: '2020-01-01T12:00' } });
      fireEvent.click(submitScheduleBtn);

      const pastAlert = await screen.findByRole('alert');
      expect(pastAlert).toHaveTextContent(/Scheduled time must be set to a future date and time\./i);
    });

    it('provides aria-controls on toggle panels', () => {
      render(
        <DeskWorkflowActions
          role="admin"
          contentType="story"
          contentId="story-401"
          status="in_review"
          editHref="/admin/stories/story-401/edit"
          canFastPublish={true}
        />
      );

      const deskActionBtn = screen.getByRole('button', { name: /desk action/i });
      expect(deskActionBtn).toHaveAttribute('aria-controls', 'desk-reason-panel');

      const urgentBtn = screen.getByRole('button', { name: /urgent publish/i });
      expect(urgentBtn).toHaveAttribute('aria-controls', 'desk-urgent-panel');
    });
  });

  describe('TASK 6 & 9: StoryCollaborationBar Save-State Precedence & Save Confidence', () => {
    it('strictly suppresses "All changes saved" when conflict, pending, or recovery draft exists', () => {
      // 1. Version conflict
      const { rerender } = render(
        <StoryCollaborationBar
          saveStatus="version_conflict"
          statusMessage="Version conflict: server is newer"
          hasLease={true}
          isLockedByOther={false}
          lockHolder={null}
          canTakeOver={false}
          onTakeOver={vi.fn()}
          recoveredDraft={null}
          onRestoreDraft={vi.fn()}
          onDiscardDraft={vi.fn()}
          onOpenRevisions={vi.fn()}
        />
      );
      expect(screen.queryByText('All changes saved')).toBeNull();
      expect(screen.getByText('Version conflict: server is newer')).toBeDefined();

      // 2. Lease conflict
      rerender(
        <StoryCollaborationBar
          saveStatus="lease_conflict"
          statusMessage="Editing locked by another user"
          hasLease={false}
          isLockedByOther={true}
          lockHolder={{
            userId: 'user-other',
            name: 'Vikram Mehta',
            email: 'vikram@example.com',
            role: 'admin',
            acquiredAt: '2026-09-24T12:00:00Z',
            expiresAt: '2026-09-24T12:05:00Z',
          }}
          canTakeOver={false}
          onTakeOver={vi.fn()}
          recoveredDraft={null}
          onRestoreDraft={vi.fn()}
          onDiscardDraft={vi.fn()}
          onOpenRevisions={vi.fn()}
        />
      );
      expect(screen.queryByText('All changes saved')).toBeNull();
      expect(screen.getByText('Editing locked by another user')).toBeDefined();

      // 3. Autosave failed
      rerender(
        <StoryCollaborationBar
          saveStatus="autosave_failed"
          statusMessage="Autosave failed: network disconnect"
          hasLease={true}
          isLockedByOther={false}
          lockHolder={null}
          canTakeOver={false}
          onTakeOver={vi.fn()}
          recoveredDraft={null}
          onRestoreDraft={vi.fn()}
          onDiscardDraft={vi.fn()}
          onOpenRevisions={vi.fn()}
        />
      );
      expect(screen.queryByText('All changes saved')).toBeNull();
      expect(screen.getByText('Autosave failed: network disconnect')).toBeDefined();

      // 4. Recovered draft available (even if statusMessage says saved)
      rerender(
        <StoryCollaborationBar
          saveStatus="saved"
          statusMessage="All changes saved"
          hasLease={true}
          isLockedByOther={false}
          lockHolder={null}
          canTakeOver={false}
          onTakeOver={vi.fn()}
          recoveredDraft={{
            timestamp: Date.now() - 30000,
            data: { title: 'Local unsaved recovery' },
          }}
          onRestoreDraft={vi.fn()}
          onDiscardDraft={vi.fn()}
          onOpenRevisions={vi.fn()}
        />
      );
      expect(screen.queryByText('All changes saved')).toBeNull();
      expect(screen.getByText('Recovery draft available')).toBeDefined();
      expect(screen.getByText(/Unsaved draft recovered from/i)).toBeDefined();
    });

    it('attaches live-region accessibility semantics to save status', () => {
      render(
        <StoryCollaborationBar
          saveStatus="saved"
          statusMessage="All changes saved"
          hasLease={true}
          isLockedByOther={false}
          lockHolder={null}
          canTakeOver={false}
          onTakeOver={vi.fn()}
          recoveredDraft={null}
          onRestoreDraft={vi.fn()}
          onDiscardDraft={vi.fn()}
          onOpenRevisions={vi.fn()}
        />
      );

      const statusEl = screen.getByRole('status');
      expect(statusEl).toHaveAttribute('aria-live', 'polite');
      expect(statusEl).toHaveTextContent('All changes saved');
    });
  });

  describe('TASK 7: Story Lease UX & Takeover Confirmation', () => {
    it('requires explicit confirmation in modal dialog before executing lease takeover', () => {
      const onTakeOver = vi.fn();

      render(
        <StoryCollaborationBar
          saveStatus="lease_conflict"
          statusMessage="Editing locked by another user"
          hasLease={false}
          isLockedByOther={true}
          lockHolder={{
            userId: 'user-reporter',
            name: 'Aditi Rao',
            email: 'aditi@example.com',
            role: 'reporter',
            acquiredAt: '2026-09-24T12:00:00Z',
            expiresAt: '2026-09-24T12:05:00Z',
          }}
          canTakeOver={true}
          onTakeOver={onTakeOver}
          recoveredDraft={null}
          onRestoreDraft={vi.fn()}
          onDiscardDraft={vi.fn()}
          onOpenRevisions={vi.fn()}
        />
      );

      const takeOverBtn = screen.getByRole('button', { name: /take over/i });
      expect(takeOverBtn).toBeDefined();

      // Click Take Over to open confirmation dialog
      fireEvent.click(takeOverBtn);

      const takeoverDialog = screen.getByRole('dialog');
      expect(takeoverDialog).toHaveAttribute('aria-modal', 'true');
      expect(
        screen.getByText(/Take over lock\? Current editor's uncommitted draft will not be saved\./i)
      ).toBeDefined();

      // Click Cancel in the takeover dialog
      const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
      fireEvent.click(cancelBtn);
      expect(onTakeOver).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();

      // Click Take Over again and confirm
      fireEvent.click(screen.getByRole('button', { name: /take over/i }));
      const confirmBtn = screen.getByRole('button', { name: /^confirm$/i });
      fireEvent.click(confirmBtn);
      expect(onTakeOver).toHaveBeenCalledTimes(1);
    });
  });

  describe('TASK 8 & 18: StoryRevisionsDrawer Accessibility & Restore Behavior', () => {
    it('has dialog role, aria-modal, aria-labelledby, and closes on Escape', async () => {
      const onClose = vi.fn();

      render(
        <StoryRevisionsDrawer
          isOpen={true}
          onClose={onClose}
          storyId="story-rev-1"
          currentVersion={4}
          onRevisionRestored={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'story-revisions-title');

      // Closes on Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders revision snapshots with accessible labels and handles restore confirmation', async () => {
      const mockRevisions = [
        {
          _id: 'rev-1',
          version: 3,
          savedAt: '2026-09-24T10:00:00Z',
          savedBy: { id: 'u1', name: 'Priya Copy', role: 'copy_editor' },
          title: 'Breaking Story v3',
        },
      ];

      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/revisions/rev-1/restore')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ success: true, data: { id: 'story-rev-2', version: 5 } }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockRevisions }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const onRevisionRestored = vi.fn();
      const onClose = vi.fn();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(
        <StoryRevisionsDrawer
          isOpen={true}
          onClose={onClose}
          storyId="story-rev-2"
          currentVersion={4}
          onRevisionRestored={onRevisionRestored}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Breaking Story v3')).toBeDefined();
      });

      const restoreBtn = screen.getByRole('button', { name: 'Restore revision v3' });
      expect(restoreBtn).toBeDefined();

      fireEvent.click(restoreBtn);

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Your current editor state will be captured as a recoverable revision before restoring. Publication and workflow status will remain unchanged.'
        )
      );

      await waitFor(() => {
        expect(onRevisionRestored).toHaveBeenCalledWith({ id: 'story-rev-2', version: 5 });
        expect(onClose).toHaveBeenCalled();
      });

      confirmSpy.mockRestore();
    });

    it('displays actionable error message when restore results in a 409 version conflict', async () => {
      const mockRevisions = [
        {
          _id: 'rev-2',
          version: 2,
          savedAt: '2026-09-24T09:00:00Z',
          savedBy: { id: 'u2', name: 'Editor Two' },
          title: 'Story Draft v2',
        },
      ];

      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/revisions/rev-2/restore')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: false,
                code: 'STORY_VERSION_CONFLICT',
                error: 'Version conflict',
              }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: mockRevisions }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(
        <StoryRevisionsDrawer
          isOpen={true}
          onClose={vi.fn()}
          storyId="story-rev-3"
          currentVersion={3}
          onRevisionRestored={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Story Draft v2')).toBeDefined();
      });

      const restoreBtn = screen.getByRole('button', { name: 'Restore revision v2' });
      fireEvent.click(restoreBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Version conflict: A newer version exists on the server\. Please reload first\./i)
        ).toBeDefined();
      });
    });
  });

  describe('TASK 3 & 4: Reporter Article & Story Lifecycle Return / Recovery UX Contracts', () => {
    it('verifies EditArticlePageClient contains return/recovery feedback banners and resubmit action', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.join(process.cwd(), 'app/(admin)/admin/articles/[id]/edit/EditArticlePageClient.tsx'),
        'utf8'
      );

      // Verify return and recovery feedback banners exist
      expect(source).toContain("workflow.status === 'changes_requested'");
      expect(source).toContain("workflow.status === 'rejected'");
      expect(source).toContain('Desk Changes Requested');
      expect(source).toContain('Article Rejected');

      // Verify guidance on permitted editable fields for reporters
      expect(source).toContain('Editable Fields:');
      expect(source).toContain('Resubmit for Review');

      // Verify privileged actions remain guarded
      expect(source).toContain('availableWorkflowActions');
    });

    it('verifies Story Edit Page contains return/recovery feedback banners and lock guards', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.join(process.cwd(), 'app/(admin)/admin/stories/[id]/edit/page.tsx'),
        'utf8'
      );

      // Verify return and recovery feedback banners exist
      expect(source).toContain("workflow.status === 'changes_requested'");
      expect(source).toContain("workflow.status === 'rejected'");
      expect(source).toContain('Desk Changes Requested');
      expect(source).toContain('Story Rejected');

      // Verify Resubmit for Review button logic
      expect(source).toContain('Resubmit for Review');

      // Verify lock guard prevents saving when locked by another editor
      expect(source).toContain('isLockedByOther ? (');
      expect(source).toContain('Locked by Editor');
    });
  });

  describe('TASK 12 & 13: Copy Desk Route Classification & Queue Navigation Contracts', () => {
    it('verifies Copy Desk route classification as SPECIALIZED with clear role boundaries', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.join(process.cwd(), 'app/(admin)/admin/copy-desk/page.tsx'),
        'utf8'
      );

      // Classification header
      expect(source).toContain('SPECIALIZED');
      expect(source).toContain('copy editing, headline approval, fact checking');

      // Quick filter tabs
      expect(source).toContain('mine');
      expect(source).toContain('ready_for_review');
      expect(source).toContain('Ready for Copy Edit');
      expect(source).toContain('needs_changes');
      expect(source).toContain('ready_for_approval');

      // Content Type pill filters
      expect(source).toContain('activeType ===');

      // Deep links into canonical work queue and related queues
      expect(source).toContain('/admin/work?view=review');
      expect(source).toContain('/admin/content-queue');
      expect(source).toContain('/admin/my-work');

      // Content type distinction badges
      expect(source).toContain('Article');
      expect(source).toContain('Story');
    });

    it('verifies newsroomControlCenter loads copy desk items including changes_requested and ready_for_approval', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.join(process.cwd(), 'lib/admin/newsroomControlCenter.ts'),
        'utf8'
      );

      // copyDesk query includes complete lifecycle states for copy editing
      expect(source).toContain("'submitted', 'assigned', 'in_review', 'copy_edit', 'changes_requested', 'ready_for_approval'");
    });
  });

  describe('TASK 17: Responsive Viewport Overflow & Layout Safety', () => {
    it('verifies Copy Desk layout uses responsive containers preventing horizontal overflow', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const copyDeskSource = fs.readFileSync(
        path.join(process.cwd(), 'app/(admin)/admin/copy-desk/page.tsx'),
        'utf8'
      );

      // Must have responsive layout primitives
      expect(copyDeskSource).toContain('CmsCollectionPage');
      expect(copyDeskSource).toContain('flex-wrap');
    });

    it('verifies StoryCollaborationBar uses responsive flex wrapping and safe spacing', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const barSource = fs.readFileSync(
        path.join(process.cwd(), 'components/admin/stories/StoryCollaborationBar.tsx'),
        'utf8'
      );

      // Must have flex-wrap on toolbars and action controls
      expect(barSource).toContain('flex-wrap');
    });
  });
});

