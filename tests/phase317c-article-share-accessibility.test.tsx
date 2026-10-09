import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'fs';
import path from 'path';

import {
  renderArticleRichContent,
  type ArticleRichContentOptions,
} from '@/lib/utils/articleRichContent';
import ShareMenu from '@/components/ui/ShareMenu';

const mocks = vi.hoisted(() => ({
  trackClientEvent: vi.fn(),
}));

vi.mock('@/lib/analytics/trackClient', () => ({
  trackClientEvent: mocks.trackClientEvent,
}));

describe('Phase 3.17C — Article Rich-Content Accessibility & Share Menu Keyboard Completion', () => {
  describe('ISSUE-A11Y-12: Article Table Accessibility & Captions', () => {
    it('1. English no-caption table receives aria-label="Table"', () => {
      const html = '<table><tbody><tr><td>Data 1</td><td>Data 2</td></tr></tbody></table>';
      const rendered = renderArticleRichContent(html, { language: 'en' });
      expect(rendered).toContain('class="article-table-wrap"');
      expect(rendered).toContain('aria-label="Table"');
    });

    it('2. Hindi no-caption table receives aria-label="सारणी"', () => {
      const html = '<table><tbody><tr><td>पहला स्तंभ</td><td>दूसरा स्तंभ</td></tr></tbody></table>';
      const rendered = renderArticleRichContent(html, { language: 'hi' });
      expect(rendered).toContain('class="article-table-wrap"');
      expect(rendered).toContain('aria-label="सारणी"');
    });

    it('3. English table with caption derives scroll-region name from caption', () => {
      const html = `
        <table>
          <caption>Quarterly Financial Results 2026</caption>
          <tbody><tr><td>Revenue</td><td>$10M</td></tr></tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(html, { language: 'en' });
      expect(rendered).toContain('aria-label="Quarterly Financial Results 2026"');
    });

    it('4. Hindi table with caption derives scroll-region name from caption', () => {
      const html = `
        <table>
          <caption>मध्य प्रदेश चुनाव परिणाम 2026</caption>
          <tbody><tr><td>दल</td><td>सीटें</td></tr></tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(html, { language: 'hi' });
      expect(rendered).toContain('aria-label="मध्य प्रदेश चुनाव परिणाम 2026"');
    });

    it('5. preserves <caption> element inside the table unaltered', () => {
      const html = `
        <table>
          <caption class="text-bold">Election Details</caption>
          <tbody><tr><td>Party</td><td>Seats</td></tr></tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(html, { language: 'en' });
      expect(rendered).toMatch(/<caption\b[^>]*class="text-bold"[^>]*>Election Details<\/caption>/);
    });

    it('6. multiple tables receive independent accessible names', () => {
      const html = `
        <table>
          <caption>लोकसभा परिणाम</caption>
          <tbody><tr><td>1</td></tr></tbody>
        </table>
        <p>मध्यवर्ती विश्लेषण</p>
        <table>
          <caption>राज्यवार मतदान</caption>
          <tbody><tr><td>2</td></tr></tbody>
        </table>
        <table>
          <tbody><tr><td>बिना शीर्षक सारणी</td></tr></tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(html, { language: 'hi' });
      expect(rendered).toContain('aria-label="लोकसभा परिणाम"');
      expect(rendered).toContain('aria-label="राज्यवार मतदान"');
      expect(rendered).toContain('aria-label="सारणी"');
    });

    it('7. converts nested inline markup in caption into clean plain-text accessible name', () => {
      const html = `
        <table>
          <caption><strong>Annual Report</strong>: <em>Fiscal Year</em> 2025-26 &amp; Projection</caption>
          <tbody><tr><td>1</td></tr></tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(html, { language: 'en' });
      expect(rendered).toContain('aria-label="Annual Report : Fiscal Year 2025-26 &amp; Projection"');
    });

    it('8. safely escapes quotes in caption to prevent attribute breakout', () => {
      const html = `
        <table>
          <caption>Table with "quoted" title & 'apostrophe'</caption>
          <tbody><tr><td>1</td></tr></tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(html, { language: 'en' });
      expect(rendered).toContain('aria-label="Table with &quot;quoted&quot; title &amp; &#39;apostrophe&#39;"');
      expect(rendered).not.toContain('aria-label="Table with "quoted"');
    });

    it('9. malicious caption cannot inject attributes or event handlers', () => {
      const malicious = `
        <table>
          <caption>Results " onclick="alert(1)" data-hack="true" title="test"</caption>
          <tbody><tr><td>1</td></tr></tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(malicious, { language: 'en' });
      // Event handler is completely stripped by sanitizer
      expect(rendered).not.toContain('onclick');
      expect(rendered).not.toContain('alert(1)');
      // Quotes are escaped to &quot;, preventing wrapper attribute breakout
      expect(rendered).not.toContain('aria-label="Results "');
      expect(rendered).toContain('aria-label="Results &quot; data-hack=&quot;true&quot; title=&quot;test&quot;"');
    });

    it('10. sanitizer remains authoritative before table processing', () => {
      const malicious = `
        <script>alert("pwned")</script>
        <table>
          <caption>Safe Caption</caption>
          <tbody><tr><td><script>alert(2)</script>Clean Cell</td></tr></tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(malicious);
      expect(rendered).not.toContain('<script>');
      expect(rendered).not.toContain('alert');
      expect(rendered).toContain('Clean Cell');
      expect(rendered).toContain('aria-label="Safe Caption"');
    });

    it('11. sanitizes javascript: and data: URLs in table content', () => {
      const malicious = `
        <table>
          <caption>Links Table</caption>
          <tbody>
            <tr>
              <td><a href="javascript:alert(1)">Click me</a></td>
              <td><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Data link</a></td>
            </tr>
          </tbody>
        </table>
      `;
      const rendered = renderArticleRichContent(malicious);
      expect(rendered).not.toContain('href="javascript:');
      expect(rendered).not.toContain('href="data:');
      expect(rendered).toContain('href="#"');
    });

    it('12. does not double-wrap an already wrapped table', () => {
      const preWrapped = `
        <div class="article-table-wrap" data-swipe-ignore="true" tabindex="0" role="region" aria-label="Existing Table">
          <table><tbody><tr><td>Already Wrapped</td></tr></tbody></table>
        </div>
      `;
      const rendered = renderArticleRichContent(preWrapped);
      const matches = rendered.match(/article-table-wrap/g);
      expect(matches).toHaveLength(1);
      expect(rendered).toContain('aria-label="Existing Table"');
    });

    it('13-15. wrapper maintains tabindex="0", role="region", and data-swipe-ignore="true"', () => {
      const html = '<table><tbody><tr><td>Row</td></tr></tbody></table>';
      const rendered = renderArticleRichContent(html);
      expect(rendered).toContain('tabindex="0"');
      expect(rendered).toContain('role="region"');
      expect(rendered).toContain('data-swipe-ignore="true"');
    });

    it('16. ArticleDetailClient passes articleContentLanguage into renderArticleRichContent', () => {
      const articleDetailSource = fs.readFileSync(
        path.resolve(process.cwd(), 'app/(reader)/main/article/[id]/ArticleDetailClient.tsx'),
        'utf-8'
      );
      expect(articleDetailSource).toContain('renderArticleRichContent(raw, { language: articleContentLanguage })');
      expect(articleDetailSource).toContain('renderArticleRichContent(article.summary, { language: articleContentLanguage })');
    });

    it('17. English article content under Hindi context uses English fallback "Table"', () => {
      const englishContent = '<table><tbody><tr><td>Col 1</td><td>Col 2</td></tr></tbody></table>';
      const rendered = renderArticleRichContent(englishContent, { language: 'en' });
      expect(rendered).toContain('aria-label="Table"');
    });

    it('18. Hindi article content under English context uses Hindi fallback "सारणी"', () => {
      const hindiContent = '<table><tbody><tr><td>कॉलम १</td><td>कॉलम २</td></tr></tbody></table>';
      const rendered = renderArticleRichContent(hindiContent, { language: 'hi' });
      expect(rendered).toContain('aria-label="सारणी"');
    });
  });

  describe('ISSUE-A11Y-13: ShareMenu Keyboard Behavior & Focus Flow', () => {
    const nativeShare = vi.fn();
    const writeText = vi.fn();
    const openWindow = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      nativeShare.mockResolvedValue(undefined);
      writeText.mockResolvedValue(undefined);

      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: nativeShare,
      });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
      vi.stubGlobal('open', openWindow);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function renderShareMenuWithNeighbors() {
      return render(
        <div>
          <button type="button" id="before-btn">
            Before Action
          </button>
          <ShareMenu
            title="Lokswami News Story"
            url="https://lokswami.com/main/article/news-1"
            contentType="article"
            contentId="article-1"
            ariaLabel="Share story"
          />
          <button type="button" id="after-btn">
            After Action
          </button>
        </div>
      );
    }

    it('19. trigger exposes aria-haspopup="menu" and aria-expanded state', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('20. opening menu focuses the first menuitem', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      fireEvent.click(trigger);

      const menu = await screen.findByRole('menu');
      expect(menu).toBeInTheDocument();

      await waitFor(() => {
        const items = screen.getAllByRole('menuitem');
        expect(document.activeElement).toBe(items[0]);
      });
    });

    it('21-24. ArrowDown, ArrowUp, Home, and End navigate menu items', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      fireEvent.click(trigger);

      await screen.findByRole('menu');
      const items = screen.getAllByRole('menuitem');
      expect(items.length).toBeGreaterThanOrEqual(4);

      items[0].focus();
      expect(document.activeElement).toBe(items[0]);

      // ArrowDown -> next item
      fireEvent.keyDown(items[0], { key: 'ArrowDown' });
      expect(document.activeElement).toBe(items[1]);

      // ArrowUp -> previous item
      fireEvent.keyDown(items[1], { key: 'ArrowUp' });
      expect(document.activeElement).toBe(items[0]);

      // End -> last item
      fireEvent.keyDown(items[0], { key: 'End' });
      expect(document.activeElement).toBe(items[items.length - 1]);

      // Home -> first item
      fireEvent.keyDown(items[items.length - 1], { key: 'Home' });
      expect(document.activeElement).toBe(items[0]);
    });

    it('25. Escape closes menu and restores focus to trigger', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      fireEvent.click(trigger);

      const menu = await screen.findByRole('menu');
      expect(menu).toBeInTheDocument();

      fireEvent.keyDown(menu, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(trigger);
      });
    });

    it('26-27. Tab closes menu and moves focus to next logical focusable control', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      const afterBtn = screen.getByRole('button', { name: 'After Action' });

      fireEvent.click(trigger);
      const menu = await screen.findByRole('menu');
      expect(menu).toBeInTheDocument();

      const firstItem = screen.getAllByRole('menuitem')[0];
      firstItem.focus();

      // Press Tab while focused in the menu
      fireEvent.keyDown(menu, { key: 'Tab' });

      // Menu closes
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      // Focus moves forward to afterBtn
      expect(document.activeElement).toBe(afterBtn);
    });

    it('28-29. Shift+Tab closes menu and moves focus to previous logical focusable control', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      const beforeBtn = screen.getByRole('button', { name: 'Before Action' });

      fireEvent.click(trigger);
      const menu = await screen.findByRole('menu');
      expect(menu).toBeInTheDocument();

      const firstItem = screen.getAllByRole('menuitem')[0];
      firstItem.focus();

      // Press Shift+Tab while focused in the menu
      fireEvent.keyDown(menu, { key: 'Tab', shiftKey: true });

      // Menu closes
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      // Focus moves backward to beforeBtn
      expect(document.activeElement).toBe(beforeBtn);
    });

    it('30. ShareMenu is NOT a modal dialog (no role="dialog", no aria-modal="true")', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      fireEvent.click(trigger);

      const menu = await screen.findByRole('menu');
      expect(menu).toBeInTheDocument();
      expect(menu).not.toHaveAttribute('role', 'dialog');
      expect(menu).not.toHaveAttribute('aria-modal');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('31. Tab does not trap focus inside the menu', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      fireEvent.click(trigger);

      const menu = await screen.findByRole('menu');
      const items = screen.getAllByRole('menuitem');

      // Tabbing from last item exits to afterBtn rather than cycling to first item
      items[items.length - 1].focus();
      fireEvent.keyDown(menu, { key: 'Tab' });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(document.activeElement?.id).toBe('after-btn');
    });

    it('32. background never remains covered by an open menu after focus leaves', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      fireEvent.click(trigger);

      const menu = await screen.findByRole('menu');
      expect(menu).toBeInTheDocument();

      // Exit menu via Tab
      fireEvent.keyDown(menu, { key: 'Tab' });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('33. Copy action functions and updates status feedback', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      fireEvent.click(trigger);

      const copyItem = await screen.findByRole('menuitem', { name: 'Copy link' });
      fireEvent.click(copyItem);

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('https://lokswami.com/main/article/news-1');
        expect(screen.getByRole('menuitem', { name: 'Link copied' })).toBeInTheDocument();
      });
    });

    it('34. external share callback window.open works properly', async () => {
      renderShareMenuWithNeighbors();
      const trigger = screen.getByRole('button', { name: 'Share story' });
      fireEvent.click(trigger);

      const whatsappItem = await screen.findByRole('menuitem', { name: 'WhatsApp' });
      fireEvent.click(whatsappItem);

      expect(openWindow).toHaveBeenCalledTimes(1);
      expect(openWindow.mock.calls[0][0]).toContain('https://wa.me/?text=');
    });

    it('35. share analytics callback contract remains intact', async () => {
      const onShareEvent = vi.fn();
      render(
        <ShareMenu
          title="Analytics Story"
          url="https://lokswami.com/main/article/analytics-1"
          contentType="article"
          contentId="story-99"
          onShareEvent={onShareEvent}
        />
      );

      const trigger = screen.getByRole('button');
      fireEvent.click(trigger);

      const xItem = await screen.findByRole('menuitem', { name: 'X' });
      fireEvent.click(xItem);

      expect(onShareEvent).toHaveBeenCalledWith('share_click', 'x');
    });

    it('36. directWhatsApp mode bypasses menu and triggers direct share', () => {
      render(
        <ShareMenu
          title="Direct Story"
          url="https://lokswami.com/main/article/direct-1"
          contentType="article"
          directWhatsApp
          ariaLabel="Direct WhatsApp Share"
        />
      );

      const button = screen.getByRole('button', { name: 'Direct WhatsApp Share' });
      expect(button).not.toHaveAttribute('aria-haspopup');
      expect(button).not.toHaveAttribute('aria-expanded');

      fireEvent.click(button);
      expect(openWindow).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});
