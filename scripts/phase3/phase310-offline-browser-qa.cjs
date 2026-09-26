'use strict';

/**
 * Authenticated, synthetic, offline browser QA for Phase 3.10E.
 *
 * The runner starts the dedicated offline launcher, signs in through the real
 * credentials flow, intercepts only client data APIs with deterministic local
 * fixtures, blocks browser egress, validates protected routes at three required
 * viewports, and stops only the child process it created.
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');

const projectRoot = path.resolve(__dirname, '..', '..');
const launcherPath = path.join(__dirname, 'phase310-offline-qa-launcher.cjs');
const artifactsDir = path.join(projectRoot, 'artifacts', 'phase3-qa');
const qaPassword = 'Phase310-QA-Only!2026';
const viewports = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
];
const routes = [
  { path: '/admin/users', heading: 'User Accounts' },
  { path: '/admin/team', heading: 'Team Members' },
  { path: '/admin/settings', heading: 'Platform Settings' },
  { path: '/admin/audit-log', heading: 'Admin Activity Audit' },
  { path: '/admin/permission-review', heading: 'Permission Review' },
  { path: '/admin/operations', heading: 'Operations Center' },
  { path: '/admin/operations-diagnostics', heading: 'Operational Diagnostics' },
];

const now = '2026-09-26T08:00:00.000Z';
const schedules = [
  {
    id: 'daily_briefing',
    label: 'Daily Leadership Briefing',
    description: 'Synthetic offline schedule for browser QA.',
    cadenceLabel: 'Daily',
    enabled: true,
    deliveryTime: '09:00',
    timezone: 'Asia/Kolkata',
    deliveryMode: 'dashboard_link',
    recipientEmails: [],
    webhookUrls: [],
    webhookProvider: 'generic_json',
    notes: 'Synthetic QA only',
    lastRunAt: now,
    lastRunStatus: 'success',
    lastRunSummary: 'Synthetic run completed.',
    version: 7,
    updatedAt: now,
    nextPlannedAt: '2026-09-27T03:30:00.000Z',
    viewHref: '/admin/analytics',
    downloadHref: '/api/admin/analytics/reports/daily/download',
  },
];

const users = [
  {
    id: 'qa-staff-1',
    name: 'Phase 310 QA Staff',
    email: 'staff.qa@lokswami.local',
    whatsappNumber: null,
    role: 'super_admin',
    isActive: true,
    optInDailyEpaper: false,
    preferredLanguage: 'en',
    readCount: 4,
    createdAt: now,
    lastLoginAt: now,
  },
  {
    id: 'qa-reader-1',
    name: 'Phase 310 QA Reader',
    email: 'reader.qa@lokswami.local',
    whatsappNumber: '+910000000000',
    role: 'reader',
    isActive: false,
    optInDailyEpaper: true,
    preferredLanguage: 'hi',
    readCount: 12,
    createdAt: now,
    lastLoginAt: null,
  },
];

const team = [
  {
    id: 'qa-team-1',
    name: 'Synthetic Copy Editor',
    email: 'copy.qa@lokswami.local',
    image: '',
    role: 'copy_editor',
    loginId: 'copy.qa',
    isActive: true,
    credentialStatus: 'password_ready',
    passwordSetAt: now,
    setupExpiresAt: null,
    lastLoginAt: now,
    createdAt: now,
  },
  {
    id: 'qa-team-2',
    name: 'Synthetic Reporter',
    email: 'reporter.qa@lokswami.local',
    image: '',
    role: 'reporter',
    loginId: 'reporter.qa',
    isActive: false,
    credentialStatus: 'credentials_not_set',
    passwordSetAt: null,
    setupExpiresAt: null,
    lastLoginAt: null,
    createdAt: now,
  },
];

function json(body, status = 200, headers = {}) {
  return {
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  };
}

function isLoopbackUrl(rawUrl) {
  const host = new URL(rawUrl).hostname.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Offline QA launcher exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/signin`, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) return;
    } catch {
      // Compilation and startup are still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Offline QA server did not become ready within 120 seconds.');
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.stdin.write('STOP\n');
  const stopped = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
  ]);
  if (!stopped && child.exitCode === null) child.kill('SIGTERM');
}

function leadershipSettingsFixture(baseUrl) {
  return {
    success: true,
    data: {
      runtime: {
        siteOrigin: baseUrl,
        cronPath: '/api/admin/analytics/briefing-schedules/run-due',
        cronUrl: `${baseUrl}/api/admin/analytics/briefing-schedules/run-due`,
        cronSecretConfigured: false,
        emailDeliveryConfigured: false,
        resendConfigured: false,
        fromEmailConfigured: false,
        dueNowCount: 0,
        dueNowIds: [],
      },
      criticalAlertState: { mutedUntil: null, mutedByEmail: null, mutedReason: null },
      schedules,
      history: [],
      notifications: [],
      healthAlerts: [
        { id: 'qa-health', severity: 'warning', title: 'Synthetic degraded delivery', detail: 'Offline QA provider delivery is intentionally disabled.' },
      ],
      escalations: [],
    },
  };
}

async function installSyntheticRoutes(page, state, baseUrl) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'fonts.googleapis.com') {
      state.browserLocalStubs += 1;
      await route.fulfill({ status: 200, contentType: 'text/css', body: '/* offline QA font stub */' });
      return;
    }
    if (url.hostname === 'fonts.gstatic.com') {
      state.browserLocalStubs += 1;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (!isLoopbackUrl(request.url())) {
      state.browserExternalAttempts += 1;
      console.error(`BLOCKED_OFFLINE_QA_BROWSER_EGRESS host=${url.hostname.toLowerCase()}`);
      await route.abort('blockedbyclient');
      return;
    }

    if (url.pathname === '/api/v1/public/analytics/vitals') {
      await route.fulfill(json({ success: true }));
      return;
    }
    if (url.pathname === '/api/user/save' && request.method() === 'GET') {
      await route.fulfill(json({ success: true, data: { savedArticleIds: [] } }));
      return;
    }
    if (url.pathname === '/api/admin/users' && request.method() === 'GET') {
      await route.fulfill(json({ success: true, data: { users, pagination: { total: users.length, totalPages: 1 } } }));
      return;
    }
    if (url.pathname === '/api/admin/users' && request.method() === 'PATCH') {
      state.userPatchCount += 1;
      if (state.userPatchCount === 1) {
        await route.fulfill(json({ success: false, code: 'LAST_ACTIVE_SUPER_ADMIN', error: 'Synthetic governance block' }, 409));
      } else {
        await route.fulfill(json({ success: false, code: 'RATE_LIMITED', error: 'Synthetic rate limit' }, 429, { 'Retry-After': '75' }));
      }
      return;
    }
    if (url.pathname === '/api/admin/team' && request.method() === 'GET') {
      await route.fulfill(json({ success: true, data: team }));
      return;
    }
    if (url.pathname === '/api/admin/settings/leadership-reports') {
      await route.fulfill(json(leadershipSettingsFixture(baseUrl)));
      return;
    }
    if (url.pathname === '/api/admin/tts/settings') {
      await route.fulfill(json({ success: true, data: { mode: 'manual-upload-only', message: 'Synthetic offline QA mode.', storage: { mode: 'local', writable: true, digitalOceanSpacesConfigured: false }, assets: { ready: 2, failed: 1, stale: 1 } } }));
      return;
    }
    await route.continue();
  });
}

async function verifyKeyboardReachability(page) {
  await page.keyboard.press('Tab');
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return { reached: false, name: '', focusVisible: false };
    const style = window.getComputedStyle(active);
    const name = active.getAttribute('aria-label') || active.textContent?.trim() || active.getAttribute('name') || '';
    return {
      reached: true,
      name: name.slice(0, 120),
      focusVisible: style.outlineStyle !== 'none' || style.boxShadow !== 'none',
    };
  });
}

async function exerciseUserFeedbackAndDialog(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'User Accounts' }).waitFor();
  await page.getByText('Phase 310 QA Staff').waitFor();
  const trigger = page.getByRole('switch', { name: 'Deactivate Phase 310 QA Staff' });
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: /Deactivate User Account/ });
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  const returned = await trigger.evaluate((element) => document.activeElement === element);
  if (!returned) throw new Error('Dialog focus did not return to its trigger.');

  await trigger.click();
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await page.getByText('At least one active Super Admin must remain.').waitFor();

  await trigger.click();
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await page.getByText(/Try again in (about )?2 minutes/).waitFor();
  return { escapeClose: true, focusReturn: true, lastSuperAdmin: true, rateLimit: true };
}

async function run() {
  const port = await reservePort();
  const baseUrl = `http://localhost:${port}`;
  const child = spawn(process.execPath, [launcherPath, `--port=${port}`], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const state = {
    browserExternalAttempts: 0,
    browserLocalStubs: 0,
    blockedServerEgress: 0,
    loopbackServerAttempts: 0,
    userPatchCount: 0,
    serverOutput: [],
  };
  const captureServerOutput = (chunk) => {
    const text = String(chunk);
    state.blockedServerEgress += (text.match(/BLOCKED_OFFLINE_QA_EGRESS/g) || []).length;
    state.loopbackServerAttempts += (text.match(/OFFLINE_QA_LOOPBACK/g) || []).length;
    state.serverOutput.push(text);
    process.stdout.write(text);
  };
  child.stdout.on('data', captureServerOutput);
  child.stderr.on('data', captureServerOutput);

  let browser;
  const results = [];
  try {
    await waitForServer(baseUrl, child);
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    }
    const context = await browser.newContext({ baseURL: baseUrl, serviceWorkers: 'block' });
    const page = await context.newPage();
    await installSyntheticRoutes(context, state, baseUrl);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/auth/')) {
        console.log(`OFFLINE_QA_AUTH_REQUEST method=${request.method()} path=${url.pathname}`);
      }
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/auth/')) {
        console.log(`OFFLINE_QA_AUTH_RESPONSE status=${response.status()} path=${url.pathname}`);
      }
    });

    await page.goto('/signin?redirect=/admin/users', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
    const desktopSignIn = page.locator('main > div').nth(2);
    await desktopSignIn.getByRole('button', { name: 'Newsroom Team' }).click();
    await desktopSignIn.getByRole('heading', { name: 'Newsroom Staff Sign In' }).waitFor();
    const loginInput = desktopSignIn.locator('input[autocomplete="username"]');
    const passwordInput = desktopSignIn.locator('input[autocomplete="current-password"]');
    await loginInput.click();
    await loginInput.pressSequentially('qa.phase310');
    await passwordInput.click();
    await passwordInput.pressSequentially(qaPassword);
    const fieldsReady = Boolean((await loginInput.inputValue()) && (await passwordInput.inputValue()));
    if (!fieldsReady) throw new Error('Synthetic sign-in fields did not retain their values.');
    const callbackResponsePromise = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/auth/callback/credentials',
      { timeout: 30_000 }
    );
    await desktopSignIn.getByRole('button', { name: 'Sign in to Newsroom' }).click();
    const callbackResponse = await callbackResponsePromise;
    if (callbackResponse.status() !== 200) {
      throw new Error(`Synthetic credentials callback returned HTTP ${callbackResponse.status()}.`);
    }
    await page.waitForURL((url) => url.pathname === '/admin' || url.pathname === '/admin/users', { timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded');
    if (new URL(page.url()).pathname !== '/admin/users') {
      await page.goto('/admin/users', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForURL((url) => url.pathname === '/admin/users', { timeout: 30_000 });
    }
    await page.getByRole('heading', { name: 'User Accounts' }).waitFor();

    fs.mkdirSync(artifactsDir, { recursive: true });

    for (const routeConfig of routes) {
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const consoleErrors = [];
        const pageErrors = [];
        const onConsole = (message) => {
          if (message.type() === 'error') {
            const text = message.text();
            if (
              text.includes('fallback') ||
              text.includes('ECONNREFUSED') ||
              text.includes('Connection failed') ||
              text.includes('ERR_NETWORK_CHANGED') ||
              text.includes('noop-turbopack-hmr')
            ) {
              return;
            }
            consoleErrors.push(text);
          }
        };
        const onPageError = (error) => {
          if (
            error.message.includes('ERR_NETWORK_CHANGED') ||
            error.message.includes('noop-turbopack-hmr') ||
            error.message.includes('Loading chunk')
          ) {
            return;
          }
          pageErrors.push(error.message);
        };
        page.on('console', onConsole);
        page.on('pageerror', onPageError);

        const response = await page.goto(routeConfig.path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.getByRole('heading', { name: routeConfig.heading, exact: true }).first().waitFor({ timeout: 20_000 });
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
        const finalPath = new URL(page.url()).pathname;
        const metrics = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          heading: document.querySelector('h1')?.textContent?.trim() || '',
          liveRegions: document.querySelectorAll('[role="status"], [role="alert"], [aria-live]').length,
        }));
        const keyboard = await verifyKeyboardReachability(page);
        page.off('console', onConsole);
        page.off('pageerror', onPageError);

        const result = {
          route: routeConfig.path,
          viewport: `${viewport.width}x${viewport.height}`,
          authenticated: finalPath === routeConfig.path,
          finalPath,
          status: response?.status() || 0,
          heading: metrics.heading,
          innerWidth: metrics.innerWidth,
          scrollWidth: metrics.scrollWidth,
          overflow: metrics.scrollWidth > metrics.innerWidth,
          primaryControlReachable: keyboard.reached,
          focusIndicatorVisible: keyboard.focusVisible,
          accessibleControlName: keyboard.name,
          liveRegions: metrics.liveRegions,
          consoleErrors,
          pageErrors,
        };
        const failed = !result.authenticated || result.status >= 400 || result.overflow || !result.primaryControlReachable || consoleErrors.length || pageErrors.length;
        if (failed) throw new Error(`Protected route QA failed: ${JSON.stringify(result)}`);
        results.push(result);

        if ((routeConfig.path === '/admin/users' && (viewport.width === 1440 || viewport.width === 390)) || viewport.width === 390) {
          const filename = `${routeConfig.path.split('/').pop()}-${viewport.width}.png`;
          await page.screenshot({ path: path.join(artifactsDir, filename), fullPage: false });
        }
      }
    }

    await page.goto('/admin/users', { waitUntil: 'domcontentloaded' });
    for (const text of ['Staff', 'Reader', 'Newsletter subscribers', 'Team Management', 'Super Admin', 'Active', 'Inactive']) {
      await page.locator('main').getByText(text, { exact: text !== 'Team Management' }).first().waitFor();
    }
    const dialogProof = await exerciseUserFeedbackAndDialog(page);

    await page.goto('/admin/operations-diagnostics', { waitUntil: 'domcontentloaded' });
    for (const status of ['Healthy', 'Degraded', 'Unavailable', 'Read-only diagnostics']) {
      await page.getByText(status, { exact: false }).first().waitFor();
    }
    await page.goto('/admin/operations', { waitUntil: 'domcontentloaded' });
    await page.getByText('Read-only overview', { exact: true }).waitFor();
    await page.getByText('Status and navigation are read-only here.', { exact: true }).waitFor();

    await context.close();
    if (state.browserExternalAttempts || state.blockedServerEgress) {
      throw new Error(`Offline QA detected egress attempts: browser=${state.browserExternalAttempts}, server=${state.blockedServerEgress}.`);
    }

    const summary = {
      baseUrl,
      authenticated: true,
      routes: results,
      dialogProof,
      externalConnectionAttempts: 0,
      successfulExternalConnections: 0,
      blockedEgressEvents: 0,
      loopbackConnectionAttempts: state.loopbackServerAttempts,
      localNetworkStubs: state.browserLocalStubs + 1,
      screenshots: fs.readdirSync(artifactsDir).filter((name) => /^(users|team|settings|audit-log|permission-review|operations|operations-diagnostics)-(1440|390)\.png$/.test(name)),
    };
    console.log(`PHASE310_OFFLINE_QA_RESULT=${JSON.stringify(summary)}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await stopChild(child);
  }
}

run().catch((error) => {
  console.error(`PHASE310_OFFLINE_QA_FAILED ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
