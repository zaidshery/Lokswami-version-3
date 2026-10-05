import fs from 'fs';
import path from 'path';
import { createElement, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleDetailClient from '@/app/(reader)/main/article/[id]/ArticleDetailClient';
import { renderArticleRichContent } from '@/lib/utils/articleRichContent';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  shareProps: vi.fn(),
  requestArticleTtsAudio: vi.fn(),
  storeState: {
    language: 'hi' as const,
    currentUser: null as null | { savedArticles: string[] },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) =>
    createElement('img', { alt, src }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('@/lib/store/appStore', () => ({
  useAppStore: (selector: (state: typeof mocks.storeState) => unknown) =>
    selector(mocks.storeState),
}));

vi.mock('@/lib/ai/ttsClient', () => ({
  requestArticleTtsAudio: mocks.requestArticleTtsAudio,
  buildTtsAudioSource: () => 'data:audio/mp3;base64,mock',
}));

vi.mock('@/components/ui/ShareMenu', () => ({
  default: (props: { ariaLabel: string; title: string; url: string }) => {
    mocks.shareProps(props);
    return createElement(
      'button',
      {
        type: 'button',
        'aria-label': props.ariaLabel,
        className: 'reader-touch-button inline-flex min-h-11 items-center justify-center',
      },
      'Share'
    );
  },
}));

vi.mock('@/components/article/ArticleRelatedStories', () => ({
  default: () => createElement('aside', { 'data-testid': 'related-stories' }, 'Related'),
}));

describe('Phase 3.16C — Article Reader Mobile Typography & Inline/Rich Content', () => {
  const sampleArticle = {
    id: '507f1f77bcf86cd799439011',
    slug: 'madhya-pradesh-smart-city-expansion',
    title: 'मध्य प्रदेश में स्मार्ट सिटी परियोजना का हुआ विस्तार',
    summary: 'भोपाल और इंदौर के प्रमुख मार्गों पर नई परिवहन और निगरानी प्रणाली लागू की गई।',
    content: '<p>शुरुआती पैराग्राफ...</p>',
    image: '/test-article.jpg',
    category: 'Madhya Pradesh',
    author: { id: 'desk-1', name: 'लोकस्वामी ब्यूरो', avatar: '/avatar.jpg' },
    publishedAt: '2026-08-01T10:00:00.000Z',
    views: 1200,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Rich Content Table Containment (ISSUE-MOB-05)', () => {
    it('wraps wide HTML table in an accessible, swipe-isolated scrollable container', () => {
      const wideTableHtml = `
        <table>
          <thead>
            <tr>
              <th>Col 1</th><th>Col 2</th><th>Col 3</th><th>Col 4</th><th>Col 5</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Val 1</td><td>Val 2</td><td>Val 3</td><td>Val 4</td><td>Val 5</td>
            </tr>
          </tbody>
        </table>
      `.trim();

      const rendered = renderArticleRichContent(wideTableHtml);

      expect(rendered).toContain('class="article-table-wrap"');
      expect(rendered).toContain('data-swipe-ignore="true"');
      expect(rendered).toContain('tabindex="0"');
      expect(rendered).toContain('role="region"');
      expect(rendered).toContain('aria-label="Table"');
      expect(rendered).toContain('<table>');
      expect(rendered).toContain('<th>Col 1</th>');
      expect(rendered).toContain('<td>Val 1</td>');
    });

    it('does not double-wrap an already wrapped table', () => {
      const preWrappedHtml = `
        <div class="article-table-wrap" data-swipe-ignore="true" tabindex="0" role="region" aria-label="Table">
          <table><tr><td>Already wrapped</td></tr></table>
        </div>
      `.trim();

      const rendered = renderArticleRichContent(preWrappedHtml);
      const matches = rendered.match(/article-table-wrap/g);
      expect(matches).toHaveLength(1);
    });

    it('preserves semantic table elements (thead, tbody, tr, th, td)', () => {
      const complexTable = `
        <table>
          <thead>
            <tr><th>Header A</th><th>Header B</th></tr>
          </thead>
          <tbody>
            <tr><td>Cell 1</td><td>Cell 2</td></tr>
          </tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(complexTable);
      expect(rendered).toMatch(/<thead>[\s\S]*?<\/thead>/);
      expect(rendered).toMatch(/<tbody>[\s\S]*?<\/tbody>/);
      expect(rendered).toContain('<th>Header A</th>');
      expect(rendered).toContain('<td>Cell 1</td>');
    });
  });

  describe('2. Preformatted and Code Block Containment', () => {
    it('preserves exact formatting, whitespace, and special characters inside pre/code blocks', () => {
      const codeSnippet = `
        <pre><code>const computeMetrics = (width, height) => {
  const ratio = width / height;
  return { ratio, isContained: true };
};</code></pre>
      `.trim();

      const rendered = renderArticleRichContent(codeSnippet);
      expect(rendered).toContain('<pre><code>const computeMetrics = (width, height) => {');
      expect(rendered).toContain('  const ratio = width / height;');
      expect(rendered).toContain('  return { ratio, isContained: true };');
      expect(rendered).toContain('};</code></pre>');
    });

    it('does not corrupt or prematurely line-break long code strings', () => {
      const longCodeLine = `<pre><code>const LONG_UNBROKEN_TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_SPECIAL_TOKEN";</code></pre>`;
      const rendered = renderArticleRichContent(longCodeLine);
      expect(rendered).toContain(longCodeLine);
    });
  });

  describe('3. Text, URLs, and Typography Containment', () => {
    it('contains long URLs without breaking link usability', () => {
      const rawWithUrl = `<p>Check here: <a href="https://example.com/very/long/unbroken/path/to/resource">https://example.com/very/long/unbroken/path/to/resource</a></p>`;
      const rendered = renderArticleRichContent(rawWithUrl);
      expect(rendered).toContain('href="https://example.com/very/long/unbroken/path/to/resource"');
      expect(rendered).toContain('https://example.com/very/long/unbroken/path/to/resource</a>');
    });

    it('contains long Hindi paragraphs with proper punctuation and script fidelity', () => {
      const hindiParagraph = 'इंदौर और भोपाल के बीच प्रस्तावित नए औद्योगिक गलियारे से रोजगार के हजारों नए अवसर सृजित होंगे। राज्य सरकार ने इस पर त्वरित निर्णय लिया है।';
      const rendered = renderArticleRichContent(`<p>${hindiParagraph}</p>`);
      expect(rendered).toContain(hindiParagraph);
    });

    it('preserves mixed Hindi + English text seamlessly', () => {
      const mixedText = 'इस नए Digital Highway Corridor प्रोजेक्ट के तहत 4-Lane Expressway का काम शुरू हो चुका है।';
      const rendered = renderArticleRichContent(`<p>${mixedText}</p>`);
      expect(rendered).toContain(mixedText);
    });
  });

  describe('4. Inline Media, Embeds, and Figures', () => {
    it('handles inline images and figure captions cleanly', () => {
      const mediaHtml = `
        <figure>
          <img src="/sample-highway.jpg" alt="Expressway Construction" />
          <figcaption>इंदौर-भोपाल एक्सप्रेसवे निर्माण कार्य की ताजा स्थिति।</figcaption>
        </figure>
      `.trim();
      const rendered = renderArticleRichContent(mediaHtml);
      expect(rendered).toContain('<figure>');
      expect(rendered).toContain('<img src="/sample-highway.jpg" alt="Expressway Construction"');
      expect(rendered).toContain('<figcaption>इंदौर-भोपाल एक्सप्रेसवे निर्माण कार्य की ताजा स्थिति।</figcaption>');
    });

    it('converts YouTube shortcodes and links to responsive figure embeds', () => {
      const youtubeShortcode = '[youtube:dQw4w9WgXcQ]';
      const rendered = renderArticleRichContent(youtubeShortcode);
      expect(rendered).toContain('class="article-youtube-embed"');
      expect(rendered).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(rendered).toContain('Watch on YouTube');
    });

    it('converts supported social links to safe aside cards', () => {
      const socialShortcode = '[social:x:https://x.com/LokswamiNews/status/123456]';
      const rendered = renderArticleRichContent(socialShortcode);
      expect(rendered).toContain('class="article-social-embed"');
      expect(rendered).toContain('X / Twitter');
      expect(rendered).toContain('https://x.com/LokswamiNews/status/123456');
    });
  });

  describe('5. Sanitization & Security Verification', () => {
    it('strips dangerous scripts, objects, and event handlers', () => {
      const maliciousHtml = `
        <p>Legitimate text</p>
        <script>alert('pwned')</script>
        <div onclick="evil()">Click me</div>
        <a href="javascript:alert(1)">Bad link</a>
        <iframe src="https://attacker.com/evil"></iframe>
      `.trim();

      const sanitized = renderArticleRichContent(maliciousHtml);
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('https://attacker.com/evil');
      expect(sanitized).toContain('Legitimate text');
    });
  });

  describe('6. Mobile Article Shell, Controls & Safe Spacing', () => {
    it('renders article detail with min-h-11 (44px) mobile action targets', () => {
      render(
        <ArticleDetailClient
          article={sampleArticle}
          relatedArticles={[]}
        />
      );

      // Bookmark button
      const bookmarkBtn = screen.getByRole('button', { name: /सहेजें|Save/i });
      expect(bookmarkBtn).toBeDefined();
      expect(bookmarkBtn.className).toContain('min-h-11');

      // Share button
      const shareBtn = screen.getByRole('button', { name: /शेयर|Share/i });
      expect(shareBtn).toBeDefined();
      expect(shareBtn.className).toContain('min-h-11');

      // E-Paper link
      const epaperLink = screen.getByRole('link', { name: /ई-पेपर|E-Paper/i });
      expect(epaperLink).toBeDefined();
      expect(epaperLink.className).toContain('min-h-11');
    });

    it('applies bottom safe spacing to prevent BottomNav overlap on mobile', () => {
      const { container } = render(
        <ArticleDetailClient
          article={sampleArticle}
          relatedArticles={[]}
        />
      );

      const readerRoot = container.firstElementChild as HTMLElement;
      expect(readerRoot).not.toBeNull();
      // Contains the safe spacing class for mobile bottom navigation
      expect(readerRoot.className).toContain('pb-[calc(var(--reader-bottom-nav-space)+5rem)]');
    });

    it('renders audio player and summary controls with proper accessibility', () => {
      render(
        <ArticleDetailClient
          article={sampleArticle}
          relatedArticles={[]}
        />
      );

      const audioSection = screen.getByRole('region', { name: /लेख सुनें|Listen to article/i });
      expect(audioSection).toBeDefined();

      const listenBtn = screen.getByRole('button', { name: /सुनें|Listen/i });
      expect(listenBtn).toBeDefined();
      expect(listenBtn.className).toContain('min-h-11');

      const summaryBtn = screen.getByRole('button', { name: /सारांश|Summary/i });
      expect(summaryBtn).toBeDefined();
      expect(summaryBtn.className).toContain('min-h-11');
    });
  });

  describe('7. CSS Module Containment Rules Verification', () => {
    it('verifies ArticleReader.module.css contains strict containment rules for rich content', () => {
      const cssFilePath = path.resolve('components/article/ArticleReader.module.css');
      const cssContent = fs.readFileSync(cssFilePath, 'utf8');

      // .body:global(.article-rich-content) has max-width and min-width containment
      expect(cssContent).toMatch(/\.body:global\(\.article-rich-content\)\s*\{[^}]*max-width:\s*100%;/);
      expect(cssContent).toMatch(/\.body:global\(\.article-rich-content\)\s*\{[^}]*min-width:\s*0;/);

      // .article-table-wrap has overflow-x: auto and overscroll-behavior-inline: contain
      expect(cssContent).toMatch(/\.body\s+:global\(\.article-table-wrap\)\s*\{[^}]*overflow-x:\s*auto;/);
      expect(cssContent).toMatch(/\.body\s+:global\(\.article-table-wrap\)\s*\{[^}]*overscroll-behavior-inline:\s*contain;/);

      // pre has overflow-x: auto, white-space: pre, and overscroll-behavior-inline: contain
      expect(cssContent).toMatch(/\.body\s+:global\(pre\)\s*\{[^}]*overflow-x:\s*auto;/);
      expect(cssContent).toMatch(/\.body\s+:global\(pre\)\s*\{[^}]*white-space:\s*pre;/);
      expect(cssContent).toMatch(/\.body\s+:global\(pre\)\s*\{[^}]*overscroll-behavior-inline:\s*contain;/);

      // inline code outside pre has overflow-wrap: anywhere
      expect(cssContent).toMatch(/\.body\s+:global\(:not\(pre\)\s*>\s*code\)\s*\{[^}]*overflow-wrap:\s*anywhere;/);

      // img and figure have max-width: 100%
      expect(cssContent).toMatch(/\.body\s+:global\(img\)\s*\{[^}]*max-width:\s*100%;/);
      expect(cssContent).toMatch(/\.body\s+:global\(figure\)\s*\{[^}]*max-width:\s*100%;/);
    });
  });
});
