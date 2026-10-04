import { expect, test } from '@playwright/test';

// Fixture assets exist in Playwright routes; a production PWA worker cannot fetch them.
test.use({ serviceWorkers: 'block' });

async function openFixture(page, publicationType = 'epaper') {
  await page.route('**/api/**', route => route.request().method() === 'GET'
    ? route.fallback()
    : route.fulfill({ json: { success: true } }));
  const issue = {
    _id: 'reader-ux-fixture', title: 'Lokswami Reader UX', publicationType,
    citySlug: publicationType === 'emagazine' ? 'global' : 'indore', cityName: 'Indore',
    publishDate: '2026-10-01', pageCount: 6, pdfPath: '/reader-fixture.pdf',
    pages: Array.from({ length: 6 }, (_, i) => ({ pageNumber: i + 1, imagePath: `/reader-fixture-${i + 1}.svg`, width: 900, height: 1200 })),
    articles: [1, 2].map(number => ({ _id: `fixture-story${number === 1 ? '' : '-right'}`, epaperId: 'reader-ux-fixture', slug: `fixture-story-${number}`, title: number === 1 ? 'Fixture story' : 'Right page story', pageNumber: number, hotspot: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, excerpt: 'Reader interaction fixture.' })),
  };
  await page.route('**/reader-fixture-*.svg', async (route) => {
    await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="white"/><text x="80" y="100" font-size="48" fill="#dc2626">Lokswami Reader UX</text><path d="M80 160H820M80 190H820M80 220H820" stroke="#ccc" stroke-width="12"/></svg>' });
  });
  await page.route('**/api/epapers/reader-ux-fixture?*', (route) => route.fulfill({ json: { success: true, data: issue } }));
  await page.goto(`/main/${publicationType === 'emagazine' ? 'e-magazine' : 'epaper'}?paper=reader-ux-fixture&page=1`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-reader-canvas]')).toBeVisible();
  await expect(page.getByLabel('Page navigation thumbnails')).toBeVisible();
  await page.getByRole('button', { name: 'Hide pages', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Page 1', exact: true })).toBeVisible();
}

test('phone pages use available canvas space and keep their size when story controls change', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await openFixture(page);
  await page.getByRole('button',{name:'Show pages',exact:true}).click();
  const sizes=[];
  for (const number of [1,3]) {
    await page.getByLabel('Jump to page',{exact:true}).selectOption(String(number));
    const image=page.locator('[data-reader-canvas]').getByRole('img',{name:`Page ${number}`,exact:true});
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(img => {
      const canvas=img.closest('[data-reader-canvas]');
      const style=getComputedStyle(canvas);
      const width=canvas.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-8;
      const height=canvas.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-8;
      return Math.abs(img.getBoundingClientRect().width-Math.min(width,height*img.naturalWidth/img.naturalHeight));
    })).toBeLessThan(2);
    sizes.push(await image.boundingBox());
  }
  expect(Math.abs(sizes[0].width-sizes[1].width)).toBeLessThan(2);
  expect(Math.abs(sizes[0].height-sizes[1].height)).toBeLessThan(2);
});

test('desktop reader turns once, preserves editing, and returns from thumbnails', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openFixture(page);
  await page.getByRole('button', { name: 'Switch to single page view' }).click();
  await page.locator('[data-reader-canvas]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('2');
  await page.getByLabel('Jump to page', { exact: true }).selectOption('4');
  await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('4');
  await expect(page).toHaveTitle(/Page 4$/);
  await page.keyboard.press('ArrowLeft');
  // Native select arrows choose an option; the reader must not turn again.
  await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('3');
  await expect(page.getByRole('img', { name: 'Page 3', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show pages', exact: true }).click();
  await page.getByLabel('Jump to page 4', { exact: true }).click();
  await expect(page.getByLabel('Page navigation thumbnails')).toBeVisible();
  await page.getByRole('button', { name: 'Return to reading' }).click();
  await expect(page.getByLabel('Page navigation thumbnails')).toBeHidden();
  await expect(page.locator('[data-reader-canvas]')).toBeFocused();
  await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('4');
  await page.keyboard.press('Home');
  await expect(page.getByRole('button', { name: 'Read story: Fixture story' })).toBeVisible();
  await page.getByRole('button', { name: 'Read story: Fixture story' }).click();
  await expect(page.getByRole('dialog', { name: 'Fixture story', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('1');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-reader-canvas]')).toBeVisible();
  await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: 'Read story: Fixture story' }).click();
  await expect(page.getByRole('dialog', { name: 'Fixture story', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close story' }).click();
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('desktop-reader.png'), animations: 'disabled' });
});

test('mobile reader reserves page space and supports touch page navigation', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  try {
    await openFixture(page);
    await expect(page.getByRole('button', { name: 'Switch to spread view' })).toBeHidden();
    const image = await page.getByRole('img', { name: 'Page 1', exact: true }).boundingBox();
    const hud = await page.getByTestId('mobile-epaper-zoom-hud').boundingBox();
    expect(image.y + image.height).toBeLessThan(hud.y);
    await page.getByLabel('Next page on mobile').tap();
    await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('2');
    await page.getByLabel('Jump to page', { exact: true }).selectOption('6');
    await expect(page.getByLabel('Next page on mobile')).toBeDisabled();
    await page.getByRole('button', { name: 'Show pages', exact: true }).tap();
    await page.getByRole('button', { name: 'Return to reading' }).tap();
    await expect(page.getByLabel('Page navigation thumbnails')).toBeHidden();
    await page.getByLabel('Jump to page', { exact: true }).selectOption('2');
    await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('2');
    const canvas = page.locator('[data-reader-canvas]');
    await canvas.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 280, clientY: 350 }] });
    await canvas.dispatchEvent('touchmove', { touches: [{ identifier: 1, clientX: 140, clientY: 350 }] });
    await canvas.dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 1, clientX: 130, clientY: 350 }] });
    await expect(page.getByLabel('Jump to page', { exact: true })).toHaveValue('3');
    await page.screenshot({ path: testInfo.outputPath('mobile-reader.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 320, height: 740 });
    const close = await page.getByLabel('Close reader', { exact: true }).boundingBox();
    const share = await page.getByRole('button', { name: 'Share edition', exact: true }).boundingBox();
    expect(close.x).toBeGreaterThanOrEqual(0);
    expect(share.x + share.width).toBeLessThanOrEqual(320);
    await page.getByLabel('Jump to page', {exact:true}).selectOption('1');
    await expect(page.getByLabel('Jump to page', {exact:true})).toHaveValue('1');
    await page.getByRole('button', {name:'Read story: Fixture story'}).tap();
    const preview=page.getByRole('dialog', {name:'Fixture story',exact:true});
    await expect(preview.getByLabel('Released story crop')).toBeVisible();
    await expect(preview.getByAltText('Story crop: Fixture story')).toHaveAttribute('src','/reader-fixture-1.svg');
    await expect(page).not.toHaveURL(/\/main\/article\//);
    await page.getByLabel('Close story',{exact:true}).tap();
  } finally { await context.close(); }
});

test('spine turn retains settled URL, blocks rapid input, supports edges and drag', async ({ page }, testInfo) => {
  await page.setViewportSize({width:1440,height:900});await openFixture(page);
  await page.getByRole('button',{name:'Turn to next page',exact:true}).click();
  const leaf=page.locator('[data-turn-leaf]');await expect(leaf).toBeVisible();
  expect(await leaf.evaluate(el=>getComputedStyle(el).animationDuration)).toBe('0.52s');
  await leaf.evaluate(el=>{const animation=el.getAnimations()[0];animation.pause();animation.currentTime=150;});
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');
  await expect(page.getByRole('button',{name:'Read story: Fixture story'})).toHaveCount(0);
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await page.screenshot({path:testInfo.outputPath('spine-turn-mid.png')});
  await leaf.evaluate(el=>el.getAnimations()[0].play());
  await expect(page.getByLabel('Jump to page',{exact:true})).toHaveValue('3');
  expect(new URL(page.url()).searchParams.get('page')).toBe('3');
  await expect(page.getByRole('img',{name:'Page 3',exact:true})).toBeVisible();
  await expect(page.getByRole('img',{name:'Page 4',exact:true})).toBeVisible();
  const book=page.locator('[data-reader-book]');let box=await book.boundingBox();
  await page.mouse.click(box.x+3,box.y+box.height/2);
  await expect(leaf).toBeVisible();
  expect(await leaf.evaluate(el=>getComputedStyle(el).animationDuration)).toBe('0.52s');
  await expect(page.getByLabel('Jump to page',{exact:true})).toHaveValue('1');
  box=await book.boundingBox();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7);await page.mouse.up();
  await expect(page.getByLabel('Jump to page',{exact:true})).toHaveValue('3');
  await page.getByRole('button',{name:'Enter fullscreen',exact:true}).click();
  await page.locator('[data-reader-canvas]').focus();await page.keyboard.press('ArrowLeft');
  await expect(page.getByLabel('Jump to page',{exact:true})).toHaveValue('1');
  await page.getByRole('button',{name:'Read story: Fixture story'}).click();
  await expect(page.getByRole('dialog',{name:'Fixture story',exact:true}).getByLabel('Released story crop')).toBeVisible();
  await expect(page).not.toHaveURL(/\/main\/article\//);
  await expect(page.getByRole('link',{name:/Read full story|पूरी खबर पढ़ें/})).toHaveAttribute('href',/\/main\/article\/fixture-story\?paper=reader-ux-fixture.*story=fixture-story/);
});

test('monthly magazine shares the reading shell and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFixture(page, 'emagazine');
  await expect(page.getByText('Monthly Issue', { exact: true })).toBeVisible();
  await page.getByLabel('Jump to page', { exact: true }).selectOption('3');
  await expect(page.getByRole('img', { name: 'Page 3', exact: true })).toBeVisible();
  expect(await page.locator('[data-reader-canvas] img').first().evaluate((image) => getComputedStyle(image.parentElement.parentElement).animationName)).toBe('none');
});

test('spread stories use page-local geometry, exact URLs, history, and focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openFixture(page);
  for (const [number, title] of [[1, 'Fixture story'], [2, 'Right page story']]) {
    const trigger = page.getByRole('button', { name: `Read story: ${title}` });
    const image = await page.locator('[data-reader-canvas]').getByRole('img', {name:`Page ${number}`,exact:true}).boundingBox();
    const area = await trigger.boundingBox();
    expect(Math.abs(area.x - image.x - image.width * .1)).toBeLessThan(2);
    expect(Math.abs(area.width - image.width * .3)).toBeLessThan(2);
    await trigger.focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('Close story', {exact:true})).toBeFocused();
    expect(new URL(page.url()).searchParams.get('story')).toBe(number === 1 ? 'fixture-story' : 'fixture-story-right');
    expect(new URL(page.url()).searchParams.get('page')).toBe(String(number));
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('dialog', {name:title,exact:true})).toBeVisible();
    await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
    expect(new URL(page.url()).searchParams.has('story')).toBe(false);
    await page.goBack(); await expect(page.getByRole('dialog', {name:title,exact:true})).toBeVisible();
    await page.goForward(); await expect(page.getByRole('dialog', {name:title,exact:true})).toHaveCount(0);
    // Restore the 1–2 spread after history intentionally resolves page 2.
    await page.getByLabel('Jump to page', {exact:true}).selectOption('1');
  }
  await page.locator('summary').filter({hasText:/Stories on this page|इस पृष्ठ की खबरें/}).click();
  await page.getByRole('button', {name:/Right page story ·/}).click();
  await expect(page.getByRole('dialog', {name:'Right page story',exact:true})).toBeVisible();
});

test('story image reader fits desktop, tablet and mobile with independent zoom and sharing', async ({ browser }, testInfo) => {
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 1000, isMobile: width < 768, serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      await page.addInitScript(() => { window.open = url => { window.__sharedUrl = String(url); return null; }; });
      await openFixture(page);
      await page.getByRole('button', { name: 'Read story: Fixture story' }).click();
      const dialog = page.getByRole('dialog', { name: 'Fixture story', exact: true });
      const box = await dialog.boundingBox(); expect(box.width).toBe(width); expect(box.height).toBe(900);
      const back = await dialog.getByLabel('Close story').boundingBox();
      const whatsapp = await dialog.getByRole('button', { name: 'Share story on WhatsApp', exact: true }).boundingBox();
      const logo = await dialog.locator('[data-logo-element="wordmark"]').boundingBox();
      expect(back.x + back.width).toBeLessThan(logo.x); expect(logo.x + logo.width).toBeLessThan(whatsapp.x);
      if (width < 1000) {
        await expect(dialog.getByLabel('Zoom in story image')).toHaveCount(0);
        await dialog.getByLabel('Show zoom controls', {exact:true}).click();
        await expect(dialog.getByLabel('Hide zoom controls', {exact:true})).toHaveAttribute('aria-expanded','true');
      }
      await dialog.getByLabel('Zoom in story image').click(); await expect(dialog.getByLabel('Story image zoom')).toHaveText('150%');
      await dialog.getByLabel('Fit story image').click();
      const stage = dialog.getByRole('region', { name: 'Released story crop' });
      const stageBox = await stage.boundingBox();
      const zoomButton = await dialog.getByLabel('Zoom in story image').boundingBox();
      expect(zoomButton.y + zoomButton.height).toBeLessThanOrEqual(stageBox.y);
      await expect(dialog.getByLabel('Zoom in story image')).toHaveCount(1);
      if (width < 1000) {
        await stage.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 300 });
        await stage.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', button: 0, clientX: 200, clientY: 300 });
        await stage.dispatchEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 300 });
        await expect(dialog.getByLabel('Story image zoom')).toHaveText('200%');
        await stage.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 300 });
        await stage.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 300 });
        await dialog.getByLabel('Fit story image').click();
        const area = await stage.boundingBox();
        await page.touchscreen.tap(area.x + area.width / 2, area.y + area.height / 2);
        await page.touchscreen.tap(area.x + area.width / 2, area.y + area.height / 2);
        await expect(dialog.getByLabel('Story image zoom')).toHaveText('200%');
      } else {
        await stage.hover(); await page.mouse.wheel(0, -300);
        await expect.poll(async () => parseInt(await dialog.getByLabel('Story image zoom').textContent())).toBeGreaterThan(100);
      }
      await dialog.getByRole('button', { name: 'Share story on WhatsApp', exact: true }).click();
      const shared = await page.evaluate(() => window.__sharedUrl);
      expect(shared).toMatch(/wa\.me|whatsapp/); expect(decodeURIComponent(shared)).toContain('story=fixture-story');
      await dialog.getByRole('button', { name: 'Share story', exact: true }).click();
      await expect(dialog.getByRole('region',{name:'Clipping sharing tools'})).toBeVisible(); await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`story-image-${width}.png`), animations: 'disabled' });
      await dialog.getByLabel('Close story').click();
      await expect(page.getByRole('button', { name: 'Read story: Fixture story' })).toBeFocused();
    } finally { await context.close(); }
  }
});

test('short landscape windows keep pages and thumbnails inside the viewport without runtime errors', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of [[768, 360], [844, 390], [568, 320], [1024, 500]]) {
    await page.setViewportSize({ width, height });
    await openFixture(page);
    await page.getByRole('button', { name: 'Show pages', exact: true }).click();
    const strip = await page.getByLabel('Page navigation thumbnails').boundingBox();
    const canvas = await page.locator('[data-reader-canvas]').boundingBox();
    expect(strip.y + strip.height).toBeLessThanOrEqual(height);
    expect(canvas.height).toBeGreaterThan(100);
    const image = await page.locator('[data-reader-canvas]').getByRole('img', { name: 'Page 1', exact: true }).boundingBox();
    expect(image.y).toBeGreaterThanOrEqual(canvas.y);
    expect(image.y + image.height).toBeLessThanOrEqual(strip.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`landscape-${width}x${height}.png`), animations: 'disabled' });
  }
  expect(errors).toEqual([]);
});

test('one full-screen story reader contains text, full-page context and inline clipping tools', async ({ page }, testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await openFixture(page);
  await page.getByRole('button',{name:'Read story: Fixture story'}).click();
  const reader=page.getByRole('dialog',{name:'Fixture story',exact:true});
  await reader.getByRole('button',{name:/^(Text|टेक्स्ट)$/}).click();
  await expect(reader.getByRole('region',{name:'Released story text'})).toHaveText('Reader interaction fixture.');
  await reader.getByRole('button',{name:/^(Visual|विजुअल)$/}).click();
  await reader.getByRole('button',{name:/^(Full Page|पूरा पृष्ठ)$/}).click();
  await expect(reader.getByRole('region',{name:'Released story page'})).toBeVisible();
  await reader.getByRole('button',{name:/^(Story Crop|खबर क्लिपिंग)$/}).click();
  await reader.getByRole('button',{name:'Share story',exact:true}).click();
  await expect(reader.getByRole('region',{name:'Clipping sharing tools'})).toBeVisible();
  const tools = await reader.getByRole('region',{name:'Clipping sharing tools'}).boundingBox();
  expect(tools.y + tools.height).toBeLessThanOrEqual(844);
  await expect(reader.getByRole('button',{name:'Share image',exact:true})).toBeFocused();
  await expect(reader.getByRole('button',{name:/^(Share link|लिंक शेयर करें)$/})).toHaveCount(0);
  const crop = await reader.getByAltText('Story crop: Fixture story').locator('..').boundingBox();
  const stage = await reader.getByRole('region',{name:'Released story crop'}).boundingBox();
  expect(stage.y + stage.height).toBeLessThanOrEqual(tools.y);
  expect(Math.abs((crop.y + crop.height / 2) - (stage.y + stage.height / 2))).toBeLessThan(2);
  await page.keyboard.press('Shift+Tab');
  await expect(reader.getByRole('link',{name:'Download image'})).toBeFocused();
  await expect(page.locator('[aria-labelledby="story-modal-title"], [aria-labelledby="clipping-modal-title"]')).toHaveCount(0);
  await expect(reader.getByRole('link',{name:'Download image'})).toHaveAttribute('href',/share-image\?publicationType=epaper/);
  await page.keyboard.press('Escape');
  await expect(reader).toBeVisible();
  await expect(reader.getByRole('region',{name:'Clipping sharing tools'})).toHaveCount(0);
  await expect(reader.getByRole('button',{name:'Share story',exact:true})).toBeFocused();
  await page.screenshot({path:testInfo.outputPath('unified-story-reader.png'),animations:'disabled'});
  await page.keyboard.press('Escape'); await expect(reader).toHaveCount(0);
});
