import { render, screen, fireEvent, act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { StoryCollaborationBar } from '@/components/admin/stories/StoryCollaborationBar';
import { useStoryLease } from '@/components/admin/stories/useStoryLease';
import { useStoryAutosave } from '@/components/admin/stories/useStoryAutosave';

vi.mock('@/lib/auth/clientToken', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test' }),
}));

describe('Story Collaboration Client Components & Hooks (Phase 3.7C)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe('StoryCollaborationBar Component', () => {
    it('renders all required status states correctly', () => {
      const { rerender } = render(
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
          revisionCount={3}
        />
      );

      expect(screen.getByText('All changes saved')).toBeDefined();
      expect(screen.getByText('Lease active')).toBeDefined();
      expect(screen.getByText('Revisions')).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();

      // State: saving
      rerender(
        <StoryCollaborationBar
          saveStatus="saving"
          statusMessage="Saving draft..."
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
      expect(screen.getByText('Saving draft...')).toBeDefined();

      // State: unsaved
      rerender(
        <StoryCollaborationBar
          saveStatus="unsaved"
          statusMessage="Unsaved changes"
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
      expect(screen.getByText('Unsaved changes')).toBeDefined();

      // State: version_conflict
      rerender(
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
      expect(screen.getByText('Version conflict: server is newer')).toBeDefined();

      // State: lease_conflict
      rerender(
        <StoryCollaborationBar
          saveStatus="lease_conflict"
          statusMessage="Editing locked by another user"
          hasLease={false}
          isLockedByOther={true}
          lockHolder={{
            userId: 'user-2',
            name: 'Priya Sharma',
            email: 'priya@example.com',
            role: 'copy_editor',
            acquiredAt: '2026-09-24T10:00:00Z',
            expiresAt: '2026-09-24T10:01:00Z',
          }}
          canTakeOver={true}
          onTakeOver={vi.fn()}
          recoveredDraft={null}
          onRestoreDraft={vi.fn()}
          onDiscardDraft={vi.fn()}
          onOpenRevisions={vi.fn()}
        />
      );
      expect(screen.getByText('Editing locked by another user')).toBeDefined();
      expect(screen.getByText(/Locked by Priya Sharma \(copy_editor\)/)).toBeDefined();
      expect(screen.getByText('Take Over')).toBeDefined();

      // State: autosave_failed
      rerender(
        <StoryCollaborationBar
          saveStatus="autosave_failed"
          statusMessage="Autosave network error"
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
      expect(screen.getByText('Autosave network error')).toBeDefined();
    });

    it('renders recovery banner and triggers restore and discard callbacks', () => {
      const onRestoreDraft = vi.fn();
      const onDiscardDraft = vi.fn();

      render(
        <StoryCollaborationBar
          saveStatus="recovery_available"
          statusMessage="Recovery draft available"
          hasLease={true}
          isLockedByOther={false}
          lockHolder={null}
          canTakeOver={false}
          onTakeOver={vi.fn()}
          recoveredDraft={{
            timestamp: Date.now() - 60000,
            data: { title: 'Recovered Story' },
          }}
          onRestoreDraft={onRestoreDraft}
          onDiscardDraft={onDiscardDraft}
          onOpenRevisions={vi.fn()}
        />
      );

      expect(screen.getByText(/Unsaved draft recovered from/)).toBeDefined();

      const restoreBtn = screen.getByRole('button', { name: 'Restore Draft' });
      fireEvent.click(restoreBtn);
      expect(onRestoreDraft).toHaveBeenCalledTimes(1);

      const discardBtn = screen.getByRole('button', { name: 'Discard' });
      fireEvent.click(discardBtn);
      expect(onDiscardDraft).toHaveBeenCalledTimes(1);
    });
  });

  describe('useStoryLease Hook', () => {
    it('acquires lock on mount and releases on unmount', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ success: true, hasLock: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const { result, unmount } = renderHook(() =>
        useStoryLease({ storyId: 'story-hook-1', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.hasLease).toBe(true);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/stories/story-hook-1/lock',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'acquire' }),
        })
      );

      unmount();

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/stories/story-hook-1/lock',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'release' }),
        })
      );
    });

    it('handles 409 conflict when locked by another editor', async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            code: 'STORY_EDIT_LEASE_CONFLICT',
            holder: {
              userId: 'other-id',
              name: 'Other User',
              userName: 'Other User',
              userRole: 'reporter',
            },
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const { result } = renderHook(() =>
        useStoryLease({ storyId: 'story-hook-2', enabled: true })
      );

      await waitFor(() => {
        expect(result.current.hasLease).toBe(false);
        expect(result.current.isLockedByOther).toBe(true);
        expect(result.current.holder?.name).toBe('Other User');
      });
    });
  });

  describe('useStoryAutosave Hook', () => {
    it('detects recovered draft from localStorage on load', () => {
      const loadedAt = Date.now() - 10000;
      const draftTimestamp = Date.now() - 5000; // Newer than loadedAt

      localStorage.setItem(
        'story-draft-story-auto-1',
        JSON.stringify({
          timestamp: draftTimestamp,
          version: 1,
          data: { title: 'Recovered Draft Title' },
        })
      );

      const { result } = renderHook(() =>
        useStoryAutosave({
          storyId: 'story-auto-1',
          storyVersion: 1,
          formData: { title: 'Old Server Title' },
          hasLease: true,
          isLockedByOther: false,
          loadedAt,
          onVersionAdvanced: vi.fn(),
        })
      );

      expect(result.current.saveStatus).toBe('recovery_available');
      expect(result.current.recoveredDraft?.data).toEqual({ title: 'Recovered Draft Title' });

      act(() => {
        result.current.discardRecovery();
      });

      expect(result.current.recoveredDraft).toBeNull();
      expect(localStorage.getItem('story-draft-story-auto-1')).toBeNull();
    });

    it('debounced autosave sends expectedVersion and advances version on success', async () => {
      vi.useFakeTimers();

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { _id: 'story-auto-2', version: 3 },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      const onVersionAdvanced = vi.fn();
      let formState = { title: 'Initial Title' };

      const { result, rerender } = renderHook(() =>
        useStoryAutosave({
          storyId: 'story-auto-2',
          storyVersion: 2,
          formData: formState,
          hasLease: true,
          isLockedByOther: false,
          loadedAt: Date.now(),
          onVersionAdvanced,
          debounceMs: 200,
        })
      );

      // User modifies title
      formState = { title: 'Updated Title' };
      rerender();

      expect(result.current.saveStatus).toBe('unsaved');

      // Fast-forward debounce timer
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/stories/story-auto-2',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            title: 'Updated Title',
            autosave: true,
            expectedVersion: 2,
          }),
        })
      );

      expect(onVersionAdvanced).toHaveBeenCalledWith(3);
      expect(result.current.saveStatus).toBe('saved');

      vi.useRealTimers();
    });

    it('transitions to version_conflict and stops writes on 409 conflict', async () => {
      vi.useFakeTimers();

      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            code: 'STORY_VERSION_CONFLICT',
            currentVersion: 4,
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

      let formState = { title: 'Initial Title' };
      const { result, rerender } = renderHook(() =>
        useStoryAutosave({
          storyId: 'story-auto-3',
          storyVersion: 2,
          formData: formState,
          hasLease: true,
          isLockedByOther: false,
          loadedAt: Date.now(),
          onVersionAdvanced: vi.fn(),
          debounceMs: 200,
        })
      );

      formState = { title: 'Conflict Edit' };
      rerender();

      await act(async () => {
        vi.advanceTimersByTime(250);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(result.current.saveStatus).toBe('version_conflict');

      vi.useRealTimers();
    });
  });
});
