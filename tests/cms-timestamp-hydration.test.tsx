import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkQueueWorkbench from '@/components/admin/WorkQueueWorkbench';
import ActionFirstDashboard from '@/components/admin/ActionFirstDashboard';
import type { WorkQueueOverview } from '@/lib/admin/workQueue';
import { buildEditorialReadiness } from '@/lib/workflow/readiness';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const locale = vi.hoisted(() => ({ language: 'hi' as 'hi' | 'en' }));
vi.mock('@/lib/store/appStore', () => ({
  useAppStore: (selector: (state: typeof locale) => unknown) => selector(locale),
}));

const overview: WorkQueueOverview = {
  total: 1, nextCursor: null,
  viewCounts: { mine: 1, unassigned: 0, review: 0, approval: 0, publishing: 0, overdue: 0, all: 1 },
  filters: { view: 'mine', contentType: 'all', status: 'all', priority: 'all', assignee: '', search: '', sort: 'updated_desc', cursor: 0 },
  items: [{
    contentType: 'story', publicationType: null, id: 'qa-story', title: 'Timezone acceptance story', category: 'Regional', author: 'Reporter', updatedAt: '2026-07-16T09:00:00.000Z', status: 'assigned', priority: 'normal',
    assignedToId: 'reporter-1', assignedToEmail: 'reporter@example.com', assignedToName: 'Reporter', createdById: 'reporter-1', createdByEmail: 'reporter@example.com', createdByName: 'Reporter', dueAt: '2026-07-17T09:00:00.000Z', scheduledFor: null, commentsCount: 0,
    readiness: buildEditorialReadiness({ contentType: 'story', title: 'Timezone acceptance story', category: 'Regional', mediaUrl: '/qa-story.jpg' }),
    editHref: '/admin/stories/qa-story/edit', deskHref: '/admin/stories', reporterSummary: null, copyEditorSummary: null,
    isMine: true, isUnassigned: false, isOverdue: false, availableActions: [], nextAction: 'open', nextActionLabel: 'Open item',
  }],
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  container?.remove(); root = undefined; container = undefined;
  vi.restoreAllMocks();
});

describe('Work Queue server/browser timezone hydration', () => {
  it.each([
    ['work', 'hi', 'Asia/Kolkata'], ['work', 'hi', 'America/Los_Angeles'],
    ['work', 'en', 'Asia/Kolkata'], ['work', 'en', 'America/Los_Angeles'],
    ['dashboard', 'hi', 'Asia/Kolkata'], ['dashboard', 'hi', 'America/Los_Angeles'],
    ['dashboard', 'en', 'Asia/Kolkata'], ['dashboard', 'en', 'America/Los_Angeles'],
  ] as const)(
    'hydrates %s %s timestamps without recovery when a UTC server serves a %s browser',
    async (surface, language, browserZone) => {
      locale.language = language;
      const NativeDateTimeFormat = Intl.DateTimeFormat;
      let hostZone = 'UTC';
      vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locales, options) {
        return new NativeDateTimeFormat(locales, { timeZone: hostZone, ...options });
      });
      const component = surface === 'work'
        ? <WorkQueueWorkbench role="reporter" overview={overview} routePath="/admin/work" />
        : <ActionFirstDashboard role="super_admin" overview={overview} userName="QA Owner" />;
      const html = renderToString(component);
      container = document.createElement('div'); container.innerHTML = html; document.body.append(container);
      hostZone = browserZone;
      const recoverableError = vi.fn();
      await act(async () => {
        root = hydrateRoot(container!, component, { onRecoverableError: recoverableError });
      });
      expect(recoverableError).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Timezone acceptance story');
    }
  );
});
