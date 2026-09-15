import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CANONICAL_VIEWPORTS, artifactsDir, checkServerAvailable } = require('../scripts/phase3/responsive-qa.js');

const projectRoot = path.resolve(__dirname, '..');
const analyticsPath = path.join(projectRoot, 'data', 'analytics-events.json');

describe('B3 Development Accelerator v1 — Responsive QA Runner Validation', () => {
  let initialAnalyticsContent: string | null = null;

  beforeAll(() => {
    if (fs.existsSync(analyticsPath)) {
      initialAnalyticsContent = fs.readFileSync(analyticsPath, 'utf8');
    }
  });

  afterAll(() => {
    if (initialAnalyticsContent !== null && fs.existsSync(analyticsPath)) {
      fs.writeFileSync(analyticsPath, initialAnalyticsContent, 'utf8');
    }
  });

  describe('Canonical Viewport Definitions', () => {
    it('defines all 9 canonical viewports required by Phase 3 specification', () => {
      const expectedWidths = [360, 375, 390, 412, 430, 768, 820, 1024, 1440];
      const actualWidths = CANONICAL_VIEWPORTS.map((v: { width: number }) => v.width);

      expect(actualWidths).toEqual(expectedWidths);
    });

    it('provides valid dimensions and labels for each viewport', () => {
      for (const vp of CANONICAL_VIEWPORTS) {
        expect(vp.width).toBeGreaterThan(0);
        expect(vp.height).toBeGreaterThan(0);
        expect(typeof vp.label).toBe('string');
        expect(vp.label.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Server Availability & Error Handling', () => {
    it('detects live server on 127.0.0.1:3000', async () => {
      const isUp = await checkServerAvailable('http://127.0.0.1:3000', '/main');
      expect(isUp).toBe(true);
    });

    it('returns false for unreachable port safely without throwing', async () => {
      const isUp = await checkServerAvailable('http://127.0.0.1:59999', '/main');
      expect(isUp).toBe(false);
    });

    it('fails fast with exit code 1 and clear message when target server is unreachable', () => {
      const runnerPath = path.join(projectRoot, 'scripts', 'phase3', 'responsive-qa.js');
      const result = spawnSync(process.execPath, [runnerPath, '--base-url', 'http://127.0.0.1:59999'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, B3_QA_BASE_URL: 'http://127.0.0.1:59999' },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/ERROR: Target server is not reachable/i);
      expect(result.stderr).toMatch(/npm run dev/i);
      expect(result.stderr).toMatch(/--base-url/i);
      expect(result.stderr).toMatch(/B3_QA_BASE_URL/i);
    });
  });

  describe('Artifact Directory Governance', () => {
    it('targets strictly the approved gitignored artifacts/phase3-qa directory', () => {
      const expectedDir = path.join(projectRoot, 'artifacts', 'phase3-qa');
      expect(artifactsDir).toBe(expectedDir);

      // Verify .gitignore includes this exact directory
      const gitignore = fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8');
      expect(gitignore).toMatch(/artifacts\/phase3-qa\//);
    });
  });

  describe('B3_QA_BASE_URL Environment Variable Override', () => {
    it('respects B3_QA_BASE_URL when targeting unreachable URL', () => {
      const runnerPath = path.join(projectRoot, 'scripts', 'phase3', 'responsive-qa.js');
      const result = spawnSync(process.execPath, [runnerPath], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, B3_QA_BASE_URL: 'http://127.0.0.1:58888' },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/http:\/\/127\.0\.0\.1:58888/);
    });
  });

  describe('Reporting Format & Metric Verification', () => {
    it('executes against /main and reports all required metrics per viewport', () => {
      const runnerPath = path.join(projectRoot, 'scripts', 'phase3', 'responsive-qa.js');
      const result = spawnSync(process.execPath, [runnerPath, '--routes', '/main'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, B3_QA_BASE_URL: 'http://127.0.0.1:3000' },
      });

      expect(result.status).toBe(0);
      const stdout = result.stdout;

      // Header verification
      expect(stdout).toMatch(/LokSwami B3 — Standard Responsive QA Runner/i);
      expect(stdout).toMatch(/Base URL:\s+http:\/\/127\.0\.0\.1:3000/i);
      expect(stdout).toMatch(/Routes:\s+\/main/i);

      // Required reported items per specification:
      // - route
      expect(stdout).toMatch(/Route:\s+\/main/i);
      // - viewport
      expect(stdout).toMatch(/Viewport:\s+390px/i);
      expect(stdout).toMatch(/Viewport:\s+1440px/i);
      // - load result
      expect(stdout).toMatch(/Load:\s+HTTP 200/i);
      // - browser console/page errors
      expect(stdout).toMatch(/Errors \(console:\s+\d+,\s+page:\s+\d+\)/i);
      // - innerWidth
      expect(stdout).toMatch(/innerWidth:\s+\d+px/i);
      // - scrollWidth
      expect(stdout).toMatch(/scrollWidth:\s+\d+px/i);
      // - horizontal overflow
      expect(stdout).toMatch(/Overflow:\s+None/i);

      // Summary verification
      expect(stdout).toMatch(/Responsive QA Summary:\s+9\/9 PASSED/i);
      expect(stdout).toMatch(/PASS: All canonical viewports validated with zero horizontal overflow/i);
    }, 60000);
  });
});
