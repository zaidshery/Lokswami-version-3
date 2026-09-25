import { describe, expect, it } from 'vitest';
import { canViewPage, canDispatchSocialPosts, canDeleteContent } from '@/lib/auth/permissions';
import { validatePushActor } from '@/lib/server/push/pushSafetyService';
import type { AdminRole } from '@/lib/auth/roles';

describe('Phase 3.8E - Four-Role Newsroom Acceptance Suite', () => {
  const superAdmin = { id: 'sa-1', name: 'Super Admin', email: 'sa@lokswami.com', role: 'super_admin' as const };
  const admin = { id: 'adm-1', name: 'Desk Admin', email: 'adm@lokswami.com', role: 'admin' as const };
  const copyEditor = { id: 'ce-1', name: 'Copy Editor', email: 'ce@lokswami.com', role: 'copy_editor' as const };
  const reporter = { id: 'rep-1', name: 'Field Reporter', email: 'rep@lokswami.com', role: 'reporter' as const };

  describe('1. Super Admin Role Acceptance', () => {
    it('has full access to media, video, social, and push controls', () => {
      expect(canViewPage('super_admin', 'media')).toBe(true);
      expect(canViewPage('super_admin', 'videos')).toBe(true);
      expect(canViewPage('super_admin', 'social_posts')).toBe(true);
      expect(canViewPage('super_admin', 'push_alerts')).toBe(true);
      expect(canDispatchSocialPosts('super_admin')).toBe(true);
      expect(canDeleteContent(superAdmin)).toBe(true);

      const pushCheck = validatePushActor(superAdmin);
      expect(pushCheck.allowed).toBe(true);
    });
  });

  describe('2. Admin Role Acceptance', () => {
    it('has editorial access to media, video, social drafts, and push desk', () => {
      expect(canViewPage('admin', 'media')).toBe(true);
      expect(canViewPage('admin', 'videos')).toBe(true);
      expect(canViewPage('admin', 'social_posts')).toBe(true);
      expect(canViewPage('admin', 'push_alerts')).toBe(true);
      expect(canDeleteContent(admin)).toBe(true);

      // Social external automated dispatch is restricted to super_admin
      expect(canDispatchSocialPosts('admin')).toBe(false);

      const pushCheck = validatePushActor(admin);
      expect(pushCheck.allowed).toBe(true);
    });
  });

  describe('3. Copy Editor Role Acceptance', () => {
    it('has review/preview access but cannot dispatch external distribution or manage push alerts', () => {
      expect(canViewPage('copy_editor', 'media')).toBe(true);
      expect(canViewPage('copy_editor', 'videos')).toBe(true);
      expect(canViewPage('copy_editor', 'social_posts')).toBe(true);
      expect(canViewPage('copy_editor', 'push_alerts')).toBe(false);
      expect(canDispatchSocialPosts('copy_editor')).toBe(false);
      expect(canDeleteContent(copyEditor)).toBe(false);

      const pushCheck = validatePushActor(copyEditor);
      expect(pushCheck.allowed).toBe(false);
      expect(pushCheck.error).toContain('Forbidden');
    });
  });

  describe('4. Reporter Role Acceptance', () => {
    it('has authoring media scope only, cannot access video governance, social, or push', () => {
      expect(canViewPage('reporter', 'media')).toBe(true);
      expect(canViewPage('reporter', 'videos')).toBe(false);
      expect(canViewPage('reporter', 'social_posts')).toBe(false);
      expect(canViewPage('reporter', 'push_alerts')).toBe(false);
      expect(canDispatchSocialPosts('reporter')).toBe(false);
      expect(canDeleteContent(reporter)).toBe(false);

      const pushCheck = validatePushActor(reporter);
      expect(pushCheck.allowed).toBe(false);
      expect(pushCheck.error).toContain('Forbidden');
    });
  });
});
