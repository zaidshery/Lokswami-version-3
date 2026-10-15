import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminPageKey } from '@/lib/auth/permissions';

const mocks = vi.hoisted(() => ({
  admin: null as null | {
    id: string;
    email: string;
    name: string;
    role: 'super_admin' | 'admin' | 'copy_editor' | 'reporter';
  },
}));

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: vi.fn(async () => mocks.admin),
}));

vi.mock('next/navigation', () => ({
  redirect: (target: string) => {
    throw new Error(`REDIRECT:${target}`);
  },
}));

import { requireAdminPageAccess } from '@/app/(admin)/admin/AdminPageAccessGuard';

const root = path.join(process.cwd(), 'app', '(admin)', 'admin');

function readSource(filePath: string) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function hasDirectPageGuard(source: string) {
  return (
    /get(?:Super)?AdminSession/.test(source) &&
    /(canViewPage|canManageWorkflowAssignments|getSuperAdminSession)/.test(source)
  );
}

function hasRouteLayoutGuard(pagePath: string) {
  let directory = path.dirname(pagePath);
  while (directory !== root) {
    const layoutPath = path.join(directory, 'layout.tsx');
    if (fs.existsSync(layoutPath)) {
      const source = readSource(layoutPath);
      if (
        source.includes('requireAdminPageAccess') ||
        (/get(?:Super)?AdminSession/.test(source) && /canViewPage/.test(source))
      ) {
        return true;
      }
    }
    directory = path.dirname(directory);
  }
  return false;
}

function listAdminPages(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listAdminPages(entryPath);
    return entry.name === 'page.tsx' ? [entryPath] : [];
  });
}

beforeEach(() => {
  mocks.admin = null;
});

describe('Phase 3.5C admin page authorization', () => {
  it('protects every admin page with a direct page guard or route-specific server layout', () => {
    const pages = listAdminPages(root);
    const direct = pages.filter((pagePath) => hasDirectPageGuard(readSource(pagePath)));
    const routeLayout = pages.filter(
      (pagePath) => !hasDirectPageGuard(readSource(pagePath)) && hasRouteLayoutGuard(pagePath)
    );
    const unguarded = pages.filter(
      (pagePath) => !hasDirectPageGuard(readSource(pagePath)) && !hasRouteLayoutGuard(pagePath)
    );

    expect(pages).toHaveLength(48);
    expect(direct).toHaveLength(21);
    expect(routeLayout).toHaveLength(27);
    expect(unguarded.map((pagePath) => path.relative(root, pagePath))).toEqual([]);
  });

  it.each([
    ['ai/layout.tsx', 'ai_ops'],
    ['analytics/business-value/layout.tsx', 'business_value'],
    ['assignments/layout.tsx', 'assignments'],
    ['categories/layout.tsx', 'categories'],
    ['contact-messages/layout.tsx', 'contact_messages'],
    ['content-queue/layout.tsx', 'content_queue'],
    ['emagazines/layout.tsx', 'epapers'],
    ['emagazines/new/layout.tsx', 'epaper_create'],
    ['emagazines/[id]/edit/layout.tsx', 'epaper_edit'],
    ['emagazines/[id]/page/[pageNumber]/layout.tsx', 'epaper_page_edit'],
    ['epapers/layout.tsx', 'epapers'],
    ['epapers/new/layout.tsx', 'epaper_create'],
    ['epapers/[id]/edit/layout.tsx', 'epaper_edit'],
    ['epapers/[id]/page/[pageNumber]/layout.tsx', 'epaper_page_edit'],
    ['media/layout.tsx', 'media'],
    ['my-work/layout.tsx', 'my_work'],
    ['review-queue/layout.tsx', 'review_queue'],
    ['settings/elections/layout.tsx', 'newsroom_settings'],
    ['social-posts/layout.tsx', 'social_posts'],
    ['stories/layout.tsx', 'stories'],
    ['stories/new/layout.tsx', 'story_create'],
    ['stories/[id]/edit/layout.tsx', 'story_edit'],
    ['videos/layout.tsx', 'videos'],
    ['videos/new/layout.tsx', 'video_create'],
    ['videos/[id]/edit/layout.tsx', 'video_edit'],
  ] as const)('maps %s to the %s permission key', (relativePath, pageKey) => {
    expect(readSource(path.join(root, relativePath))).toContain(`'${pageKey}'`);
  });

  it('redirects guests before rendering page content', async () => {
    await expect(
      requireAdminPageAccess('epapers', '/admin/epapers')
    ).rejects.toThrow('REDIRECT:/signin?redirect=%2Fadmin%2Fepapers');
  });

  it.each(['admin', 'copy_editor', 'reporter'] as const)(
    'denies %s access to every control-plane page group',
    async (role) => {
      mocks.admin = {
        id: `${role}-1`,
        email: `${role}@example.com`,
        name: role,
        role,
      };
      const controlPlanePages: AdminPageKey[] = [
        'epapers',
        'epaper_create',
        'epaper_edit',
        'epaper_page_edit',
        'team',
        'ai_ops',
        'polls',
        'newsroom_settings',
        'users',
        'operations_center',
      ];

      for (const pageKey of controlPlanePages) {
        await expect(
          requireAdminPageAccess(pageKey, `/admin/${pageKey}`)
        ).rejects.toThrow('REDIRECT:/admin/work?access=denied');
      }
    }
  );

  it('allows super admin to render every control-plane page group', async () => {
    mocks.admin = {
      id: 'super-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'super_admin',
    };
    const controlPlanePages: AdminPageKey[] = [
      'epapers',
      'team',
      'ai_ops',
      'polls',
      'newsroom_settings',
      'users',
      'operations_center',
    ];

    for (const pageKey of controlPlanePages) {
      await expect(
        requireAdminPageAccess(pageKey, `/admin/${pageKey}`)
      ).resolves.toBeUndefined();
    }
  });

  it.each([
    ['admin', 'categories'],
    ['copy_editor', 'copy_desk'],
    ['reporter', 'stories'],
  ] as const)('preserves %s access to the %s newsroom surface', async (role, pageKey) => {
    mocks.admin = {
      id: `${role}-1`,
      email: `${role}@example.com`,
      name: role,
      role,
    };
    await expect(
      requireAdminPageAccess(pageKey, `/admin/${pageKey}`)
    ).resolves.toBeUndefined();
  });
});
