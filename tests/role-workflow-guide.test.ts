import { describe, expect, it } from 'vitest';
import { canViewPage } from '@/lib/auth/permissions';
import { ADMIN_ROLES } from '@/lib/auth/roles';
import { getRoleWorkflowGuide } from '@/lib/admin/roleWorkflowGuide';

describe('role workflow guide', () => {
  it('gives every admin role a concise three-step workflow', () => {
    for (const role of ADMIN_ROLES) {
      const guide = getRoleWorkflowGuide(role);
      expect(guide.title).toBeTruthy();
      expect(guide.summary).toBeTruthy();
      expect(guide.authority).toBeTruthy();
      expect(guide.steps).toHaveLength(3);
    }
  });

  it('only links roles to pages they can access', () => {
    for (const role of ADMIN_ROLES) {
      const guide = getRoleWorkflowGuide(role);
      expect(canViewPage(role, guide.primaryAction.pageKey)).toBe(true);
      expect(canViewPage(role, guide.secondaryAction.pageKey)).toBe(true);
    }
  });

  it('preserves monthly E-Magazine cadence in the admin and copy-desk guidance', () => {
    expect(getRoleWorkflowGuide('admin').authority).toContain('monthly issue');
    expect(getRoleWorkflowGuide('admin').authority).toContain('E-Paper is daily and city/edition-based');
    expect(getRoleWorkflowGuide('copy_editor').authority).toContain('monthly E-Magazine');
  });

  it('aligns publication ownership guidance with Super Admin-only page access', () => {
    for (const role of ['admin', 'copy_editor'] as const) {
      expect(canViewPage(role, 'epapers')).toBe(false);
      expect(getRoleWorkflowGuide(role).authority).toContain('Super Admin owns E-Papers');
    }
    expect(canViewPage('super_admin', 'epapers')).toBe(true);
    expect(getRoleWorkflowGuide('super_admin').authority).toContain('all E-Paper and monthly E-Magazine production');
    expect(getRoleWorkflowGuide('copy_editor').steps.map(step => step.detail).join(' ')).not.toMatch(/publication desk|OCR|hotspots/);
  });
});
