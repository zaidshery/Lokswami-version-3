import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAGE_ACCESS,
  canManageLeadershipReports,
  canManageNewsroomSettings,
  canManageSettings,
  canManageTeam,
  canManageUsers,
  canRunGlobalAiOps,
  canViewPage,
  type AdminPageKey,
} from '@/lib/auth/permissions';
import { ADMIN_ROLES, type AdminRole } from '@/lib/auth/roles';

const CORE_SYSTEM_PAGES: AdminPageKey[] = [
  'team',
  'users',
  'settings',
  'newsroom_settings',
  'audit_log',
  'permission_review',
  'operations_center',
  'operations_diagnostics',
];

const PAGE_FILES: Array<[AdminPageKey, string]> = [
  ['team', 'app/(admin)/admin/team/page.tsx'],
  ['users', 'app/(admin)/admin/users/page.tsx'],
  ['settings', 'app/(admin)/admin/settings/page.tsx'],
  ['newsroom_settings', 'app/(admin)/admin/settings/newsroom/page.tsx'],
  ['audit_log', 'app/(admin)/admin/audit-log/page.tsx'],
  ['permission_review', 'app/(admin)/admin/permission-review/page.tsx'],
  ['operations_center', 'app/(admin)/admin/operations/page.tsx'],
  ['operations_diagnostics', 'app/(admin)/admin/operations-diagnostics/page.tsx'],
];

function readSource(relativePath: string) {
  return fs.readFileSync(path.resolve(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

describe('Phase 3.10E four-role system-control acceptance', () => {
  it.each(ADMIN_ROLES)('applies the complete core page matrix to %s', (role) => {
    for (const page of CORE_SYSTEM_PAGES) {
      expect(canViewPage(role, page), `${role} -> ${page}`).toBe(role === 'super_admin');
      expect(PAGE_ACCESS[page], `${page} canonical policy`).toEqual(['super_admin']);
    }
  });

  it('keeps every core direct URL behind its canonical server page guard', () => {
    for (const [pageKey, file] of PAGE_FILES) {
      const source = readSource(file);
      expect(source).toContain('getAdminSession');
      expect(source).toContain(`canViewPage(admin.role, '${pageKey}')`);
      expect(source).toContain("redirect('/admin/work?access=denied')");
    }
  });

  it.each(ADMIN_ROLES)('keeps service-level system mutations restricted for %s', (role) => {
    const expected = role === 'super_admin';
    const decisions = [
      canManageTeam(role),
      canManageUsers(role),
      canManageSettings(role),
      canManageNewsroomSettings(role),
      canManageLeadershipReports(role),
      canRunGlobalAiOps(role),
    ];

    expect(decisions).toEqual(Array.from({ length: decisions.length }, () => expected));
  });

  it('keeps sensitive API routes tied to canonical service guards and hardened mutation wrappers', () => {
    const guardedRoutes: Array<[string, string]> = [
      ['app/api/admin/users/route.ts', 'canManageUsers'],
      ['app/api/admin/team/route.ts', 'canManageTeam'],
      ['app/api/admin/team/[id]/route.ts', 'canManageTeam'],
      ['app/api/admin/team/[id]/setup-link/route.ts', 'canManageTeam'],
      ['app/api/admin/analytics/briefing-schedules/route.ts', 'canManageLeadershipReports'],
      ['app/api/admin/analytics/briefing-schedules/retry-failed/route.ts', 'canManageLeadershipReports'],
      ['app/api/admin/tts/cleanup/route.ts', 'canRunGlobalAiOps'],
    ];

    for (const [file, guard] of guardedRoutes) {
      const source = readSource(file);
      expect(source, file).toContain(guard);
      expect(source, file).toMatch(/withAdmin(Api|Mutation)/);
    }
  });

  it('derives navigation visibility from the same page policy', () => {
    const shell = readSource('app/(admin)/admin/AdminShell.tsx');
    for (const page of CORE_SYSTEM_PAGES) {
      expect(shell).toContain(`pageKey: '${page}'`);
    }
    expect(shell).toContain('canViewPage(role, surface.pageKey)');
    expect(shell).toContain("labelEn: 'User Accounts'");
  });

  it('enumerates exactly the four accepted admin roles', () => {
    expect([...ADMIN_ROLES] satisfies AdminRole[]).toEqual([
      'admin',
      'super_admin',
      'reporter',
      'copy_editor',
    ]);
  });
});
