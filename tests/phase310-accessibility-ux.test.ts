import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSystemControlErrorMessage } from '@/lib/admin/systemControlFeedback';
import Modal from '@/components/ui/modal/Modal';
import LeadershipReportDeliveryPanel from '@/app/(admin)/admin/analytics/LeadershipReportDeliveryPanel';

function readSource(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Phase 3.10E accessibility and system UX', () => {
  const users = readSource('app/(admin)/admin/users/UsersManagementClient.tsx');
  const team = readSource('app/(admin)/admin/team/TeamManagementClient.tsx');
  const schedule = readSource('app/(admin)/admin/analytics/LeadershipReportDeliveryPanel.tsx');
  const permissionReview = readSource('app/(admin)/admin/permission-review/page.tsx');
  const diagnostics = readSource('app/(admin)/admin/operations-diagnostics/page.tsx');
  const operations = readSource('app/(admin)/admin/operations/page.tsx');
  const modal = readSource('components/ui/modal/Modal.tsx');
  const ttsOperations = readSource('app/(admin)/admin/ai/TtsOperationsPanel.tsx');

  it('distinguishes User records and links staff management to Team Management', () => {
    expect(users).toContain("user.role === 'reader' ? 'Reader' : 'Staff'");
    expect(users).toContain('<strong>Newsletter subscribers</strong>');
    expect(users).toContain('are not User records in this directory');
    expect(users).toContain('href="/admin/team"');
    expect(users).toContain('Manage staff roles and onboarding in Team Management');
  });

  it('communicates role and account status with visible text, not color alone', () => {
    expect(users).toContain('formatUserRoleLabel(user.role)');
    expect(users).toContain("user.isActive ? 'Active' : 'Inactive'");
    expect(users).toContain("user.role === 'reader' ? 'Reader' : 'Staff'");
    expect(team).toContain("member.isActive ? 'Active' : 'Inactive'");
  });

  it('keeps loading, empty, error, and success feedback semantically distinct', () => {
    expect(users).toContain('role="status" aria-live="polite"');
    expect(users).toContain('role="alert" aria-live="assertive"');
    expect(users).toContain('No users found');
    expect(team).toContain('Loading team members...');
    expect(team).toContain('No team members found yet.');
    expect(team).toContain('role="status" aria-live="polite"');
  });

  it('turns governance and rate-limit codes into safe actionable messages', () => {
    const rateLimited = getSystemControlErrorMessage(
      { status: 429, headers: new Headers({ 'Retry-After': '90' }) },
      { code: 'RATE_LIMITED' },
      'fallback'
    );
    expect(rateLimited).toBe('Too many requests. Try again in about 2 minutes.');
    expect(
      getSystemControlErrorMessage(
        { status: 400, headers: new Headers() },
        { code: 'LAST_ACTIVE_SUPER_ADMIN' },
        'fallback'
      )
    ).toBe('At least one active Super Admin must remain.');
  });

  it('handles stale settings without last-write-wins and exposes a canonical reload action', () => {
    expect(schedule).toContain("payload.code === 'SETTINGS_VERSION_CONFLICT'");
    expect(schedule).toContain('Your changes were not saved.');
    expect(schedule).toContain("fetch('/api/admin/analytics/briefing-schedules'");
    expect(schedule).toContain('Reload current settings');
    expect(schedule).toContain('aria-invalid={hasFieldError}');
    expect(schedule).toContain('aria-describedby={feedbackId}');
  });

  it('renders a settings conflict and reloads the canonical schedule without overwriting', async () => {
    const scheduleFixture = {
      id: 'daily_briefing' as const,
      label: 'Daily Leadership Briefing',
      description: 'Synthetic schedule',
      cadenceLabel: 'Daily',
      enabled: true,
      deliveryTime: '09:00',
      timezone: 'Asia/Kolkata',
      deliveryMode: 'dashboard_link' as const,
      recipientEmails: [],
      webhookUrls: [],
      webhookProvider: 'generic_json' as const,
      notes: '',
      lastRunAt: null,
      lastRunStatus: 'idle' as const,
      lastRunSummary: '',
      version: 3,
      updatedAt: '2026-09-26T08:00:00.000Z',
      nextPlannedAt: null,
      viewHref: '/admin/analytics',
      downloadHref: '/api/admin/analytics/reports/daily/download',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, code: 'SETTINGS_VERSION_CONFLICT' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: [{ ...scheduleFixture, deliveryTime: '10:30', version: 4 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    render(
      createElement(LeadershipReportDeliveryPanel, {
        initialSchedules: [scheduleFixture],
        initialHistory: [],
        initialAlertNotifications: [],
        initialCriticalAlertState: null,
        initialHealthAlerts: [],
        initialEscalations: [],
        emailDeliveryConfigured: false,
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
    expect(
      await screen.findByText(/Another administrator changed this schedule\. Your changes were not saved\./)
    ).toBeVisible();
    const reload = screen.getByRole('button', { name: 'Reload current settings' });
    expect(reload).toBeVisible();
    fireEvent.click(reload);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Current server settings reloaded. Review them before saving.')).toBeVisible();
    expect(screen.getByLabelText('Delivery Time')).toHaveValue('10:30');
  });

  it('renders an informational permission table with explicit Allow and Deny decisions', () => {
    expect(permissionReview).toContain('<strong className="text-[color:var(--admin-shell-text)]">Informational only.</strong>');
    expect(permissionReview).toContain('<table');
    expect(permissionReview).toContain('<th scope="col"');
    expect(permissionReview).toContain('<th scope="row"');
    expect(permissionReview).toContain("allowed ? 'Allow' : 'Deny'");
    expect(permissionReview).toContain('aria-label="Permission matrix"');
    expect(permissionReview).toContain('overflow-x-auto');
  });

  it('labels read-only operations and truthful diagnostic degradation states', () => {
    expect(operations).toContain('Read-only overview');
    expect(operations).toContain('Recovery and cleanup actions run only from their dedicated');
    expect(diagnostics).toContain("Overall: {diagnostics.summary.servicesAtRisk > 0 ? 'Degraded' : 'Healthy'}");
    expect(diagnostics).toContain("? 'Unavailable'");
    expect(diagnostics).toContain("? 'Degraded'");
    expect(diagnostics).toContain("? 'Disabled'");
  });

  it('uses named, contained, dismissible dialogs and explicit destructive confirmation', () => {
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby={title ? titleId : undefined}');
    expect(modal).toContain("if (e.key === 'Escape')");
    expect(modal).toContain("if (e.key !== 'Tab') return");
    expect(modal).toContain('returnFocusRef.current?.focus()');
    expect(ttsOperations).toContain('title="Clean up expired TTS assets?"');
    expect(ttsOperations).toContain('confirmLabel="Clean up expired assets"');
  });

  it('contains modal focus, closes on Escape, and returns focus to the trigger', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open dialog';
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();

    const { rerender } = render(
      createElement(
        Modal,
        {
          isOpen: true,
          onClose,
          title: 'Confirm action',
          description: 'Review the action.',
          children: createElement(
            'div',
            null,
            createElement('button', { type: 'button' }, 'First action'),
            createElement('button', { type: 'button' }, 'Last action')
          ),
        }
      )
    );

    const dialog = await screen.findByRole('dialog', { name: 'Confirm action' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const buttons = Array.from(dialog.querySelectorAll('button'));
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      createElement(
        Modal,
        {
          isOpen: false,
          onClose,
          title: 'Confirm action',
          description: 'Review the action.',
          children: createElement('button', { type: 'button' }, 'First action'),
        }
      )
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('preserves mobile-safe structures, touch targets, and visible keyboard focus', () => {
    expect(users).toContain('min-h-11');
    expect(team).toContain('min-h-11');
    expect(schedule).toContain('min-h-11');
    expect(users).toContain('focus-visible:ring-2');
    expect(modal).toContain('max-h-[calc(100dvh-2rem)]');
    expect(permissionReview).toContain('min-w-[860px]');
    expect(permissionReview).toContain('tabIndex={0}');
  });
});
