#!/usr/bin/env node

/**
 * scripts/phase3/pr-readiness.js
 *
 * READ-ONLY Pull Request Readiness Inspector for LokSwami B3.
 *
 * Inspects a PR to verify that it meets the repository's strict readiness criteria:
 * 1. PR exists and is in OPEN state (not closed, not merged).
 * 2. Target base branch is strictly 'b3/foundation'.
 * 3. Remote head SHA matches local git HEAD (when on the corresponding branch).
 * 4. Mergeable status is clean (no git conflicts).
 * 5. Pull request CI checks on the EXACT head SHA have all passed.
 * 6. All review threads are resolved (0 unresolved comments/threads).
 *
 * MANDATORY SAFETY INVARIANTS:
 * - This script NEVER performs a merge.
 * - This script NEVER automatically resolves review threads.
 * - This script is strictly READ-ONLY.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');

function runGh(args) {
  try {
    const result = spawnSync('gh', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    return (result.stdout || '').trim();
  } catch {
    return null;
  }
}

function runGit(args) {
  try {
    const result = spawnSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    if (result.status !== 0) return null;
    return (result.stdout || '').trim();
  } catch {
    return null;
  }
}

function isGhCliAvailable() {
  const version = runGh(['--version']);
  return Boolean(version && version.includes('gh version'));
}

function getLocalHeadSha() {
  return runGit(['rev-parse', 'HEAD']);
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  let prNumber = null;
  let strict = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--pr' && args[i + 1]) {
      prNumber = args[i + 1];
      i += 1;
    } else if (/^\d+$/.test(args[i])) {
      prNumber = args[i];
    } else if (args[i] === '--strict') {
      strict = true;
    }
  }

  return { prNumber, strict };
}

function queryPrData(prNumber) {
  const jsonFields = 'number,title,url,state,isDraft,mergedAt,baseRefName,headRefName,headRefOid,mergeable,statusCheckRollup';
  const args = prNumber
    ? ['pr', 'view', String(prNumber), '--json', jsonFields]
    : ['pr', 'view', '--json', jsonFields];
  const raw = runGh(args);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function queryReviewThreads(prNumber, runGhFn = runGh) {
  if (!prNumber) {
    return { success: false, error: 'PR number is required' };
  }

  let hasNextPage = true;
  let cursor = null;
  let totalCount = null;
  const allNodes = [];
  let pageCount = 0;
  const MAX_PAGES = 50; // Safety limit (up to 5000 threads)

  while (hasNextPage && pageCount < MAX_PAGES) {
    pageCount += 1;
    const query = `query($pr: Int!, $cursor: String) {
      repository(owner: "zaidshery", name: "Lokswami-version-3") {
        pullRequest(number: $pr) {
          reviewThreads(first: 100, after: $cursor) {
            totalCount
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              isResolved
            }
          }
        }
      }
    }`;

    const args = ['api', 'graphql', '-F', `pr=${prNumber}`];
    if (cursor) {
      args.push('-F', `cursor=${cursor}`);
    }
    args.push('-f', `query=${query}`);

    const raw = runGhFn(args);
    if (!raw) {
      return { success: false, error: 'GraphQL query failed or returned no output' };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { success: false, error: 'Malformed JSON response from GitHub GraphQL API' };
    }

    if (parsed.errors && parsed.errors.length > 0) {
      return { success: false, error: `GraphQL error: ${parsed.errors[0]?.message || 'Unknown error'}` };
    }

    const threadConnection = parsed?.data?.repository?.pullRequest?.reviewThreads;
    if (!threadConnection) {
      return { success: false, error: 'Invalid GraphQL response structure: reviewThreads field missing' };
    }

    const rawTotal = threadConnection.totalCount;
    if (
      rawTotal === null ||
      rawTotal === undefined ||
      typeof rawTotal !== 'number' ||
      !Number.isFinite(rawTotal) ||
      !Number.isInteger(rawTotal) ||
      rawTotal < 0
    ) {
      return {
        success: false,
        error: `Invalid totalCount in reviewThreads response: ${JSON.stringify(rawTotal)}`,
      };
    }

    if (totalCount === null) {
      totalCount = rawTotal;
    } else if (rawTotal !== totalCount) {
      return {
        success: false,
        error: `totalCount changed unexpectedly between pages: expected ${totalCount} but got ${rawTotal}`,
      };
    }

    const nodes = threadConnection.nodes;
    if (!Array.isArray(nodes)) {
      return { success: false, error: 'Invalid GraphQL response structure: reviewThreads.nodes is not an array' };
    }

    allNodes.push(...nodes);

    if (allNodes.length > totalCount) {
      return {
        success: false,
        error: `Fetched nodes count (${allNodes.length}) exceeds totalCount (${totalCount})`,
      };
    }

    const pageInfo = threadConnection.pageInfo;
    hasNextPage = Boolean(pageInfo?.hasNextPage);
    cursor = pageInfo?.endCursor || null;

    if (hasNextPage && !cursor) {
      return { success: false, error: 'Pagination error: hasNextPage is true but endCursor is missing' };
    }
  }

  if (hasNextPage) {
    return { success: false, error: `Pagination exceeded maximum safety limit of ${MAX_PAGES} pages` };
  }

  if (allNodes.length !== totalCount) {
    return {
      success: false,
      error: allNodes.length < totalCount
        ? `Partial thread retrieval: fetched ${allNodes.length} of ${totalCount} total threads`
        : `Thread retrieval mismatch: fetched ${allNodes.length} nodes exceeding totalCount ${totalCount}`,
    };
  }

  const total = totalCount;
  const unresolved = allNodes.filter((t) => !t || !t.isResolved).length;

  return {
    success: true,
    total,
    unresolved,
    allResolved: unresolved === 0,
  };
}

function main() {
  console.log('================================================================================');
  console.log('LokSwami B3 — Pull Request Readiness Inspector (READ-ONLY)');
  console.log('================================================================================\n');

  if (!isGhCliAvailable()) {
    console.error('ERROR: GitHub CLI (`gh`) is not available in current PATH.');
    console.error('Automated PR readiness inspection requires `gh` to verify remote pull request state.');
    console.error('Cannot prove PR readiness. Exiting with failure (fail-closed).\n');
    console.warn('Manual PR verification checklist:');
    console.warn('  1. Visit: https://github.com/zaidshery/Lokswami-version-3/pulls');
    console.warn('  2. Verify PR state: OPEN (merged = false)');
    console.warn('  3. Verify base branch: b3/foundation');
    console.warn('  4. Verify exact head SHA matches local git HEAD');
    console.warn('  5. Verify all GitHub Actions CI checks on exact head have passed');
    console.warn('  6. Verify all review threads are resolved (0 unresolved)');
    console.warn('  7. Remember: DO NOT MERGE without explicit user authorization.\n');
    process.exit(1);
  }

  const { prNumber } = parseCliArgs();
  const prData = queryPrData(prNumber);

  if (!prData) {
    console.error(`ERROR: Unable to find or query Pull Request ${prNumber ? `#${prNumber}` : 'for current branch'}.`);
    console.error('Make sure the branch has an active PR open on GitHub, or pass --pr <number>.');
    process.exit(1);
  }

  const localHead = getLocalHeadSha();
  const checks = [];

  // Check 1: PR Open
  const isOpen = prData.state === 'OPEN';
  checks.push({
    name: 'PR State is OPEN',
    pass: isOpen,
    details: `state = ${prData.state}`,
  });

  // Check 2: Not Merged
  const notMerged = !prData.mergedAt;
  checks.push({
    name: 'PR Not Merged',
    pass: notMerged,
    details: prData.mergedAt ? `mergedAt = ${prData.mergedAt}` : 'merged = false',
  });

  // Check 3: Base Branch
  const isBaseFoundation = prData.baseRefName === 'b3/foundation';
  checks.push({
    name: 'Base Branch is b3/foundation',
    pass: isBaseFoundation,
    details: `base = ${prData.baseRefName}`,
  });

  // Check 4: Head SHA matches local HEAD (fail closed on unknown/missing)
  const remoteHead = prData.headRefOid;
  const headsMatch = Boolean(localHead && remoteHead && remoteHead.toLowerCase() === localHead.toLowerCase());
  checks.push({
    name: 'Head SHA Matches Local HEAD',
    pass: headsMatch,
    details: localHead && remoteHead
      ? (headsMatch
          ? `Remote: ${remoteHead.slice(0, 12)} | Local: ${localHead.slice(0, 12)}`
          : `MISMATCH: Remote ${remoteHead.slice(0, 12)} !== Local ${localHead.slice(0, 12)}`)
      : `FAIL: Cannot verify head match (Remote: ${remoteHead ? remoteHead.slice(0, 12) : 'MISSING'}, Local: ${localHead ? localHead.slice(0, 12) : 'MISSING'})`,
  });

  // Check 5: Mergeability
  const isMergeable = prData.mergeable === 'MERGEABLE';
  checks.push({
    name: 'Git Mergeability',
    pass: isMergeable,
    details: `mergeable = ${prData.mergeable}`,
  });

  // Check 6: CI Status on exact head
  const statusRollup = prData.statusCheckRollup || [];
  let ciPassed = statusRollup.length > 0;
  let ciPending = 0;
  let ciFailed = 0;
  let ciSuccess = 0;

  for (const check of statusRollup) {
    const status = check.status || check.state;
    const conclusion = check.conclusion || check.state;
    if (status === 'IN_PROGRESS' || status === 'QUEUED' || status === 'PENDING') {
      ciPending += 1;
      ciPassed = false;
    } else if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL') {
      ciSuccess += 1;
    } else {
      ciFailed += 1;
      ciPassed = false;
    }
  }

  const ciSummary = statusRollup.length === 0
    ? 'No CI checks reported'
    : `${ciSuccess} passed, ${ciPending} pending, ${ciFailed} failed`;

  checks.push({
    name: 'Exact-Head CI Checks',
    pass: ciPassed && ciPending === 0 && ciFailed === 0,
    details: ciSummary,
  });

  // Check 7: Review threads (strictly fail closed if cannot be proven to be zero)
  const threadResult = queryReviewThreads(prData.number);
  const threadCheckPassed = Boolean(threadResult && threadResult.success && threadResult.unresolved === 0);
  const threadDetails = !threadResult || !threadResult.success
    ? `FAIL: Review thread check failed (${threadResult?.error || 'Unable to retrieve review threads'})`
    : `${threadResult.unresolved} unresolved (out of ${threadResult.total} total)`;

  checks.push({
    name: 'Unresolved Review Threads',
    pass: threadCheckPassed,
    details: threadDetails,
  });

  // Print Summary Table
  console.log(`PR #${prData.number}: ${prData.title}`);
  console.log(`URL:    ${prData.url}`);
  console.log(`Branch: ${prData.headRefName} -> ${prData.baseRefName}\n`);

  let allPassed = true;
  for (const c of checks) {
    const tag = c.pass ? '[PASS]' : '[FAIL]';
    if (!c.pass) allPassed = false;
    console.log(`${tag} ${c.name.padEnd(32)} | ${c.details}`);
  }

  console.log('\n================================================================================');
  if (allPassed) {
    console.log('STATUS: READY FOR FINAL INDEPENDENT HUMAN REVIEW.');
    console.log('SAFETY MANDATE: AUTOMATED AGENTS MUST NEVER MERGE. DO NOT MERGE.');
    process.exit(0);
  } else {
    console.error('STATUS: NOT READY. One or more readiness gates failed.');
    process.exit(1);
  }
}

module.exports = {
  runGh,
  runGit,
  isGhCliAvailable,
  getLocalHeadSha,
  parseCliArgs,
  queryPrData,
  queryReviewThreads,
  main,
};

if (require.main === module) {
  main();
}
