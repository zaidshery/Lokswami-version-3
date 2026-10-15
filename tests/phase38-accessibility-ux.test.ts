import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 3.8E - Accessibility & Viewport Contracts', () => {
  const CANONICAL_AUDIT_VIEWPORTS = [
    { width: 1440, height: 900, name: 'Desktop' },
    { width: 768, height: 1024, name: 'Tablet' },
    { width: 390, height: 844, name: 'Mobile' },
  ];

  it('validates canonical viewport definitions conform to responsive QA contracts', () => {
    CANONICAL_AUDIT_VIEWPORTS.forEach((vp) => {
      expect(vp.width).toBeGreaterThanOrEqual(320);
      expect(vp.height).toBeGreaterThanOrEqual(480);
    });
  });

  it('ensures PushAlertDeskClient contains accessible live regions and input bindings', () => {
    const pushDeskSource = fs.readFileSync(
      path.resolve('app/(admin)/admin/push-alerts/PushAlertDeskClient.tsx'),
      'utf8'
    );

    // Live regions
    expect(pushDeskSource).toContain('role="status"');
    expect(pushDeskSource).toContain('aria-live="polite"');
    expect(pushDeskSource).toContain('role="alert"');
    expect(pushDeskSource).toContain('aria-live="assertive"');

    // Safe button semantics
    expect(pushDeskSource).toContain('type="button"');
    expect(pushDeskSource).not.toMatch(/>\s*Send Push\s*</i);
  });

  it('ensures Media management UI contains accessible live status announcements', () => {
    const mediaPageSource = fs.readFileSync(
      path.resolve('app/(admin)/admin/media/page.tsx'),
      'utf8'
    );

    expect(mediaPageSource).toContain('role="alert"');
    expect(mediaPageSource).toContain('role="status"');
    expect(mediaPageSource).toContain('htmlFor="media-file"');
  });

  it('ensures Social Posts management UI announces feedback in live regions', () => {
    const socialPageSource = fs.readFileSync(
      path.resolve('app/(admin)/admin/social-posts/page.tsx'),
      'utf8'
    );

    expect(socialPageSource).toContain('role="alert"');
    expect(socialPageSource).toContain('aria-live="assertive"');
  });
});
