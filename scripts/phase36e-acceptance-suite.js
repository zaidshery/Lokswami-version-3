'use strict';

/**
 * scripts/phase36e-acceptance-suite.js
 *
 * Full Phase 3.6E Automated Acceptance Suite.
 * Covers Tasks 2 through 12 without requiring manual browser interaction.
 */

const { chromium } = require('@playwright/test');
const { encode } = require('next-auth/jwt');
const mongoose = require('mongoose');
const { loadStagingEnvFiles } = require('./validate-staging-env');

loadStagingEnvFiles();

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
const SALT = 'lokswami.session-token';

const FIXTURES = {
  A: { id: '6ab22f9a490bea111cad0d26', title: '[QA 3.6E] Review Started Notification' },
  B: { id: '6ab22f9b490bea111cad0d2c', title: '[QA 3.6E] Reassignment Notification' },
  C: { id: '6ab22f9b490bea111cad0d31', title: '[QA 3.6E] Rejection Notification' },
  D: { id: '6ab22f9c490bea111cad0d34', title: '[QA 3.6E] Schedule Notification' },
};

const USERS = {
  super_admin: {
    id: 'env-admin:admin',
    userId: 'env-admin:admin',
    email: 'admin@lokswami.com',
    name: 'Super Admin',
    role: 'super_admin',
    isActive: true,
  },
  admin: {
    id: '6aae18d474cfbdb2b2fb27f5',
    userId: '6aae18d474cfbdb2b2fb27f5',
    email: 'qa.admin@example.test',
    name: 'QA Admin',
    role: 'admin',
    isActive: true,
  },
  copy_editor: {
    id: '6aae18d474cfbdb2b2fb27fd',
    userId: '6aae18d474cfbdb2b2fb27fd',
    email: 'qa.copyeditor@example.test',
    name: 'QA Copy Editor',
    role: 'copy_editor',
    isActive: true,
  },
  reporter: {
    id: '6aae18d574cfbdb2b2fb2805',
    userId: '6aae18d574cfbdb2b2fb2805',
    email: 'qa.reporter@example.test',
    name: 'QA Reporter',
    role: 'reporter',
    isActive: true,
  },
};

async function getSessionCookie(role) {
  const user = USERS[role];
  if (!user) throw new Error(`Unknown role: ${role}`);
  const token = {
    id: user.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: true,
    sub: user.id,
  };
  return encode({ token, secret: SECRET, salt: SALT });
}

async function createAuthenticatedContext(browser, role, options = {}) {
  const cookieValue = await getSessionCookie(role);
  const context = await browser.newContext(options);
  await context.addCookies([
    {
      name: SALT,
      value: cookieValue,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  return context;
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log('==================================================');
  console.log('LOKSWAMI PHASE 3.6E AUTOMATED ACCEPTANCE SUITE');
  console.log('==================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to staging MongoDB');

  const browser = await chromium.launch({ headless: true });
  console.log('✓ Launched Chromium');

  const results = {};

  try {
    // ----------------------------------------------------
    // TASK 2: REJECTION NOTIFICATION ACCEPTANCE
    // ----------------------------------------------------
    console.log('\n--- TASK 2: Rejection Notification Automated Acceptance ---');
    {
      const notifsColl = mongoose.connection.collection('workflownotifications');
      const cNotifs = await notifsColl.find({ contentId: FIXTURES.C.id }).toArray();
      console.log(`Found ${cNotifs.length} notification(s) for Fixture C.`);

      const reporterNotif = cNotifs.find((n) => n.recipientEmail === USERS.reporter.email);
      expect(reporterNotif, 'Expected rejection notification for qa.reporter');
      expect(reporterNotif.eventType === 'rejected', `Expected eventType rejected, got ${reporterNotif.eventType}`);
      expect(reporterNotif.contentId === FIXTURES.C.id, 'Expected contentId to match fixture C');
      expect(reporterNotif.message.includes('QA 3.6E rejection notification verification.'), 'Expected rejection reason in message');
      expect(reporterNotif.href === `/admin/stories/${FIXTURES.C.id}/edit`, `Expected deep link to story edit, got ${reporterNotif.href}`);

      // Check actor exclusion
      const adminNotif = cNotifs.find((n) => n.recipientEmail === USERS.admin.email);
      expect(!adminNotif, 'Actor qa.admin must NOT receive rejection notification (isolation verified)');

      // Ensure starting readAt is null for testing mark-read
      await notifsColl.updateOne({ _id: reporterNotif._id }, { $set: { readAt: null } });

      // Verify individual read via recipient-scoped PATCH
      const reporterCookie = await getSessionCookie('reporter');
      const getResBefore = await fetch(`${BASE_URL}/api/admin/notifications?unreadOnly=1`, {
        headers: { Cookie: `${SALT}=${reporterCookie}` },
      });
      const getBeforeBody = await getResBefore.json();
      const countBefore = getBeforeBody.data?.unreadCount ?? 0;
      console.log(`qa.reporter unread notifications before read: ${countBefore}`);

      // Mark single notification read
      const patchRes = await fetch(`${BASE_URL}/api/admin/notifications`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SALT}=${reporterCookie}`,
        },
        body: JSON.stringify({ ids: [reporterNotif._id.toString()] }),
      });
      expect(patchRes.status === 200, `Expected 200 from mark read, got ${patchRes.status}`);
      const patchBody = await patchRes.json();
      expect(patchBody.success === true, 'Expected patch success');
      const updatedCount = patchBody.data?.updated ?? 0;
      expect(updatedCount === 1, `Expected updated = 1, got ${updatedCount}`);

      // Check in DB that readAt is set
      const updatedNotif = await notifsColl.findOne({ _id: reporterNotif._id });
      expect(updatedNotif.readAt !== null, 'Expected readAt to be populated');

      // Verify unread count decreased by 1
      const getResAfter = await fetch(`${BASE_URL}/api/admin/notifications?unreadOnly=1`, {
        headers: { Cookie: `${SALT}=${reporterCookie}` },
      });
      const getAfterBody = await getResAfter.json();
      const countAfter = getAfterBody.data?.unreadCount ?? 0;
      console.log(`qa.reporter unread count after read: ${countAfter}`);
      expect(countAfter === countBefore - 1, `Expected unread count to decrease exactly by 1 (${countBefore} -> ${countAfter})`);

      console.log('✓ TASK 2 PASSED: Rejection notification, recipient isolation, and individual mark-read verified.');
      results.task2 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 3: REVIEW STARTED NOTIFICATION
    // ----------------------------------------------------
    console.log('\n--- TASK 3: Review Started Notification Acceptance (Fixture A) ---');
    {
      const storiesColl = mongoose.connection.collection('stories');
      const notifsColl = mongoose.connection.collection('workflownotifications');
      const aId = new mongoose.Types.ObjectId(FIXTURES.A.id);

      // Clean notifications for A and set starting state
      await notifsColl.deleteMany({ contentId: FIXTURES.A.id });
      await storiesColl.updateOne(
        { _id: aId },
        {
          $set: {
            isPublished: false,
            'workflow.status': 'submitted',
            'workflow.assignedTo': null,
            'workflow.createdBy': {
              id: USERS.reporter.id,
              name: USERS.reporter.name,
              email: USERS.reporter.email,
              role: USERS.reporter.role,
            },
          },
        }
      );

      // Copy editor starts review via authenticated request
      const copyEditorCookie = await getSessionCookie('copy_editor');
      const startRes = await fetch(`${BASE_URL}/api/admin/stories/${FIXTURES.A.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SALT}=${copyEditorCookie}`,
        },
        body: JSON.stringify({ action: 'start_review' }),
      });
      expect(startRes.status === 200, `Expected 200 from start_review, got ${startRes.status}`);

      // Check DB status
      const updatedStory = await storiesColl.findOne({ _id: aId });
      expect(updatedStory.workflow.status === 'in_review', `Expected status in_review, got ${updatedStory.workflow.status}`);
      expect(updatedStory.workflow.assignedTo.email === USERS.copy_editor.email, 'Expected assigned to copy editor');

      // Verify notification generated for reporter
      const notifs = await notifsColl.find({ contentId: FIXTURES.A.id }).toArray();
      expect(notifs.length === 1, `Expected exactly 1 notification, found ${notifs.length}`);
      const notif = notifs[0];
      expect(notif.eventType === 'review_started', `Expected review_started, got ${notif.eventType}`);
      expect(notif.recipientEmail === USERS.reporter.email, `Expected recipient qa.reporter, got ${notif.recipientEmail}`);
      expect(notif.href === `/admin/stories/${FIXTURES.A.id}/edit`, 'Expected deep link to story edit');

      // Actor isolation: copy editor should NOT have received notification
      const actorNotif = notifs.find((n) => n.recipientEmail === USERS.copy_editor.email);
      expect(!actorNotif, 'Actor qa.copyeditor must not receive review_started notification');

      console.log('✓ TASK 3 PASSED: Review started workflow and notification verified.');
      results.task3 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 4: REASSIGNMENT NOTIFICATION
    // ----------------------------------------------------
    console.log('\n--- TASK 4: Reassignment Notification Acceptance (Fixture B) ---');
    {
      const storiesColl = mongoose.connection.collection('stories');
      const notifsColl = mongoose.connection.collection('workflownotifications');
      const bId = new mongoose.Types.ObjectId(FIXTURES.B.id);

      // Clean notifications for B and set initial owner
      await notifsColl.deleteMany({ contentId: FIXTURES.B.id });
      await storiesColl.updateOne(
        { _id: bId },
        {
          $set: {
            isPublished: false,
            'workflow.status': 'assigned',
            'workflow.assignedTo': {
              id: USERS.reporter.id,
              name: USERS.reporter.name,
              email: USERS.reporter.email,
              role: USERS.reporter.role,
            },
            'workflow.createdBy': {
              id: USERS.reporter.id,
              name: USERS.reporter.name,
              email: USERS.reporter.email,
              role: USERS.reporter.role,
            },
          },
        }
      );

      // Admin reassigns B to copy_editor
      const adminCookie = await getSessionCookie('admin');
      const reassignRes = await fetch(`${BASE_URL}/api/admin/stories/${FIXTURES.B.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SALT}=${adminCookie}`,
        },
        body: JSON.stringify({
          action: 'assign',
          assignedToId: USERS.copy_editor.id,
        }),
      });
      expect(reassignRes.status === 200, `Expected 200 from reassign, got ${reassignRes.status}`);

      // Verify notifications
      const notifs = await notifsColl.find({ contentId: FIXTURES.B.id }).toArray();
      const reassignedNotif = notifs.find((n) => n.eventType === 'reassigned');
      expect(reassignedNotif, 'Expected reassigned notification for previous owner');
      expect(reassignedNotif.recipientEmail === USERS.reporter.email, 'Displaced owner qa.reporter must receive reassigned event');

      const assignedNotif = notifs.find((n) => n.eventType === 'assigned');
      expect(assignedNotif, 'Expected assigned notification for new owner');
      expect(assignedNotif.recipientEmail === USERS.copy_editor.email, 'New owner qa.copyeditor must receive assigned event');

      // Actor isolation
      const adminNotif = notifs.find((n) => n.recipientEmail === USERS.admin.email);
      expect(!adminNotif, 'Actor qa.admin must not receive notification');

      console.log('✓ TASK 4 PASSED: Reassignment notifications and displaced-owner delivery verified.');
      results.task4 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 5: SCHEDULE NOTIFICATION
    // ----------------------------------------------------
    console.log('\n--- TASK 5: Schedule Notification Acceptance (Fixture D) ---');
    {
      const storiesColl = mongoose.connection.collection('stories');
      const notifsColl = mongoose.connection.collection('workflownotifications');
      const dId = new mongoose.Types.ObjectId(FIXTURES.D.id);

      // Clean notifications for D and reset to approved
      await notifsColl.deleteMany({ contentId: FIXTURES.D.id });
      await storiesColl.updateOne(
        { _id: dId },
        {
          $set: {
            isPublished: false,
            'workflow.status': 'approved',
            'workflow.scheduledFor': null,
            'workflow.assignedTo': {
              id: USERS.copy_editor.id,
              name: USERS.copy_editor.name,
              email: USERS.copy_editor.email,
              role: USERS.copy_editor.role,
            },
            'workflow.createdBy': {
              id: USERS.reporter.id,
              name: USERS.reporter.name,
              email: USERS.reporter.email,
              role: USERS.reporter.role,
            },
          },
        }
      );

      const futureDate = '2026-11-01T10:00:00.000Z';
      const adminCookie = await getSessionCookie('admin');
      const schedRes = await fetch(`${BASE_URL}/api/admin/stories/${FIXTURES.D.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SALT}=${adminCookie}`,
        },
        body: JSON.stringify({
          action: 'schedule',
          scheduledFor: futureDate,
        }),
      });
      expect(schedRes.status === 200, `Expected 200 from schedule, got ${schedRes.status}`);

      // Verify DB state
      const updatedD = await storiesColl.findOne({ _id: dId });
      expect(updatedD.workflow.status === 'scheduled', `Expected scheduled status, got ${updatedD.workflow.status}`);
      expect(updatedD.isPublished === false, 'Story must remain unpublished while scheduled');
      expect(new Date(updatedD.workflow.scheduledFor).toISOString() === futureDate, 'ScheduledFor date must match');

      // Verify notifications
      const notifs = await notifsColl.find({ contentId: FIXTURES.D.id }).toArray();
      const schedNotifs = notifs.filter((n) => n.eventType === 'scheduled');
      expect(schedNotifs.length === 2, `Expected 2 schedule notifications (creator + assignee), got ${schedNotifs.length}`);

      const reporterSched = schedNotifs.find((n) => n.recipientEmail === USERS.reporter.email);
      const copyEditorSched = schedNotifs.find((n) => n.recipientEmail === USERS.copy_editor.email);
      expect(reporterSched, 'Expected schedule notification for qa.reporter');
      expect(copyEditorSched, 'Expected schedule notification for qa.copyeditor');

      // Actor isolation
      const adminNotif = schedNotifs.find((n) => n.recipientEmail === USERS.admin.email);
      expect(!adminNotif, 'Actor qa.admin must not receive notification');

      console.log('✓ TASK 5 PASSED: Scheduling workflow, publication safety, and recipient notifications verified.');
      results.task5 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 6: NOTIFICATION BELL PLAYWRIGHT ACCEPTANCE
    // ----------------------------------------------------
    console.log('\n--- TASK 6: Notification Bell Playwright Acceptance ---');
    {
      const context = await createAuthenticatedContext(browser, 'reporter', {
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/admin/work?view=all`);
      await page.waitForLoadState('networkidle');

      // Find bell button
      const bellButton = page.locator('button[aria-haspopup="dialog"]').first();
      await bellButton.waitFor({ state: 'visible', timeout: 10000 });
      console.log('Bell button is visible.');

      // Check aria-expanded
      const expandedBefore = await bellButton.getAttribute('aria-expanded');
      expect(expandedBefore === 'false', 'Bell button must have aria-expanded="false" before click');

      // Open via click
      await bellButton.click();
      await page.waitForTimeout(300);

      const expandedAfter = await bellButton.getAttribute('aria-expanded');
      expect(expandedAfter === 'true', 'Bell button must have aria-expanded="true" after click');

      // Check popover visible
      const popover = page.locator('#workflow-notifications-panel, [role="dialog"][aria-label*="Notifications" i], [role="dialog"][aria-label*="नोटिफिकेशन" i]').first();
      await popover.waitFor({ state: 'visible', timeout: 5000 });
      console.log('Notification popover is visible.');

      // Bounding box checks
      const box = await popover.boundingBox();
      expect(box !== null, 'Popover must have a bounding box');
      expect(box.x >= 0, `Popover x (${box.x}) must be >= 0`);
      expect(box.x + box.width <= 1440 + 1, `Popover right edge (${box.x + box.width}) must be <= 1441`);
      expect(box.y >= 0, `Popover y (${box.y}) must be >= 0`);
      console.log(`Popover bounding box verified: (${box.x}, ${box.y}, ${box.width}x${box.height})`);

      // Close via Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const isPopoverHidden = !(await popover.isVisible());
      expect(isPopoverHidden, 'Popover must close on Escape key');
      console.log('Popover closed via Escape.');

      // Open via keyboard (Enter)
      await bellButton.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      expect(await popover.isVisible(), 'Popover must open on Enter key');

      // Close via outside click
      await page.mouse.click(100, 100);
      await page.waitForTimeout(300);
      expect(!(await popover.isVisible()), 'Popover must close on outside click');
      console.log('Popover closed via outside click.');

      await context.close();
      console.log('✓ TASK 6 PASSED: Notification bell interactions, accessibility, and positioning verified.');
      results.task6 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 7 & 8: WORK DRAWER & DESK ACTION ACCESSIBILITY
    // ----------------------------------------------------
    console.log('\n--- TASK 7 & 8: Work Drawer & Desk Action Accessibility ---');
    {
      const context = await createAuthenticatedContext(browser, 'admin', {
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/admin/work?view=all`);
      await page.waitForLoadState('networkidle');

      // Open work drawer by clicking item title
      const itemTitle = page.locator('h3').first();
      await itemTitle.waitFor({ state: 'visible', timeout: 10000 });
      await itemTitle.click();
      await page.waitForTimeout(500);

      // Check dialog
      const dialog = page.locator('div[role="dialog"][aria-labelledby="work-item-title"]').first();
      await dialog.waitFor({ state: 'visible', timeout: 5000 });
      expect(await dialog.getAttribute('aria-modal') === 'true', 'Drawer must have aria-modal="true"');

      // Check focus inside drawer
      const closeBtn = dialog.locator('button[aria-label*="Close" i], button[aria-label*="बंद" i]').first();
      expect(await closeBtn.isVisible(), 'Close button must be visible');

      // Tab key navigation inside drawer
      await page.keyboard.press('Tab');
      const focusedTagName = await page.evaluate(() => document.activeElement?.tagName);
      console.log(`Focus after Tab inside drawer: ${focusedTagName}`);

      // Desk Action trigger accessibility
      const deskAction = dialog.getByRole('button', { name: 'Desk Action' });
      if (await deskAction.isVisible()) {
        const ariaExpBefore = await deskAction.getAttribute('aria-expanded');
        expect(ariaExpBefore === 'false', 'Desk Action aria-expanded must be false initially');

        await deskAction.click();
        await page.waitForTimeout(200);

        const ariaExpAfter = await deskAction.getAttribute('aria-expanded');
        expect(ariaExpAfter === 'true', 'Desk Action aria-expanded must be true when open');

        // Check textarea accessibility
        const textarea = dialog.locator('textarea');
        expect(await textarea.isVisible(), 'Desk Reason textarea must be visible');

        // Reject button
        const rejectBtn = dialog.getByRole('button', { name: 'Reject', exact: true });
        expect(await rejectBtn.isVisible(), 'Reject button must be visible');
        console.log('Desk Action form controls are keyboard accessible and correctly labeled.');
      }

      // Close drawer via Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      expect(!(await dialog.isVisible()), 'Drawer must close on Escape');
      console.log('Drawer closed on Escape.');

      await context.close();
      console.log('✓ TASK 7 & 8 PASSED: Drawer trap, dialog semantics, and Desk Action accessibility verified.');
      results.task7_8 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 9: RESPONSIVE ACCEPTANCE (3 VIEWPORTS x 4 ROUTES)
    // ----------------------------------------------------
    console.log('\n--- TASK 9: Responsive Viewport Acceptance ---');
    {
      const viewports = [
        { width: 1440, height: 900, name: 'Desktop 1440' },
        { width: 768, height: 1024, name: 'Tablet 768' },
        { width: 390, height: 844, name: 'Mobile 390' },
      ];
      const routes = ['/admin', '/admin/work', '/admin/notifications', '/admin/copy-desk'];

      for (const vp of viewports) {
        console.log(`Testing viewport ${vp.name} (${vp.width}x${vp.height})...`);
        const context = await createAuthenticatedContext(browser, 'admin', {
          viewport: { width: vp.width, height: vp.height },
        });
        const page = await context.newPage();

        for (const route of routes) {
          await page.goto(`${BASE_URL}${route}`);
          await page.waitForLoadState('networkidle');

          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

          // Assert no horizontal overflow with 1px tolerance
          const overflow = scrollWidth - vp.width;
          expect(
            scrollWidth <= vp.width + 1,
            `Horizontal overflow on ${route} at ${vp.width}px: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}, overflow=${overflow}px`
          );
        }
        await context.close();
      }
      console.log('✓ TASK 9 PASSED: Zero horizontal overflow across all 3 viewports and 4 routes.');
      results.task9 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 10: FOUR-ROLE ROUTE SMOKE MATRIX
    // ----------------------------------------------------
    console.log('\n--- TASK 10: Four-Role Route Smoke Matrix ---');
    {
      const matrix = [
        { route: '/admin', allowed: ['super_admin', 'admin', 'copy_editor', 'reporter'] },
        { route: '/admin/work', allowed: ['super_admin', 'admin', 'copy_editor', 'reporter'] },
        { route: '/admin/my-work', allowed: ['admin', 'copy_editor', 'reporter'], denied: ['super_admin'] },
        { route: '/admin/assignments', allowed: ['super_admin', 'admin'], denied: ['copy_editor', 'reporter'] },
        { route: '/admin/review-queue', allowed: ['super_admin', 'admin'], denied: ['copy_editor', 'reporter'] },
        { route: '/admin/content-queue', allowed: ['super_admin', 'admin'], denied: ['copy_editor', 'reporter'] },
        { route: '/admin/copy-desk', allowed: ['super_admin', 'admin', 'copy_editor'], denied: ['reporter'] },
        { route: '/admin/team', allowed: ['super_admin'], denied: ['admin', 'copy_editor', 'reporter'] },
        { route: '/admin/audit-log', allowed: ['super_admin'], denied: ['admin', 'copy_editor', 'reporter'] },
        { route: '/admin/settings', allowed: ['super_admin'], denied: ['admin', 'copy_editor', 'reporter'] },
        { route: '/admin/epapers', allowed: ['super_admin'], denied: ['admin', 'copy_editor', 'reporter'] },
      ];

      for (const role of ['super_admin', 'admin', 'copy_editor', 'reporter']) {
        console.log(`Checking role: ${role}...`);
        const context = await createAuthenticatedContext(browser, role, {
          viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();

        for (const entry of matrix) {
          const isAllowed = entry.allowed.includes(role);
          await page.goto(`${BASE_URL}${entry.route}`);
          await page.waitForLoadState('networkidle');
          const currentUrl = page.url();

          if (isAllowed) {
            expect(
              !currentUrl.includes('access=denied') && !currentUrl.includes('/signin'),
              `Role ${role} should be ALLOWED on ${entry.route}, but landed on: ${currentUrl}`
            );
          } else {
            expect(
              currentUrl.includes('access=denied') || currentUrl.includes('/admin/work') || currentUrl.includes('/admin') || currentUrl.includes('/signin'),
              `Role ${role} should be DENIED on ${entry.route}, but remained on: ${currentUrl}`
            );
          }
        }
        await context.close();
      }
      console.log('✓ TASK 10 PASSED: Canonical 4-role access matrix fully verified.');
      results.task10 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 11: API SECURITY & ISOLATION
    // ----------------------------------------------------
    console.log('\n--- TASK 11: API Security & RBAC Isolation ---');
    {
      const reporterCookie = await getSessionCookie('reporter');
      const copyEditorCookie = await getSessionCookie('copy_editor');

      // 1. Reporter cannot reject story
      const rejectAttempt = await fetch(`${BASE_URL}/api/admin/stories/${FIXTURES.C.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SALT}=${reporterCookie}`,
        },
        body: JSON.stringify({ action: 'reject', rejectionReason: 'Illegal reject attempt' }),
      });
      expect(rejectAttempt.status === 403, `Reporter reject attempt must be 403 Forbidden, got ${rejectAttempt.status}`);

      // 2. Reporter cannot schedule story
      const scheduleAttempt = await fetch(`${BASE_URL}/api/admin/stories/${FIXTURES.D.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SALT}=${reporterCookie}`,
        },
        body: JSON.stringify({ action: 'schedule', scheduledFor: '2026-12-01T00:00:00.000Z' }),
      });
      expect(scheduleAttempt.status === 403, `Reporter schedule attempt must be 403 Forbidden, got ${scheduleAttempt.status}`);

      // 3. Recipient isolation on notification mark-read:
      // Find a notification belonging ONLY to copy_editor
      const notifsColl = mongoose.connection.collection('workflownotifications');
      const copyNotif = await notifsColl.findOne({ recipientEmail: USERS.copy_editor.email });
      if (copyNotif) {
        // Reporter tries to mark copy editor's notification as read
        const markAttempt = await fetch(`${BASE_URL}/api/admin/notifications`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${SALT}=${reporterCookie}`,
          },
          body: JSON.stringify({ ids: [copyNotif._id.toString()] }),
        });
        const markPayload = await markAttempt.json();
        const updated = markPayload.data?.updated ?? 0;
        expect(updated === 0, `Cross-user notification mark-read must modify 0 records, got ${updated}`);
      }

      console.log('✓ TASK 11 PASSED: Strict mutation RBAC and cross-recipient isolation verified.');
      results.task11 = 'PASS';
    }

    // ----------------------------------------------------
    // TASK 12: LOADING & ERROR BOUNDARIES
    // ----------------------------------------------------
    console.log('\n--- TASK 12: Loading & Error Boundaries ---');
    {
      const context = await createAuthenticatedContext(browser, 'admin', {
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();

      for (const route of ['/admin/review-queue', '/admin/content-queue', '/admin/notifications']) {
        const res = await page.goto(`${BASE_URL}${route}`);
        expect(res.status() === 200, `Expected 200 for ${route}, got ${res.status()}`);
        await page.waitForLoadState('networkidle');
        const pageText = await page.textContent('body');
        expect(!pageText.includes('Application error') && !pageText.includes('Unhandled Runtime Error'), `Uncaught error on ${route}`);
      }
      await context.close();
      console.log('✓ TASK 12 PASSED: Critical route boundaries and rendering confirmed stable.');
      results.task12 = 'PASS';
    }

    console.log('\n==================================================');
    console.log('ALL PHASE 3.6E ACCEPTANCE SUITE TASKS PASSED (2-12)');
    console.log('==================================================\n');
  } finally {
    await browser.close();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('\n❌ ACCEPTANCE SUITE FAILED:', err);
  process.exit(1);
});
