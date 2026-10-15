import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  auditMediaUploadInitiated,
  auditMediaUploadCompleted,
  auditMediaUploadFailed,
  auditMediaDeleted,
  auditVideoProductionStarted,
  auditVideoExportCompleted,
  auditVideoProductionFailed,
  auditSocialDispatched,
  auditSocialRetry,
  auditSocialReconcile,
  auditPushPrepared,
  auditPushCancelled,
  auditPushFailed,
} from '@/lib/security/phase38Observability';
import * as auditLoggerModule from '@/lib/security/auditLogger';
import type { WorkflowActorRef } from '@/lib/workflow/types';

describe('Phase 3.8E - Observability & Audit Events Suite', () => {
  const logAuditActionSpy = vi.spyOn(auditLoggerModule, 'logAuditAction');

  beforeEach(() => {
    logAuditActionSpy.mockReset();
    logAuditActionSpy.mockResolvedValue(null as any);
  });

  afterAll(() => {
    logAuditActionSpy.mockRestore();
  });

  const actor: WorkflowActorRef = {
    id: 'user-ops-1',
    name: 'Ops Admin',
    email: 'ops@lokswami.com',
    role: 'admin',
  };

  describe('Media Audit Events', () => {
    it('audits media upload initiation', async () => {
      await auditMediaUploadInitiated({
        actor,
        resourceId: 'upload-session-1',
        resourceName: 'cover.webp',
        metadata: { mime: 'image/webp', size: 10240 },
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('create');
      expect(call.resourceType).toBe('media');
      expect(call.resourceId).toBe('upload-session-1');
      expect(call.userEmail).toBe(actor.email);
    });

    it('audits media upload completion', async () => {
      await auditMediaUploadCompleted({
        actor,
        resourceId: 'asset-1',
        resourceName: 'photo.jpg',
        metadata: { canonicalKey: 'media/asset-1.jpg' },
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('update');
      expect(call.resourceType).toBe('media');
      expect(call.responseStatus).toBe('success');
    });

    it('audits media upload failure', async () => {
      await auditMediaUploadFailed({
        actor,
        resourceId: 'asset-failed-1',
        errorMessage: 'Invalid mime header',
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.responseStatus).toBe('error');
      expect(call.errorMessage).toContain('Invalid mime header');
    });

    it('audits media deletion', async () => {
      await auditMediaDeleted({
        actor,
        resourceId: 'asset-del-1',
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('delete');
      expect(call.resourceType).toBe('media');
    });
  });

  describe('Video Production Audit Events', () => {
    it('audits video production start', async () => {
      await auditVideoProductionStarted({
        actor,
        resourceId: 'video-1',
        resourceName: 'Special Report Clip',
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('update');
      expect(call.resourceType).toBe('video');
    });

    it('audits video export completion', async () => {
      await auditVideoExportCompleted({
        actor,
        resourceId: 'video-1',
        resourceName: 'Special Report Clip',
        metadata: { duration: 120 },
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('publish');
      expect(call.resourceType).toBe('video');
    });

    it('audits video production failure', async () => {
      await auditVideoProductionFailed({
        actor,
        resourceId: 'video-1',
        errorMessage: 'Transcoding check failed',
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.responseStatus).toBe('error');
      expect(call.errorMessage).toContain('Transcoding check failed');
    });
  });

  describe('Social Distribution Audit Events', () => {
    it('audits social dispatch', async () => {
      await auditSocialDispatched({
        actor,
        resourceId: 'soc-del-1',
        resourceName: 'Social Facebook Post',
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('dispatch');
      expect(call.resourceType).toBe('social');
    });

    it('audits social retry', async () => {
      await auditSocialRetry({
        actor,
        resourceId: 'soc-del-1',
        metadata: { attempt: 2 },
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('retry');
      expect(call.resourceType).toBe('social');
    });

    it('audits social reconcile', async () => {
      await auditSocialReconcile({
        actor,
        resourceId: 'soc-del-1',
        metadata: { outcome: 'succeeded' },
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('reconcile');
      expect(call.resourceType).toBe('social');
    });
  });

  describe('Push Audit Events', () => {
    it('audits push preparation', async () => {
      await auditPushPrepared({
        actor,
        resourceId: 'push-1',
        resourceName: 'Flash Alert Headline',
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('prepare');
      expect(call.resourceType).toBe('push');
    });

    it('audits push cancellation', async () => {
      await auditPushCancelled({
        actor,
        resourceId: 'push-1',
        metadata: { reason: 'Superseded' },
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.action).toBe('cancel');
      expect(call.resourceType).toBe('push');
    });

    it('audits push failure', async () => {
      await auditPushFailed({
        actor,
        resourceId: 'push-1',
        errorMessage: 'Provider disabled by policy',
      });

      expect(logAuditActionSpy).toHaveBeenCalledTimes(1);
      const call = logAuditActionSpy.mock.calls[0][0];
      expect(call.responseStatus).toBe('error');
      expect(call.errorMessage).toContain('Provider disabled by policy');
    });
  });
});
