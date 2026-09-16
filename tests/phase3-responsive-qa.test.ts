import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, spawnSync, ExecFileException } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CANONICAL_VIEWPORTS, artifactsDir, checkServerAvailable, runResponsiveQA } = require('../scripts/phase3/responsive-qa.js');

const projectRoot = path.resolve(__dirname, '..');
const analyticsPath = path.join(projectRoot, 'data', 'analytics-events.json');

function runScriptAsync(args: string[], env: NodeJS.ProcessEnv): Promise<{ status: number; stdout: string; stderr: string }> {
  const runnerPath = path.join(projectRoot, 'scripts', 'phase3', 'responsive-qa.js');
  return new Promise((resolve) => {
    execFile(process.execPath, [runnerPath, ...args], { cwd: projectRoot, encoding: 'utf8', env }, (err: ExecFileException | null, stdout: string, stderr: string) => {
      const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolve({
        status: exitCode,
        stdout: stdout || '',
        stderr: stderr || '',
      });
    });
  });
}

describe('B3 Development Accelerator v1 — Responsive QA Runner Validation', () => {
  let initialAnalyticsContent: string | null = null;
  let testServer: http.Server;
  let testServerBaseUrl: string;
  let closedPortUrl: string;

  beforeAll(async () => {
    if (fs.existsSync(analyticsPath)) {
      initialAnalyticsContent = fs.readFileSync(analyticsPath, 'utf8');
    }

    // Start a lightweight ephemeral HTTP server for deterministic CI testing
    testServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>LokSwami QA</title></head><body style="margin:0;padding:0;"><main style="margin:0;padding:0;"><h1>LokSwami</h1></main></body></html>');
    });

    await new Promise<void>((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        const addr = testServer.address();
        if (addr && typeof addr === 'object') {
          testServerBaseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });

    // Allocate and immediately close a server to get a guaranteed unreachable ephemeral port
    const closedServer = http.createServer();
    await new Promise<void>((resolve) => {
      closedServer.listen(0, '127.0.0.1', () => {
        const addr = closedServer.address();
        if (addr && typeof addr === 'object') {
          closedPortUrl = `http://127.0.0.1:${addr.port}`;
        }
        closedServer.close(() => resolve());
      });
    });
  });

  afterAll(async () => {
    if (initialAnalyticsContent !== null && fs.existsSync(analyticsPath)) {
      fs.writeFileSync(analyticsPath, initialAnalyticsContent, 'utf8');
    }

    if (testServer) {
      await new Promise<void>((resolve) => {
        testServer.close(() => resolve());
      });
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
    it('detects live server on active HTTP endpoint', async () => {
      const isUp = await checkServerAvailable(testServerBaseUrl, '/main');
      expect(isUp).toBe(true);
    });

    it('returns false for unreachable port safely without throwing', async () => {
      const isUp = await checkServerAvailable(closedPortUrl, '/main');
      expect(isUp).toBe(false);
    });

    it('fails fast with exit code 1 and clear message when target server is unreachable', () => {
      const runnerPath = path.join(projectRoot, 'scripts', 'phase3', 'responsive-qa.js');
      const result = spawnSync(process.execPath, [runnerPath, '--base-url', closedPortUrl], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: { ...process.env, B3_QA_BASE_URL: closedPortUrl },
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
        env: { ...process.env, B3_QA_BASE_URL: closedPortUrl },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(closedPortUrl);
    });
  });

  describe('Reporting Format & Metric Verification', () => {
    it('executes against /main and reports all required metrics per viewport', async () => {
      const result = await runScriptAsync(['--routes', '/main'], {
        ...process.env,
        B3_QA_BASE_URL: testServerBaseUrl,
      });

      expect(result.status).toBe(0);
      const stdout = result.stdout;

      // Header verification
      expect(stdout).toMatch(/LokSwami B3 — Standard Responsive QA Runner/i);
      expect(stdout).toMatch(new RegExp(`Base URL:\\s+${testServerBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
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

    it('executes programmatically via runResponsiveQA and returns structured metrics', async () => {
      const { results, totalFailures } = await runResponsiveQA({
        baseUrl: testServerBaseUrl,
        routes: ['/main'],
        captureScreenshots: false,
        throwOnFailure: false,
      });

      expect(totalFailures).toBe(0);
      expect(results.length).toBe(9);

      for (const item of results) {
        expect(item.route).toBe('/main');
        expect(typeof item.viewport).toBe('number');
        expect(item.status).toBe(200);
        expect(item.loadResult).toBe('HTTP 200');
        expect(item.passed).toBe(true);
        expect(Array.isArray(item.pageErrors)).toBe(true);
        expect(Array.isArray(item.consoleErrors)).toBe(true);
        expect(item.metrics.innerWidth).toBe(item.viewport);
        expect(item.metrics.scrollWidth).toBeLessThanOrEqual(item.viewport);
        expect(item.metrics.overflow).toBe(false);
      }
    }, 60000);
  });
});
