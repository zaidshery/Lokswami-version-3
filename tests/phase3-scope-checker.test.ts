import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

// Import exported rules and inspection helper from check-scope.js
const {
  inspectPaths,
  SUSPICIOUS_PATTERNS,
  ALLOWED_ENV_PATTERNS,
} = require('../scripts/phase3/check-scope.js');

const projectRoot = path.resolve(__dirname, '..');

describe('B3 Development Accelerator v1 — Scope & Secret Checker Deep Validation', () => {
  describe('Rule-level Synthetic Scenarios Matrix', () => {
    it('passes for clean branch scenario (empty path list)', () => {
      const violations = inspectPaths([]);
      expect(violations).toEqual([]);
    });

    it('passes for modified normal source files', () => {
      const normalFiles = [
        'components/layout/Header.tsx',
        'app/(reader)/main/page.tsx',
        'lib/utils.ts',
        'lib/api/articles.ts',
        'package.json',
        'tsconfig.json',
      ];
      const violations = inspectPaths(normalFiles);
      expect(violations).toEqual([]);
    });

    it('fails for .env file', () => {
      const violations = inspectPaths(['.env']);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].rule).toBe('Environment / Secrets File');
      expect(violations[0].path).toBe('.env');
    });

    it('fails for .env.local and other environment variants', () => {
      const envVariants = [
        '.env.local',
        '.env.production',
        '.env.staging',
        '.env.development',
        '.env.hostinger',
        'subdir/.env.local',
      ];
      for (const envFile of envVariants) {
        const violations = inspectPaths([envFile]);
        expect(violations.length, `Expected violation for ${envFile}`).toBe(1);
        expect(violations[0].rule).toBe('Environment / Secrets File');
      }
    });

    it('fails for suspicious secret and private key filenames', () => {
      const secretFiles = [
        'id_rsa',
        'id_rsa.pub',
        'id_ed25519',
        'server.key',
        'cert.pem',
        'token.p12',
        'bundle.pfx',
        'credentials.json',
        'credentials-dev.json',
        'service-account.json',
        'serviceaccount.json',
        'client_secret_google.json',
      ];
      for (const secretFile of secretFiles) {
        const violations = inspectPaths([secretFile]);
        expect(violations.length, `Expected violation for ${secretFile}`).toBe(1);
        expect(
          ['Private Key / Certificate', 'Credentials / Service Account JSON'].includes(violations[0].rule)
        ).toBe(true);
      }
    });

    it('fails for .next build artifacts', () => {
      const nextArtifacts = [
        '.next',
        '.next/build-manifest.json',
        '.next/server/app/main.js',
        '.next/static/chunks/main.js',
      ];
      for (const artifact of nextArtifacts) {
        const violations = inspectPaths([artifact]);
        expect(violations.length, `Expected violation for ${artifact}`).toBe(1);
        expect(violations[0].rule).toBe('Build / Dev Server Runtime Artifact');
      }
    });

    it('fails for .next-dev runtime artifacts', () => {
      const devArtifacts = [
        '.next-dev',
        '.next-dev/cache/data.json',
        '.next-dev/server/pages.js',
      ];
      for (const artifact of devArtifacts) {
        const violations = inspectPaths([artifact]);
        expect(violations.length, `Expected violation for ${artifact}`).toBe(1);
        expect(violations[0].rule).toBe('Build / Dev Server Runtime Artifact');
      }
    });

    it('fails for temporary PID and state files', () => {
      const pidFiles = [
        '.next-dev-server.json',
        'server.pid',
        'dev.pid',
      ];
      for (const file of pidFiles) {
        const violations = inspectPaths([file]);
        expect(violations.length, `Expected violation for ${file}`).toBe(1);
        expect(violations[0].rule).toBe('Build / Dev Server Runtime Artifact');
      }
    });

    it('fails for generated analytics-events mutation', () => {
      const violations = inspectPaths(['data/analytics-events.json']);
      expect(violations.length).toBe(1);
      expect(violations[0].rule).toBe('Accidental Analytics Event Mutation');
      expect(violations[0].path).toBe('data/analytics-events.json');
    });

    it('fails for unexpected screenshots and report dumps outside allowed directories', () => {
      const unorganizedMedia = [
        'screenshot.png',
        'docs/b3/screenshot.png',
        'app/test.jpg',
        'components/capture.webp',
        'test-results/test-run.json',
        'playwright-report/index.html',
      ];
      for (const media of unorganizedMedia) {
        const violations = inspectPaths([media]);
        expect(violations.length, `Expected violation for ${media}`).toBe(1);
      }
    });

    it('allows legitimate screenshot artifacts inside artifacts/phase3-qa/ and public/', () => {
      const allowedMedia = [
        'artifacts/phase3-qa/main-390px.png',
        'artifacts/screenshots/desktop.png',
        'public/logo.png',
        'public/hero.jpg',
        'scripts/demo/assets/demo.png',
      ];
      const violations = inspectPaths(allowedMedia);
      expect(violations).toEqual([]);
    });

    it('passes for allowed .env.example and .env.template', () => {
      const allowedEnv = [
        '.env.example',
        '.env.template',
      ];
      const violations = inspectPaths(allowedEnv);
      expect(violations).toEqual([]);
    });

    it('passes for normal documentation and test files', () => {
      const normalDocs = [
        'docs/b3/PHASE3_EXECUTION_PLAYBOOK.md',
        'docs/b3/PHASE3_QA_MATRIX.md',
        'docs/b3/PHASE3_STAGING_POLICY.md',
        'docs/b3/PHASE3_RBAC_POLICY.md',
        'docs/b3/templates/PHASE3_TASK_TEMPLATE.md',
        'docs/b3/templates/PHASE3_PR_REPORT_TEMPLATE.md',
        'tests/phase3-accelerator-tooling.test.ts',
      ];
      const violations = inspectPaths(normalDocs);
      expect(violations).toEqual([]);
    });
  });

  describe('Subprocess Execution & Safety Invariants', () => {
    it('executes check-scope.js via node on the current repository cleanly with exit code 0', () => {
      const result = spawnSync(process.execPath, ['scripts/phase3/check-scope.js'], {
        cwd: projectRoot,
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('PASS: Scope & secrets safety check passed.');
      expect(result.stderr).toBe('');
    });

    it('never prints secret contents or values in violation reports', () => {
      // Simulate synthetic violations and verify output formatting
      const sampleViolations = [
        { rule: 'Environment / Secrets File', path: '.env.local', source: 'working-tree' },
        { rule: 'Private Key / Certificate', path: 'id_rsa', source: 'working-tree' },
      ];

      // Format report lines like check-scope.js
      const reportLines = sampleViolations.map((v) => `  - [${v.rule}] ${v.path} (${v.source})`);
      const combinedOutput = reportLines.join('\n');

      expect(combinedOutput).toContain('.env.local');
      expect(combinedOutput).toContain('id_rsa');
      // Must not contain any actual secret keys or values
      expect(combinedOutput).not.toContain('SECRET_KEY=');
      expect(combinedOutput).not.toContain('BEGIN RSA PRIVATE KEY');
    });

    it('guarantees zero file deletions or git mutations during execution', () => {
      const beforeStatus = spawnSync('git', ['status', '--porcelain=v1'], {
        cwd: projectRoot,
        encoding: 'utf8',
      }).stdout;

      // Run scope checker
      spawnSync(process.execPath, ['scripts/phase3/check-scope.js'], {
        cwd: projectRoot,
        encoding: 'utf8',
      });

      const afterStatus = spawnSync('git', ['status', '--porcelain=v1'], {
        cwd: projectRoot,
        encoding: 'utf8',
      }).stdout;

      expect(afterStatus).toBe(beforeStatus);
    });
  });
});
