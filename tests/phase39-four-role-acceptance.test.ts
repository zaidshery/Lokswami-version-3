import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/epaperActivity', () => ({
  buildEpaperActivityMessage: vi.fn(() => 'Activity message'),
  recordEpaperActivity: vi.fn(),
  listEpaperActivity: vi.fn(() => []),
}));
vi.mock('@/lib/server/epaperObservability', () => ({
  logEpaperMetric: vi.fn(),
}));
vi.mock('@/lib/storage/workflowNotifications', () => ({
  createWorkflowNotification: vi.fn(),
}));

import {
  canCreateEpaper,
  canDeleteEpaper,
  canEditEpaper,
  canManageEpaperAssignments,
  canPrepareEpaperForPublish,
  canPublishEpaper,
  canViewPage,
  PAGE_ACCESS,
} from '@/lib/auth/permissions';
import { type AdminRole } from '@/lib/auth/roles';
import { EpaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { EpaperUploadService } from '@/lib/server/epaper/epaperUploadService';
import { EpaperRevisionService } from '@/lib/server/epaper/epaperRevisionService';
import { EpaperProcessingService } from '@/lib/server/epaper/epaperProcessingService';
import { EpaperOcrService } from '@/lib/server/epaper/epaperOcrService';
import { EpaperPageService } from '@/lib/server/epaper/epaperPageService';
import { EpaperCropService } from '@/lib/server/epaper/epaperCropService';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { EpaperForbiddenError, type AdminSessionIdentity } from '@/lib/server/epaper/epaperTypes';

function makeActor(role: AdminRole): AdminSessionIdentity {
  return {
    id: `usr-${role}-1`,
    name: `${role} User`,
    email: `${role}@lokswami.com`,
    username: `${role}@lokswami.com`,
    role,
  };
}

describe('Phase 3.9E — Four-Role RBAC Final Acceptance (Task 12, 13, 14, 24)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Canonical Page Access Matrix (Task 12 & 13)', () => {
    const roles: AdminRole[] = ['super_admin', 'admin', 'copy_editor', 'reporter'];

    it('grants epaper page access strictly to super_admin and denies admin, copy_editor, reporter', () => {
      const epaperPages = [
        'epapers',
        'epaper_create',
        'epaper_edit',
        'epaper_page_edit',
      ] as const;

      for (const page of epaperPages) {
        expect(PAGE_ACCESS[page]).toEqual(['super_admin']);

        for (const role of roles) {
          const allowed = canViewPage(role, page);
          if (role === 'super_admin') {
            expect(allowed, `super_admin should have access to ${page}`).toBe(true);
          } else {
            expect(allowed, `${role} should NOT have access to ${page}`).toBe(false);
          }
        }
      }
    });
  });

  describe('2. Canonical Permission Helpers (Task 12)', () => {
    const deniedRoles: AdminRole[] = ['admin', 'copy_editor', 'reporter'];

    it('canCreateEpaper returns true for super_admin and false for other 3 roles', () => {
      expect(canCreateEpaper('super_admin')).toBe(true);
      for (const role of deniedRoles) {
        expect(canCreateEpaper(role)).toBe(false);
      }
      expect(canCreateEpaper(null)).toBe(false);
      expect(canCreateEpaper(undefined)).toBe(false);
    });

    it('canEditEpaper returns true for super_admin and false for other 3 roles', () => {
      expect(canEditEpaper('super_admin')).toBe(true);
      for (const role of deniedRoles) {
        expect(canEditEpaper(role)).toBe(false);
      }
      expect(canEditEpaper(null)).toBe(false);
      expect(canEditEpaper(undefined)).toBe(false);
    });

    it('canPrepareEpaperForPublish returns true for super_admin and false for other 3 roles', () => {
      expect(canPrepareEpaperForPublish('super_admin')).toBe(true);
      for (const role of deniedRoles) {
        expect(canPrepareEpaperForPublish(role)).toBe(false);
      }
    });

    it('canManageEpaperAssignments returns true for super_admin and false for other 3 roles', () => {
      expect(canManageEpaperAssignments('super_admin')).toBe(true);
      for (const role of deniedRoles) {
        expect(canManageEpaperAssignments(role)).toBe(false);
      }
    });

    it('canPublishEpaper returns true for super_admin and false for other 3 roles', () => {
      expect(canPublishEpaper('super_admin')).toBe(true);
      for (const role of deniedRoles) {
        expect(canPublishEpaper(role)).toBe(false);
      }
    });

    it('canDeleteEpaper returns true for super_admin and false for other 3 roles', () => {
      expect(canDeleteEpaper('super_admin')).toBe(true);
      for (const role of deniedRoles) {
        expect(canDeleteEpaper(role)).toBe(false);
      }
    });
  });

  describe('3. Domain Service Rejection for Non-super_admin Roles (Task 12 & 13)', () => {
    const nonSuperAdminRoles: AdminRole[] = ['admin', 'copy_editor', 'reporter'];

    it('denies epaperEditorialService.list for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperEditorialService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.list(actor, new URLSearchParams())).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperEditorialService.create for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperEditorialService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.create(actor, { title: 'Test' })).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperEditorialService.get for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperEditorialService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.get(actor, 'valid-id')).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperEditorialService.updateMetadata for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperEditorialService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.updateMetadata(actor, 'valid-id', { title: 'Updated' })).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperEditorialService.updateWorkflow for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperEditorialService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.updateWorkflow(actor, 'valid-id', { productionStatus: 'published' })).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperEditorialService.delete for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperEditorialService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.delete(actor, 'valid-id')).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperUploadService.initialize for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperUploadService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.initialize(actor, {
          publicationType: 'epaper',
          citySlug: 'indore',
          publishDate: '2026-09-26',
          fileName: 'edition.pdf',
          fileSize: 1024,
          fileType: 'application/pdf',
        })).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperRevisionService.create for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperRevisionService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.create(actor, 'valid-id')).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperProcessingService.retry for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperProcessingService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.retry(actor, 'valid-id', {})).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperOcrService.queue for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperOcrService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.queue(actor, 'valid-id', { pageNumbers: [1] })).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperPageService.update for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperPageService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.update(actor, 'valid-id', { pageType: 'editorial' }, 'application/json')).rejects.toThrow(EpaperForbiddenError);
      }
    });

    it('denies epaperCropService.crop for non-super_admin roles', async () => {
      const mockRepo = {} as unknown as EpaperRepository;
      const service = new EpaperCropService(mockRepo);

      for (const role of nonSuperAdminRoles) {
        const actor = makeActor(role);
        await expect(service.crop(actor, 'valid-id', {
          pageNumber: 1,
          cropBox: { x: 10, y: 10, width: 100, height: 100 },
        })).rejects.toThrow(EpaperForbiddenError);
      }
    });
  });

  describe('4. Internal Job Worker Route Protection (Task 14)', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('rejects execution when cron secret is not configured with 503', async () => {
      delete process.env.ADMIN_CRON_SECRET;
      delete process.env.CRON_SECRET;

      const { POST } = await import('@/app/api/admin/epapers/jobs/run-due/route');
      const request = new NextRequest('http://localhost/api/admin/epapers/jobs/run-due', {
        method: 'POST',
      });
      const response = await POST(request);
      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data.error).toContain('Cron secret is not configured');
    });

    it('rejects execution with 403 when wrong cron secret is provided', async () => {
      process.env.ADMIN_CRON_SECRET = 'test-cron-secret-12345';

      const { POST } = await import('@/app/api/admin/epapers/jobs/run-due/route');
      const request = new NextRequest('http://localhost/api/admin/epapers/jobs/run-due', {
        method: 'POST',
        headers: { 'x-cron-secret': 'wrong-secret' },
      });
      const response = await POST(request);
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Forbidden');
    });

    it('rejects execution with 403 when no cron secret header is sent', async () => {
      process.env.ADMIN_CRON_SECRET = 'test-cron-secret-12345';

      const { POST } = await import('@/app/api/admin/epapers/jobs/run-due/route');
      const request = new NextRequest('http://localhost/api/admin/epapers/jobs/run-due', {
        method: 'POST',
      });
      const response = await POST(request);
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Forbidden');
    });

    it('never exposes secret in error message or payload', async () => {
      process.env.ADMIN_CRON_SECRET = 'super-secret-production-token-99999';

      const { POST } = await import('@/app/api/admin/epapers/jobs/run-due/route');
      const request = new NextRequest('http://localhost/api/admin/epapers/jobs/run-due', {
        method: 'POST',
        headers: { 'x-cron-secret': 'invalid' },
      });
      const response = await POST(request);
      const rawText = await response.text();
      expect(rawText).not.toContain('super-secret-production-token-99999');
    });
  });
});
