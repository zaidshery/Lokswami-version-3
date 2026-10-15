import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const evidenceRoot = process.env.PHASE317E_EVIDENCE_DIR;
const routes = [
  ['home', '/main'], ['search', '/main/search?q=news'], ['latest', '/main/latest'],
  ['category', 'discover-category'], ['article', 'discover-article'],
  ['videos', '/main/videos'], ['shorts', 'discover-shorts'],
  ['epaper', '/main/epaper'], ['emagazine', '/main/e-magazine'], ['auth', '/signin'],
] as const;

test.use({ viewport: { width: 1440, height: 900 } });

for (const language of ['en', 'hi'] as const) for (const theme of ['light', 'dark'] as const) {
  for (const [name, requestedRoute] of routes) {
    test(`${name} ${language} ${theme}: rendered names, theme and WCAG axe evidence`, async ({ page, context }, testInfo) => {
      test.setTimeout(180_000);
      await context.addInitScript(({ language, theme }) => {
        if (location.hostname !== 'localhost') return;
        localStorage.setItem('lokswami-storage', JSON.stringify({ state: { language, theme, themePreference: theme }, version: 0 }));
      }, { language, theme });
      await context.route('**/*', route => {
        const request = route.request();
        if (request.method() !== 'GET' && request.method() !== 'HEAD') return route.fulfill({ json: { success: true } });
        if (!request.url().startsWith(testInfo.project.use.baseURL as string)) return route.abort();
        return route.continue();
      });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      let path: string = requestedRoute;
      if (path === 'discover-shorts') {
        const feedResponse = await context.request.get('/api/v1/public/shorts?limit=1');
        const feed = await feedResponse.json();
        const slug = feed.items?.[0]?.slug;
        if (!slug) {
          saveUnavailable();
          test.skip(true, 'DATA-DEPENDENT: public Shorts feed contains no published story');
          return;
        }
        path = `/main/shorts/${encodeURIComponent(slug)}`;
      } else if (path.startsWith('discover-')) {
        await page.goto('/main', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        const prefix = name === 'article' ? '/main/article/' : '/main/category/';
        const candidate = page.locator(`a[href^="${prefix}"]`).first();
        if (name === 'article' && !await candidate.count()) {
          await page.goto('/main/search?q=news', { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);
        }
        if (await candidate.count()) path = (await candidate.getAttribute('href'))!;
        else {
          const unavailable = { name, language, theme, requestedRoute, scanExecuted: false, classification: 'DATA-DEPENDENT', reason: 'No existing public route link is available' };
          if (evidenceRoot) { mkdirSync(evidenceRoot, { recursive: true }); writeFileSync(join(evidenceRoot, `${name}-${language}-${theme}.json`), JSON.stringify(unavailable, null, 2)); }
          testInfo.annotations.push({ type: 'DATA-DEPENDENT', description: unavailable.reason });
          test.skip(true, `DATA-DEPENDENT: ${unavailable.reason}`);
          return;
        }
      }
      function saveUnavailable() {
        if (evidenceRoot) { mkdirSync(evidenceRoot, { recursive: true }); writeFileSync(join(evidenceRoot, `${name}-${language}-${theme}.json`), JSON.stringify({ name, language, theme, requestedRoute, scanExecuted: false, classification: 'DATA-DEPENDENT', reason: 'No published Shorts story' }, null, 2)); }
      }
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      // NewsCard staggered entrance animations affect composited contrast.
      // Scan settled rendered cards, without disabling animations or axe rules.
      await page.waitForTimeout(3000);
      await page.waitForFunction(() => [...document.querySelectorAll('[data-reader-card]')].every(node => Number(getComputedStyle(node).opacity) === 1), { timeout: 10000 });
      const status = response?.status() ?? null;
      const dom = await page.evaluate(() => ({ language: document.documentElement.lang, theme: document.documentElement.dataset.theme, dark: document.documentElement.classList.contains('dark'), overflow: document.documentElement.scrollWidth > innerWidth, frames: [...document.querySelectorAll('iframe')].map(node => ({ src: node.src, title: node.title, name: node.getAttribute('aria-label') })), statuses: [...document.querySelectorAll('[role="status"],[aria-live]')].map(node => ({ role: node.getAttribute('role'), live: node.getAttribute('aria-live'), text: node.textContent?.slice(0, 200) })) }));
      const results = status && status < 400 ? await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze() : null;
      const record = { name, requestedRoute, route: path, effectiveURL: page.url(), status, language, theme, scanExecuted: Boolean(results), dom, errors, violations: results?.violations ?? [], incomplete: results?.incomplete ?? [], externalResourcesBlocked: true };
      const json = JSON.stringify(record, null, 2);
      await testInfo.attach('axe-and-dom-evidence', { body: json, contentType: 'application/json' });
      if (evidenceRoot) { mkdirSync(evidenceRoot, { recursive: true }); writeFileSync(join(evidenceRoot, `${name}-${language}-${theme}.json`), json); }
      if (name === 'article' && status === 404) {
        const reason = 'DATA-DEPENDENT: discovered public article link has no authoritative local published detail; HTTP 404, no axe scan';
        testInfo.annotations.push({ type: 'DATA-DEPENDENT', description: reason });
        test.skip(true, reason);
        return;
      }
      expect(status, `Unavailable route ${path}; not an accessibility PASS`).not.toBeNull();
      expect(status!).toBeLessThan(400);
      expect(dom.language).toBe(language);
      expect(dom.dark).toBe(theme === 'dark');
      expect(errors).toEqual([]);
      for (const frame of dom.frames) expect(frame.title || frame.name, frame.src).toBeTruthy();
      expect(results!.violations.map(violation => ({ rule: violation.id, impact: violation.impact, targets: violation.nodes.map(node => node.target) }))).toEqual([]);
    });
  }
}
