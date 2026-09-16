#!/usr/bin/env node

/**
 * scripts/phase3/check-scope.js
 *
 * READ-ONLY scope and secrets safety verification for LokSwami B3.
 *
 * Inspects the current git working tree and branch changes against the base
 * (b3/foundation) for suspicious, dangerous, or unintended artifacts.
 *
 * Checks include:
 * - .env and .env.* files (excluding tracked .env.example)
 * - Private keys, certificates, and credential files (*.pem, *.key, id_rsa, etc.)
 * - Runtime state and build artifacts (.next/, .next-dev/, .next-dev-server.json)
 * - Accidental runtime data file modifications (e.g. data/analytics-events.json)
 * - Temporary screenshots/reports outside ignored or allowed directories
 * - Unexpected large binary files (> 1MB)
 *
 * NEVER prints secret contents. Only reports paths.
 * NEVER deletes or modifies files.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');

function runGit(command) {
  try {
    return execSync(command, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // If git command fails (e.g., base branch not found locally), return empty
    return '';
  }
}

// Allowed exceptions for environment example templates
const ALLOWED_ENV_PATTERNS = [
  /^\.env\.example$/i,
  /^\.env\.template$/i,
];

// Patterns strictly considered dangerous or unapproved for commits
const SUSPICIOUS_PATTERNS = [
  {
    name: 'Environment / Secrets File',
    test: (filePath) => {
      const fileName = path.basename(filePath);
      if (/^\.env(\..+)?$/i.test(fileName)) {
        return !ALLOWED_ENV_PATTERNS.some((pattern) => pattern.test(fileName));
      }
      return false;
    },
  },
  {
    name: 'Private Key / Certificate',
    test: (filePath) => {
      const fileName = path.basename(filePath);
      return /\.(pem|key|p12|pfx|pkcs12|kdbx)$/i.test(fileName) ||
             /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i.test(fileName);
    },
  },
  {
    name: 'Credentials / Service Account JSON',
    test: (filePath) => {
      const fileName = path.basename(filePath);
      return /^(credentials.*|service-?account.*|client_secret.*)\.json$/i.test(fileName);
    },
  },
  {
    name: 'Build / Dev Server Runtime Artifact',
    test: (filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      return normalized === '.next' ||
             normalized.startsWith('.next/') ||
             normalized === '.next-dev' ||
             normalized.startsWith('.next-dev/') ||
             normalized === '.next-dev-server.json' ||
             normalized.endsWith('.pid') ||
             normalized.startsWith('test-results/') ||
             normalized.startsWith('playwright-report/') ||
             normalized.startsWith('.hostinger/') ||
             normalized.startsWith('out/');
    },
  },
  {
    name: 'Accidental Analytics Event Mutation',
    test: (filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      return normalized === 'data/analytics-events.json';
    },
  },
  {
    name: 'Unorganized Screenshot / Media Dump',
    test: (filePath) => {
      const normalized = filePath.replace(/\\/g, '/');
      // Media files should be under public/, scripts/demo/assets, or ignored directories (artifacts/phase3-qa)
      if (/\.(png|jpg|jpeg|webp|gif|mp4)$/i.test(normalized)) {
        const isAllowed = normalized.startsWith('public/') ||
                          normalized.startsWith('scripts/demo/assets/') ||
                          normalized.startsWith('artifacts/');
        return !isAllowed;
      }
      return false;
    },
  },
];

const MAX_BINARY_SIZE_BYTES = 1024 * 1024; // 1 MB

function getWorkingTreeFiles() {
  const statusOutput = runGit('git -c core.quotepath=false status --porcelain=v1 -uall');
  if (!statusOutput) return [];

  const files = [];
  const lines = statusOutput.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Format: XY PATH or XY "PATH" or R  old -> new
    const filePath = trimmed.slice(2).trim().replace(/^"|"$/g, '');
    if (filePath.includes(' -> ')) {
      const parts = filePath.split(' -> ');
      for (const part of parts) {
        const cleanPart = part.trim().replace(/^"|"$/g, '');
        files.push({
          path: cleanPart,
          status: trimmed.slice(0, 2),
          source: 'working-tree',
        });
      }
      continue;
    }

    files.push({
      path: filePath,
      status: trimmed.slice(0, 2),
      source: 'working-tree',
    });
  }
  return files;
}

function getBranchChangedFiles() {
  // Determine base ref to compare against: prefer origin/b3/foundation, fallback to b3/foundation
  let baseRef = 'origin/b3/foundation';
  const hasOriginBase = runGit('git rev-parse --verify origin/b3/foundation');
  if (!hasOriginBase) {
    baseRef = 'b3/foundation';
  }

  const diffOutput = runGit(`git -c core.quotepath=false diff --name-only ${baseRef}...HEAD`);
  if (!diffOutput) return [];

  return diffOutput.split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((filePath) => ({
      path: filePath,
      status: 'COMMITTED',
      source: 'branch-diff',
    }));
}

function checkFileForLargeBinary(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  try {
    if (fs.existsSync(fullPath)) {
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && stat.size > MAX_BINARY_SIZE_BYTES) {
        // Allow specific existing large fixtures if any
        if (relPath.includes('traineddata') || relPath.startsWith('public/demo/')) {
          return null;
        }
        return {
          path: relPath,
          sizeMb: (stat.size / (1024 * 1024)).toFixed(2),
        };
      }
    }
  } catch {
    // File might have been deleted
  }
  return null;
}

function main() {
  console.log('Running LokSwami B3 Scope & Secret Safety Check (READ-ONLY)...\n');

  const workingTreeFiles = getWorkingTreeFiles();
  const branchFiles = getBranchChangedFiles();

  // Combine and deduplicate
  const allFilesMap = new Map();
  for (const item of [...branchFiles, ...workingTreeFiles]) {
    allFilesMap.set(item.path, item);
  }

  const violations = [];
  const largeBinaryWarnings = [];

  for (const [filePath, fileInfo] of allFilesMap.entries()) {
    // Check against suspicious patterns
    for (const rule of SUSPICIOUS_PATTERNS) {
      if (rule.test(filePath)) {
        violations.push({
          rule: rule.name,
          path: filePath,
          source: fileInfo.source,
        });
      }
    }

    // Check file size
    const large = checkFileForLargeBinary(filePath);
    if (large) {
      largeBinaryWarnings.push(large);
    }
  }

  console.log(`Inspected ${allFilesMap.size} modified, untracked, or branch-changed files.`);

  let hasErrors = false;

  if (violations.length > 0) {
    hasErrors = true;
    console.error('\n[!] SCOPE / SECRET SAFETY VIOLATIONS DETECTED:');
    console.error('The following paths violate repository safety or hygiene guidelines:');
    for (const v of violations) {
      console.error(`  - [${v.rule}] ${v.path} (${v.source})`);
    }
    console.error('\nRemediation instructions:');
    console.error('  1. Do NOT commit secrets or local environment files (.env, credentials.json).');
    console.error('  2. For accidental runtime mutations (e.g. data/analytics-events.json), revert with:');
    console.error('     git restore data/analytics-events.json');
    console.error('  3. Ensure build artifacts (.next/, .next-dev/) are placed in .gitignore and not staged.');
    console.error('  4. Move temporary browser screenshots to artifacts/phase3-qa/ (which is gitignored).\n');
  }

  if (largeBinaryWarnings.length > 0) {
    console.warn('\n[?] LARGE BINARY FILE WARNINGS (> 1MB):');
    for (const w of largeBinaryWarnings) {
      console.warn(`  - ${w.path} (${w.sizeMb} MB)`);
    }
    console.warn('  Ensure large files are intentional and appropriate for git tracking.\n');
  }

  if (hasErrors) {
    console.error('FAIL: Scope safety check failed. Please resolve the above issues.');
    process.exit(1);
  }

  console.log('PASS: Scope & secrets safety check passed. No dangerous or unexpected artifacts found.');
}

function inspectPaths(filePaths) {
  const violations = [];
  for (const filePath of filePaths) {
    for (const rule of SUSPICIOUS_PATTERNS) {
      if (rule.test(filePath)) {
        violations.push({
          rule: rule.name,
          path: filePath,
        });
      }
    }
  }
  return violations;
}

if (require.main === module) {
  main();
}

module.exports = {
  SUSPICIOUS_PATTERNS,
  ALLOWED_ENV_PATTERNS,
  inspectPaths,
  checkFileForLargeBinary,
  main,
};
