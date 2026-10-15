import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('CMS publishing readiness UI contracts', () => {
  it('shows live canonical article blockers and truthful direct-publish guidance', () => {
    const editor = source(
      'app/(admin)/admin/articles/[id]/edit/EditArticlePageClient.tsx'
    );

    expect(editor).toContain('buildArticleAssistResult(buildAssistPayload())');
    expect(editor).toContain('summarizeArticleReadiness');
    expect(editor).toContain('Publish readiness');
    expect(editor).toContain('These checks use the same shared readiness rules');
    expect(editor).toContain('Direct publishing is available when the publish-readiness checks pass');
    expect(editor).toContain('hasReadinessBlockers');
    expect(editor).toContain('Article changed elsewhere. Reload before publishing.');
  });

  it('sends E-paper publish CAS version and displays every canonical blocker', () => {
    const workspace = source('app/(admin)/admin/epapers/[id]/page.tsx');

    expect(workspace).toContain("nextStatus === 'published'");
    expect(workspace).toContain('expectedVersion: epaper.version || 1');
    expect(workspace).toContain('buildEpaperProcessingBlockers');
    expect(workspace).toContain('publishBlockers.map((blocker)');
    expect(workspace).not.toContain('publishBlockers.slice(0, 3)');
    expect(workspace).toContain('Review warnings (do not block publishing)');
    expect(workspace).toContain('Reload Edition');
  });

  it('requires and atomically applies the E-paper publish version', () => {
    const service = source('lib/server/epaper/epaperEditorialService.ts');
    const repository = source('lib/server/epaper/epaperRepository.ts');

    expect(service).toContain('Current edition version is required before publishing.');
    expect(service).toContain('buildEpaperProcessingBlockers');
    expect(repository).toContain('const publishFilter = { _id: id, version: expectedVersion }');
    expect(repository).toContain('$inc: { version: 1 }');
  });
});
