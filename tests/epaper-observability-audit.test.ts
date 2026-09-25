import { describe, expect, it, vi } from 'vitest';
import {
  logEpaperMetric,
  redactSensitiveEpaperValue,
  sanitizeMetricFields,
  type EpaperMetricEvent,
} from '@/lib/server/epaperObservability';
import { buildEpaperActivityMessage } from '@/lib/server/epaperActivity';

describe('E-Paper Observability & Redaction Audit (Phase 3.9D)', () => {
  it('formats structured metric logs with required metadata and event types', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const testEvents: EpaperMetricEvent[] = [
      'epaper_upload_initiated',
      'epaper_upload_finalized',
      'epaper_processing_queued',
      'epaper_processing_started',
      'epaper_processing_completed',
      'epaper_processing_failed',
      'epaper_published',
      'epaper_archived',
      'epaper_ocr_queued',
      'epaper_ocr_started',
      'epaper_ocr_completed',
      'epaper_ocr_failed',
      'epaper_cleanup_started',
      'epaper_cleanup_completed',
      'epaper_cleanup_failed',
    ];

    for (const event of testEvents) {
      logEpaperMetric(event, {
        epaperId: 'epaper-123',
        familyId: 'family-456',
        revisionNumber: 2,
        pageNumber: 1,
      });

      expect(consoleSpy).toHaveBeenCalled();
      const lastCall = consoleSpy.mock.calls[consoleSpy.mock.calls.length - 1][0];
      const parsed = JSON.parse(lastCall);

      expect(parsed.type).toBe('epaper_metric');
      expect(parsed.event).toBe(event);
      expect(parsed.epaperId).toBe('epaper-123');
      expect(parsed.familyId).toBe('family-456');
      expect(parsed.revisionNumber).toBe(2);
      expect(parsed.pageNumber).toBe(1);
      expect(typeof parsed.timestamp).toBe('string');
      expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0);
    }

    consoleSpy.mockRestore();
  });

  describe('redactSensitiveEpaperValue', () => {
    it('redacts credentials and signatures from pre-signed storage URLs', () => {
      const signedUrl =
        'https://lokswami.nyc3.digitaloceanspaces.com/lokswami/epapers/indore/2026-09-25/file.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=DO00SECRET%2F20260925%2Fnyc3%2Fs3%2Faws4_request&X-Amz-Date=20260925T120000Z&X-Amz-Expires=900&X-Amz-Signature=supersecret12345';
      const redacted = redactSensitiveEpaperValue(signedUrl);

      expect(redacted).not.toContain('supersecret12345');
      expect(redacted).not.toContain('DO00SECRET');
      expect(redacted).toContain('[REDACTED_SIGNED_URL_PARAMS]');
      expect(redacted).toContain('https://lokswami.nyc3.digitaloceanspaces.com');
    });

    it('redacts Bearer tokens', () => {
      const header = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload.sig';
      const redacted = redactSensitiveEpaperValue(header);

      expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(redacted).toContain('Bearer [REDACTED]');
    });

    it('redacts assignment patterns for sensitive tokens and keys', () => {
      const message = 'Failed connecting with password=SuperSecretPass and token=abc123xyz';
      const redacted = redactSensitiveEpaperValue(message);

      expect(redacted).not.toContain('SuperSecretPass');
      expect(redacted).not.toContain('abc123xyz');
      expect(redacted).toContain('password=[REDACTED]');
      expect(redacted).toContain('token=[REDACTED]');
    });

    it('caps excessively long strings to at most 500 characters', () => {
      const hugeString = 'a'.repeat(2000);
      const redacted = redactSensitiveEpaperValue(hugeString);

      expect(redacted.length).toBe(500);
    });
  });

  describe('sanitizeMetricFields', () => {
    it('redacts fields with sensitive keys recursively', () => {
      const input = {
        epaperId: 'epaper-123',
        secretToken: 'very-secret',
        apiKey: 'key-abc-123',
        sessionCookie: 'sess=999',
        nested: {
          password: 'pass',
          normalKey: 'normal-value',
        },
        list: [
          'safe',
          'Bearer token123',
        ],
      };

      const sanitized = sanitizeMetricFields(input);

      expect(sanitized.epaperId).toBe('epaper-123');
      expect(sanitized.secretToken).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.sessionCookie).toBe('[REDACTED]');
      expect((sanitized.nested as Record<string, unknown>).password).toBe('[REDACTED]');
      expect((sanitized.nested as Record<string, unknown>).normalKey).toBe('normal-value');
      expect((sanitized.list as string[])[0]).toBe('safe');
      expect((sanitized.list as string[])[1]).toBe('Bearer [REDACTED]');
    });
  });

  describe('buildEpaperActivityMessage', () => {
    it('provides human-readable messages for Phase 3.9D activity events', () => {
      expect(buildEpaperActivityMessage({ action: 'edition_deleted' })).toBe(
        'Edition deleted and unreferenced assets cleaned up.'
      );
      expect(buildEpaperActivityMessage({ action: 'ocr_queued' })).toBe(
        'OCR extraction queued for edition pages.'
      );
      expect(buildEpaperActivityMessage({ action: 'cleanup_failed' })).toBe(
        'Asset cleanup encountered errors during deletion.'
      );
    });
  });
});
