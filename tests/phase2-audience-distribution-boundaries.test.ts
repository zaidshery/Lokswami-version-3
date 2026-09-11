import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const audienceControllers = [
  'app/api/subscribe/route.ts',
  'app/api/marketing/lead/route.ts',
  'app/api/contact/route.ts',
  'app/api/advertise/inquiry/route.ts',
  'app/api/careers/apply/route.ts',
  'app/api/elections/results/route.ts',
  'app/api/admin/contact-messages/route.ts',
  'app/api/admin/contact-messages/[id]/route.ts',
  'app/api/admin/elections/results/route.ts',
  'app/api/admin/elections/upload/route.ts',
  'app/api/admin/elections/delete/route.ts',
];

const distributionControllers = [
  'app/api/admin/social-posts/route.ts',
  'app/api/admin/social-posts/[id]/route.ts',
  'app/api/admin/social-posts/[id]/dispatch/route.ts',
  'app/api/admin/social-posts/generate/route.ts',
];

describe('Phase 2.6 Audience and Distribution architecture', () => {
  it('keeps audience controllers free of raw persistence imports', () => {
    for (const file of audienceControllers) {
      const source = read(file);
      expect(source, file).not.toMatch(/@\/lib\/models\//);
      expect(source, file).not.toContain('@/lib/db/mongoose');
      expect(source, file).not.toMatch(/@\/lib\/storage\//);
      expect(source, file).not.toMatch(/from ['"](?:fs|path)['"]/);
    }
  });

  it('keeps social controllers free of Mongoose, models, and file stores', () => {
    for (const file of distributionControllers) {
      const source = read(file);
      expect(source, file).not.toMatch(/from ['"]mongoose['"]/);
      expect(source, file).not.toMatch(/@\/lib\/models\//);
      expect(source, file).not.toContain('@/lib/db/mongoose');
      expect(source, file).not.toMatch(/@\/lib\/storage\//);
    }
  });

  it('prevents Distribution from becoming raw Content, Video, or E-Paper persistence owner', () => {
    const files = [
      'lib/server/distribution/distributionTypes.ts',
      'lib/server/distribution/socialPostRepository.ts',
      'lib/server/distribution/socialDistributionService.ts',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source, file).not.toMatch(/@\/lib\/models\/(?:Article|Story|Video|EPaper)/);
      expect(source, file).not.toMatch(/@\/lib\/storage\/(?:articles|stories|videos|epapers)File/);
    }
  });

  it('routes every sitemap through the content query boundary', () => {
    for (const file of [
      'app/sitemap.ts',
      'app/news-sitemap.xml/route.ts',
      'app/video-sitemap.xml/route.ts',
    ]) {
      const source = read(file);
      expect(source, file).toContain('@/lib/server/content/sitemapContentQueryService');
      expect(source, file).not.toMatch(/@\/lib\/(?:models|storage)\//);
    }

    const boundary = read('lib/server/content/sitemapContentQueryService.ts');
    expect(boundary).toContain('@/lib/content/serverArticles');
    expect(boundary).toContain('@/lib/server/publicVideos');
    expect(boundary).toContain('@/lib/content/publicSitemap');
    expect(boundary).not.toMatch(/@\/lib\/(?:models|storage)\//);
  });

  it('keeps urgent Video publication on the existing Video workflow route', () => {
    expect(
      fs.existsSync(
        path.join(root, 'app/api/admin/videos/[id]/fast-publish/route.ts')
      )
    ).toBe(false);
    expect(read('app/api/admin/videos/[id]/route.ts')).toContain(
      'videoEditorialService.applyWorkflowAction'
    );
    expect(read('lib/server/video/videoEditorialService.ts')).toContain(
      "action === 'fast_publish'"
    );
  });
});
