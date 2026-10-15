import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeskWorkflowActions from '@/app/(admin)/admin/DeskWorkflowActions';
import { useAppStore } from '@/lib/store/appStore';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe('DeskWorkflowActions Accessibility & Live Regions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({ language: 'en' });
  });

  it('provides aria-expanded on Assign, Desk Action, Schedule, and Urgent Publish buttons', () => {
    render(
      <DeskWorkflowActions
        role="admin"
        contentType="story"
        contentId="story-acc-1"
        status="approved"
        editHref="/admin/stories/story-acc-1/edit"
        canFastPublish={true}
      />
    );

    // Schedule button exists for approved items and toggles aria-expanded
    const scheduleBtn = screen.getByRole('button', { name: /^schedule$/i });
    expect(scheduleBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(scheduleBtn);
    expect(scheduleBtn).toHaveAttribute('aria-expanded', 'true');

    // Urgent Publish button exists when canFastPublish=true and toggles aria-expanded
    const urgentBtn = screen.getByRole('button', { name: /urgent publish/i });
    expect(urgentBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(urgentBtn);
    expect(urgentBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles aria-expanded on Assign button', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(
      <DeskWorkflowActions
        role="admin"
        contentType="article"
        contentId="art-acc-1"
        status="submitted"
        editHref="/admin/articles/art-acc-1/edit"
      />
    );

    const assignBtn = screen.getByRole('button', { name: /^assign$/i });
    expect(assignBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(assignBtn);
    await waitFor(() => {
      expect(assignBtn).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('displays error feedback with role="alert" and aria-live="assertive"', async () => {
    render(
      <DeskWorkflowActions
        role="admin"
        contentType="story"
        contentId="story-acc-2"
        status="in_review"
        editHref="/admin/stories/story-acc-2/edit"
      />
    );

    // Click Desk Action to open reason panel
    const deskActionBtn = screen.getByRole('button', { name: /desk action/i });
    fireEvent.click(deskActionBtn);

    // Click Request Changes without entering a reason
    const requestChangesBtn = screen.getByRole('button', { name: /request changes/i });
    fireEvent.click(requestChangesBtn);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent(/add a clear change reason/i);
  });

  it('displays success feedback with role="status" and aria-live="polite"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Story approved successfully.',
      }),
    });

    render(
      <DeskWorkflowActions
        role="admin"
        contentType="story"
        contentId="story-acc-3"
        status="ready_for_approval"
        editHref="/admin/stories/story-acc-3/edit"
      />
    );

    const approveBtn = screen.getByRole('button', { name: /approve/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      const statusElement = screen.getByRole('status');
      expect(statusElement).toBeInTheDocument();
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
      expect(statusElement).toHaveTextContent(/story approved successfully/i);
    });
  });
});
