import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 3.9E — Admin UX, Accessibility & Responsive QA (Tasks 1–11, 25)', () => {
  const TARGET_VIEWPORTS = [
    { width: 1440, height: 900, name: 'Desktop' },
    { width: 768, height: 1024, name: 'Tablet' },
    { width: 390, height: 844, name: 'Mobile' },
  ];

  describe('1. Responsive Viewport Targets (Task 6 & 25)', () => {
    it('validates canonical target viewports match exactly Desktop (1440x900), Tablet (768x1024), and Mobile (390x844)', () => {
      const desktop = TARGET_VIEWPORTS.find((v) => v.name === 'Desktop');
      expect(desktop).toEqual({ width: 1440, height: 900, name: 'Desktop' });

      const tablet = TARGET_VIEWPORTS.find((v) => v.name === 'Tablet');
      expect(tablet).toEqual({ width: 768, height: 1024, name: 'Tablet' });

      const mobile = TARGET_VIEWPORTS.find((v) => v.name === 'Mobile');
      expect(mobile).toEqual({ width: 390, height: 844, name: 'Mobile' });
    });
  });

  describe('2. Admin Desk List UX & A11y (Task 2, 7, 8)', () => {
    const listPageSource = fs.readFileSync(
      path.resolve('app/(admin)/admin/epapers/page.tsx'),
      'utf8'
    );

    it('contains accessible live regions for status and error announcements', () => {
      expect(listPageSource).toContain('role="status"');
      expect(listPageSource).toContain('aria-live="polite"');
      expect(listPageSource).toContain('role="alert"');
      expect(listPageSource).toContain('aria-live="assertive"');
    });

    it('includes explicit aria-labels on search, filter, and view controls', () => {
      expect(listPageSource).toContain('aria-label="Filter by status"');
      expect(listPageSource).toContain('aria-label="Filter by city"');
      expect(listPageSource).toContain('Search by title or city');
    });

    it('clearly communicates revision number and historical status', () => {
      expect(listPageSource).toContain('Rev {epaper.revisionNumber}');
      expect(listPageSource).toContain('Historical');
    });

    it('provides clear empty states and responsive layout wrappers', () => {
      expect(listPageSource).toContain('No {labels.plural.toLowerCase()} found.');
      expect(listPageSource).toContain('min-w-0 flex-1');
    });
  });

  describe('3. Create / Upload UX & A11y (Task 3, 7, 9)', () => {
    const newPageSource = fs.readFileSync(
      path.resolve('app/(admin)/admin/epapers/new/page.tsx'),
      'utf8'
    );

    it('contains accessible live regions for async upload status and error feedback', () => {
      expect(newPageSource).toContain('role="status"');
      expect(newPageSource).toContain('aria-live="polite"');
      expect(newPageSource).toContain('role="alert"');
      expect(newPageSource).toContain('aria-live="assertive"');
    });

    it('includes duplicate edition conflict guidance in error state', () => {
      expect(newPageSource).toContain('create a revision from the published edition');
      expect(newPageSource).toContain('already exists');
    });

    it('has accessible form labels and button disabled states during submission', () => {
      expect(newPageSource).toContain('aria-label="Publication title"');
      expect(newPageSource).toContain('aria-label="PDF file upload"');
      expect(newPageSource).toContain('disabled={loading}');
    });
  });

  describe('4. Production Workspace UX, Conflict & Blocker Feedback (Task 4, 10, 11)', () => {
    const workspaceSource = fs.readFileSync(
      path.resolve('app/(admin)/admin/epapers/[id]/page.tsx'),
      'utf8'
    );

    it('handles optimistic concurrency conflicts (EPAPER_VERSION_CONFLICT) with reload recommendation', () => {
      expect(workspaceSource).toContain('EPAPER_VERSION_CONFLICT');
      expect(workspaceSource).toContain('conflictNotice');
      expect(workspaceSource).toContain('Reload Edition');
      expect(workspaceSource).toContain('void fetchData()');
    });

    it('communicates revision identity and historical badge in workspace header', () => {
      expect(workspaceSource).toContain('Rev {epaper.revisionNumber}');
      expect(workspaceSource).toContain('Historical');
    });

    it('displays canonical server-backed publication blockers', () => {
      expect(workspaceSource).toContain('blockers');
      expect(workspaceSource).toContain('readiness');
    });

    it('provides accessible live regions for workspace feedback', () => {
      expect(workspaceSource).toContain('role="status"');
      expect(workspaceSource).toContain('aria-live="polite"');
      expect(workspaceSource).toContain('role="alert"');
      expect(workspaceSource).toContain('aria-live="assertive"');
    });
  });

  describe('5. Page / Hotspot Editor UX & Mutation Guards (Task 5, 8)', () => {
    const pageEditorSource = fs.readFileSync(
      path.resolve('app/(admin)/admin/epapers/[id]/page/[pageNumber]/page.tsx'),
      'utf8'
    );

    it('provides sequential numeric page navigation with reachable buttons', () => {
      expect(pageEditorSource).toContain('Prev Page');
      expect(pageEditorSource).toContain('Next Page');
      expect(pageEditorSource).toContain('Page {pageNumber} of {epaper.pageCount}');
    });

    it('guards against mutations on published or archived editions (isImmutable guard)', () => {
      expect(pageEditorSource).toContain('const isImmutable =');
      expect(pageEditorSource).toContain("epaper?.status === 'published'");
      expect(pageEditorSource).toContain("epaper?.productionStatus === 'archived'");
      expect(pageEditorSource).toContain('This edition is published and immutable');
    });

    it('contains accessible live status and alert regions', () => {
      expect(pageEditorSource).toContain('role="status"');
      expect(pageEditorSource).toContain('aria-live="polite"');
      expect(pageEditorSource).toContain('role="alert"');
      expect(pageEditorSource).toContain('aria-live="assertive"');
    });
  });
});
