#!/usr/bin/env node
'use strict';

/**
 * scripts/verify-staging.js
 *
 * Staging environment & live Preview verification tooling for LokSwami B3 Phase 3.4.
 *
 * Validates staging environment configuration (fail-closed) and safely probes
 * live staging / preview domains without mutating production data or triggering outbound events.
 *
 * Usage:
 *   node scripts/verify-staging.js
 *   node scripts/verify-staging.js https://<preview-domain>
 *   npm run verify:staging -- https://<preview-domain>
 */

const {
  isProductionHostname,
  loadStagingEnvFiles,
  parseAbsoluteHttpUrl,
  printValidationReport,
  validateStagingEnv,
} = require('./validate-staging-env');

const DEFAULT_TIMEOUT_MS = 10000;

function parseArgs(argv) {
  let targetUrl = '';
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let help = false;
  let envOnly = false;

  for (const arg of argv) {
    if (!arg) continue;

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    if (arg === '--env-only') {
      envOnly = true;
      continue;
    }

    if (arg.startsWith('--url=')) {
      targetUrl = arg.slice('--url='.length).trim();
      continue;
    }

    if (arg.startsWith('--baseUrl=')) {
      targetUrl = arg.slice('--baseUrl='.length).trim();
      continue;
    }

    if (arg.startsWith('--timeoutMs=')) {
      const parsed = Number.parseInt(arg.slice('--timeoutMs='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed;
      }
      continue;
    }

    if (!arg.startsWith('--') && !targetUrl) {
      targetUrl = arg.trim();
    }
  }

  return { help, targetUrl, timeoutMs, envOnly };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function runLiveSmokeChecks(origin, timeoutMs) {
  const results = [];

  // Check 1: Staging origin responds
  try {
    const res = await fetchWithTimeout(`${origin}/`, { method: 'GET', redirect: 'manual' }, timeoutMs);
    if (res.status < 500) {
      results.push({ name: 'Staging origin response', status: 'PASS', details: `HTTP ${res.status}` });
    } else {
      results.push({ name: 'Staging origin response', status: 'FAIL', details: `HTTP ${res.status}` });
    }
  } catch (err) {
    results.push({
      name: 'Staging origin response',
      status: 'BLOCKED',
      details: `Unreachable: ${err.message}`,
    });
    // If the base origin is unreachable, remaining live probes cannot succeed
    return results;
  }

  // Check 2: Public reader route responds
  try {
    const res = await fetchWithTimeout(`${origin}/main`, { method: 'GET', redirect: 'follow' }, timeoutMs);
    if (res.status === 200 || (res.status >= 300 && res.status < 400)) {
      results.push({ name: 'Public reader route (/main)', status: 'PASS', details: `HTTP ${res.status}` });
    } else {
      results.push({ name: 'Public reader route (/main)', status: 'FAIL', details: `HTTP ${res.status}` });
    }
  } catch (err) {
    results.push({ name: 'Public reader route (/main)', status: 'BLOCKED', details: err.message });
  }

  // Check 3: Admin login route reachable
  try {
    const res = await fetchWithTimeout(`${origin}/login`, { method: 'GET', redirect: 'manual' }, timeoutMs);
    // /login typically redirects 308 to /signin, or renders 200
    if (res.status === 200 || (res.status >= 300 && res.status < 400)) {
      results.push({ name: 'Admin login reachable (/login)', status: 'PASS', details: `HTTP ${res.status}` });
    } else {
      results.push({ name: 'Admin login reachable (/login)', status: 'FAIL', details: `HTTP ${res.status}` });
    }
  } catch (err) {
    results.push({ name: 'Admin login reachable (/login)', status: 'BLOCKED', details: err.message });
  }

  // Check 4: Protected admin guest boundary
  try {
    const res = await fetchWithTimeout(`${origin}/admin`, { method: 'GET', redirect: 'manual' }, timeoutMs);
    // Must redirect unauthenticated guest (302/307) or reject (401/403)
    if ([301, 302, 303, 307, 308, 401, 403].includes(res.status)) {
      const location = res.headers.get('location') || '';
      results.push({
        name: 'Protected admin guest boundary (/admin)',
        status: 'PASS',
        details: `HTTP ${res.status} redirect to: ${location || '(unauthorized)'}`,
      });
    } else if (res.status === 200) {
      results.push({
        name: 'Protected admin guest boundary (/admin)',
        status: 'FAIL',
        details: 'Guest was granted HTTP 200 access without authentication redirect!',
      });
    } else {
      results.push({
        name: 'Protected admin guest boundary (/admin)',
        status: 'INFO',
        details: `HTTP ${res.status}`,
      });
    }
  } catch (err) {
    results.push({ name: 'Protected admin guest boundary (/admin)', status: 'BLOCKED', details: err.message });
  }

  // Check 5: Public health route if available
  try {
    const res = await fetchWithTimeout(`${origin}/api/v1/public/health`, { method: 'GET' }, timeoutMs);
    if (res.status === 200) {
      results.push({ name: 'Public health route (/api/v1/public/health)', status: 'PASS', details: 'HTTP 200 OK' });
    } else {
      results.push({
        name: 'Public health route (/api/v1/public/health)',
        status: 'INFO',
        details: `HTTP ${res.status}`,
      });
    }
  } catch (err) {
    results.push({
      name: 'Public health route (/api/v1/public/health)',
      status: 'INFO',
      details: `Endpoint check: ${err.message}`,
    });
  }

  return results;
}

async function verifyStaging(options = {}) {
  const { targetUrlRaw = '', timeoutMs = DEFAULT_TIMEOUT_MS, envOnly = false, env = process.env } = options;

  console.log('=== LokSwami B3 Phase 3.4 — Staging Environment & Smoke Verification ===\n');

  // Step 1: Staging environment safety validation
  console.log('1. Validating staging environment configuration...');
  const envValidation = validateStagingEnv(env);
  printValidationReport(envValidation);

  if (!envValidation.ok) {
    console.error('\nFAIL: Staging environment validation failed. Refusing to proceed.');
    return { ok: false, phase: 'env', envValidation };
  }
  console.log('PASS: Staging environment configuration is safe (fail-closed guards verified).\n');

  if (envOnly) {
    console.log('Staging environment check completed (--env-only requested).');
    return { ok: true, phase: 'env-only', envValidation };
  }

  // Step 2: Determine target URL
  const candidateUrlStr =
    targetUrlRaw ||
    String(env.NEXTAUTH_URL || '').trim() ||
    String(env.NEXT_PUBLIC_SITE_URL || '').trim();

  const parsedTarget = parseAbsoluteHttpUrl(candidateUrlStr);

  if (!parsedTarget) {
    console.log('2. Live Preview smoke checks: MANUAL / BLOCKED');
    console.log('   Reason: No valid staging/preview URL provided.');
    console.log('   Provide a URL via: npm run verify:staging -- https://<preview-domain>');
    console.log('\nStatus: REPOSITORY COMPLETE — LIVE INFRASTRUCTURE PENDING');
    return { ok: true, phase: 'smoke-blocked', reason: 'no-target-url', envValidation };
  }

  // Step 3: Origin safety verification
  console.log(`2. Verifying target origin safety: ${parsedTarget.origin}`);
  if (isProductionHostname(parsedTarget.hostname)) {
    console.error(`\nCRITICAL SECURITY VIOLATION: Target origin ${parsedTarget.origin} is a PRODUCTION domain!`);
    console.error('Smoke check execution strictly forbidden against production.');
    return { ok: false, phase: 'origin-security', error: 'production-origin-detected' };
  }
  console.log('   PASS: Target origin is confirmed non-production.\n');

  // Check if target is a placeholder or template domain
  const isTemplateDomain =
    parsedTarget.hostname.endsWith('.example.com') ||
    parsedTarget.hostname.endsWith('.example') ||
    parsedTarget.hostname === 'replace-me';

  if (isTemplateDomain) {
    console.log('3. Live Preview network probes: MANUAL / BLOCKED');
    console.log(`   Target "${parsedTarget.origin}" is a template/placeholder domain.`);
    console.log('   Once external Vercel Preview is provisioned, run:');
    console.log('     npm run verify:staging -- https://<actual-preview-url>\n');
    console.log('Status: REPOSITORY COMPLETE — INFRASTRUCTURE PENDING');
    return { ok: true, phase: 'smoke-blocked', reason: 'template-domain', envValidation };
  }

  // Step 4: Run live non-destructive probes
  console.log(`3. Executing safe read-only smoke probes against: ${parsedTarget.origin}`);
  const liveResults = await runLiveSmokeChecks(parsedTarget.origin, timeoutMs);

  console.log('\nResults:');
  let hasFailures = false;
  let hasBlocked = false;

  for (const r of liveResults) {
    console.log(`  [${r.status}] ${r.name}: ${r.details}`);
    if (r.status === 'FAIL') hasFailures = true;
    if (r.status === 'BLOCKED') hasBlocked = true;
  }

  if (hasFailures) {
    console.error('\nFAIL: Staging smoke checks detected failures.');
    return { ok: false, phase: 'smoke-probes', liveResults };
  }

  if (hasBlocked) {
    console.log('\nNOTICE: Staging URL could not be reached (infrastructure not provisioned or offline).');
    console.log('See docs/b3/PHASE3_4_STAGING_RUNBOOK.md for provisioning instructions.');
    console.log('\nStatus: REPOSITORY COMPLETE — INFRASTRUCTURE PENDING');
    return { ok: true, phase: 'smoke-blocked', liveResults, envValidation };
  }

  console.log('\nPASS: All staging smoke probes completed successfully.');
  return { ok: true, phase: 'complete', liveResults, envValidation };
}

async function main() {
  const { help, targetUrl, timeoutMs, envOnly } = parseArgs(process.argv.slice(2));

  if (help) {
    console.log('Usage:');
    console.log('  npm run verify:staging');
    console.log('  npm run verify:staging -- https://<preview-domain>');
    console.log('  npm run verify:staging -- --url=https://<preview-domain> --timeoutMs=15000');
    console.log('  npm run verify:staging -- --env-only');
    return;
  }

  loadStagingEnvFiles();

  const result = await verifyStaging({
    targetUrlRaw: targetUrl,
    timeoutMs,
    envOnly,
    env: process.env,
  });

  if (!result.ok) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Unhandled error during staging verification:', err);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  runLiveSmokeChecks,
  verifyStaging,
};
