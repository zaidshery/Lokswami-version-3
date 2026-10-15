import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const MIGRATED_ROUTE_FILES = [
  'app/api/admin/epapers/route.ts',
  'app/api/admin/epapers/[id]/route.ts',
  'app/api/admin/epapers/[id]/activity/route.ts',
  'app/api/admin/epapers/[id]/pages/route.ts',
  'app/api/admin/epapers/[id]/articles/route.ts',
  'app/api/admin/epapers/[id]/articles/[articleId]/release/route.ts',
  'app/api/admin/epapers/[id]/articles/[articleId]/tts/route.ts',
  'app/api/admin/epapers/[id]/crop-hotspot/route.ts',
  'app/api/admin/epapers/[id]/ocr/route.ts',
  'app/api/admin/epapers/[id]/ocr/[suggestionId]/route.ts',
  'app/api/admin/epapers/[id]/processing/route.ts',
  'app/api/admin/epapers/[id]/processing/retry/route.ts',
  'app/api/admin/epapers/[id]/revisions/route.ts',
  'app/api/admin/epapers/[id]/tts/route.ts',
  'app/api/admin/epapers/[id]/uploads/finalize/route.ts',
  'app/api/admin/epapers/import/route.ts',
  'app/api/admin/epapers/uploads/route.ts',
  'app/api/epapers/route.ts',
  'app/api/epapers/[id]/route.ts',
  'app/api/epapers/[id]/articles/[articleId]/tts/route.ts',
  'app/api/public/epapers/[id]/pdf/route.ts',
] as const;

const FORBIDDEN_ROUTE_DEPENDENCIES = [
  '@/lib/models/EPaper',
  '@/lib/models/EPaperArticle',
  '@/lib/models/EPaperOcrSuggestion',
  '@/lib/models/EPaperProcessingJob',
  '@/lib/storage/epapersFile',
  '@/lib/db/mongoose',
  "from 'mongoose'",
  'Types.ObjectId',
] as const;

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Phase 2.4 E-Paper domain boundaries', () => {
  it.each(MIGRATED_ROUTE_FILES)('%s delegates raw persistence to the domain', (file) => {
    const contents = source(file);
    for (const dependency of FORBIDDEN_ROUTE_DEPENDENCIES) {
      expect(contents, `${file} still contains ${dependency}`).not.toContain(dependency);
    }
  });

  it('keeps the admin detail controller below 200 lines', () => {
    expect(source('app/api/admin/epapers/[id]/route.ts').split(/\r?\n/).length).toBeLessThan(200);
  });

  it('routes home-feed edition reads through the E-Paper domain', () => {
    const contents = source('lib/server/content/publicHomeFeedService.ts');
    expect(contents).not.toContain('@/lib/models/EPaper');
    expect(contents).not.toContain('@/lib/storage/epapersFile');
    expect(contents).toContain('@/lib/server/epaper/epaperService');
  });

  it('keeps all raw E-Paper persistence in the repository boundary', () => {
    const repository = source('lib/server/epaper/epaperRepository.ts');
    expect(repository).toContain('@/lib/models/EPaper');
    expect(repository).toContain('@/lib/models/EPaperArticle');
    expect(repository).toContain('@/lib/models/EPaperOcrSuggestion');
    expect(repository).toContain('@/lib/models/EPaperProcessingJob');
    expect(repository).toContain('@/lib/storage/epapersFile');
  });
});
