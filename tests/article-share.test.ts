import { describe, expect, it } from 'vitest';
import {
  buildArticleSharePath,
  buildArticleWhatsAppShareText,
  buildEpaperIssueShareText,
  buildEpaperSharePath,
  buildEpaperStoryShareText,
} from '@/lib/utils/articleShare';

describe('article and e-paper share helpers', () => {
  it('builds article share text with source, category, summary, and CTA', () => {
    const text = buildArticleWhatsAppShareText({
      title: 'Indore civic update reaches readers',
      summary: 'Officials shared the latest traffic and public service details.',
      category: 'Regional',
      articleUrl: 'https://lokswami.com/main/article/indore-civic-update',
    });

    expect(text.split('\n')).toEqual([
      'Lokswami | Regional',
      'Indore civic update reaches readers',
      'Officials shared the latest traffic and public service details.',
      'Read full story: https://lokswami.com/main/article/indore-civic-update',
    ]);
  });

  it('shares canonical article and exact publication paths', () => {
    expect(buildArticleSharePath({ id: 'article-1', slug: 'clean-story-slug' })).toBe(
      '/main/article/clean-story-slug'
    );
    expect(
      buildEpaperSharePath({
        paperId: 'epaper-1',
        page: 6,
        story: 'front-page-story',
      })
    ).toBe('/main/epaper?paper=epaper-1&page=6&story=front-page-story');
  });

  it('builds e-paper issue and story share text with clear CTAs', () => {
    const issueText = buildEpaperIssueShareText({
      title: 'Lokswami - Indore Edition',
      cityLabel: 'Indore',
      dateLabel: '22/05/26',
      issueUrl: 'https://lokswami.com/e/epaper-1?p=1',
    });
    const storyText = buildEpaperStoryShareText({
      title: 'Mapped story headline',
      paperTitle: 'Lokswami - Indore Edition',
      excerpt: 'A short readable excerpt from the e-paper story.',
      page: 3,
      storyUrl: 'https://lokswami.com/e/epaper-1?p=3&s=story-1',
    });

    expect(issueText).toContain('Open e-paper: https://lokswami.com/e/epaper-1?p=1');
    expect(storyText).toContain('Lokswami - Indore Edition | Page 3');
    expect(storyText).toContain('Read in e-paper: https://lokswami.com/e/epaper-1?p=3&s=story-1');
  });

  it('can build native share text without duplicating the URL payload', () => {
    const issueText = buildEpaperIssueShareText({
      title: 'Lokswami - Indore Edition',
      cityLabel: 'Indore',
      dateLabel: '22/05/26',
      issueUrl: 'https://lokswami.com/e/epaper-1?p=1',
      includeUrl: false,
    });
    const storyText = buildEpaperStoryShareText({
      title: 'Mapped story headline',
      paperTitle: 'Lokswami - Indore Edition',
      page: 3,
      storyUrl: 'https://lokswami.com/e/epaper-1?p=3&s=story-1',
      includeUrl: false,
    });

    expect(issueText).not.toContain('https://lokswami.com/e/epaper-1?p=1');
    expect(storyText).not.toContain('https://lokswami.com/e/epaper-1?p=3&s=story-1');
  });
});
