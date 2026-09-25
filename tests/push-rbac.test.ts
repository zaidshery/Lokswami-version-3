import { describe, expect, it } from 'vitest';
import { validatePushActor } from '@/lib/server/push/pushSafetyService';
import { canViewPage } from '@/lib/auth/permissions';
import type { AdminRole } from '@/lib/auth/roles';

describe('Phase 3.8D - Push RBAC & Newsroom Actor Safety', () => {
  const roles: AdminRole[] = ['super_admin', 'admin', 'copy_editor', 'reporter'];

  it('verifies push_alerts page permission matches newsroom policy', () => {
    // Only super_admin and admin can access push alerts desk
    expect(canViewPage('super_admin', 'push_alerts')).toBe(true);
    expect(canViewPage('admin', 'push_alerts')).toBe(true);
    expect(canViewPage('copy_editor', 'push_alerts')).toBe(false);
    expect(canViewPage('reporter', 'push_alerts')).toBe(false);
  });

  it('allows super_admin to prepare and manage push alerts', () => {
    const actor = { id: 'sa-1', name: 'Super Admin', email: 'sa@lokswami.com', role: 'super_admin' as const };
    const result = validatePushActor(actor);
    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('allows admin to prepare and manage push alerts', () => {
    const actor = { id: 'admin-1', name: 'Admin', email: 'admin@lokswami.com', role: 'admin' as const };
    const result = validatePushActor(actor);
    expect(result.allowed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects copy_editor with 403 authorization error', () => {
    const actor = { id: 'editor-1', name: 'Editor', email: 'editor@lokswami.com', role: 'copy_editor' as const };
    const result = validatePushActor(actor);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Forbidden');
  });

  it('rejects reporter with 403 authorization error', () => {
    const actor = { id: 'rep-1', name: 'Reporter', email: 'rep@lokswami.com', role: 'reporter' as const };
    const result = validatePushActor(actor);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Forbidden');
  });

  it('rejects unauthenticated/null actor', () => {
    const result = validatePushActor(null);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Unauthorized');
  });
});
