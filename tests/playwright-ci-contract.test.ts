// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readConfig(ci: boolean, baseURL = '') {
  return JSON.parse(execFileSync(process.execPath, [
    '--input-type=module', '-e',
    "import config from './playwright.config.mjs'; process.stdout.write(JSON.stringify(config));",
  ], {
    cwd: process.cwd(),
    env: { ...process.env, CI: ci ? 'true' : '', PLAYWRIGHT_BASE_URL: baseURL },
    encoding: 'utf8',
  }));
}

describe('critical browser CI contract', () => {
  it('starts its own production server in CI and rejects focused tests', () => {
    const config = readConfig(true);
    expect(config.forbidOnly).toBe(true);
    expect(config.webServer.command).toBe('npm run start:next');
    expect(config.webServer.reuseExistingServer).toBe(false);
  });

  it('preserves local development server reuse', () => {
    const config = readConfig(false);
    expect(config.forbidOnly).toBe(false);
    expect(config.webServer.command).toBe('npm run dev');
    expect(config.webServer.reuseExistingServer).toBe(true);
  });

  it('uses an explicitly supplied deployment URL without spawning a local server', () => {
    const config = readConfig(true, 'https://example.test');
    expect(config.use.baseURL).toBe('https://example.test');
    expect(config.webServer).toBeUndefined();
  });

  it('runs the critical smoke suite only after a successful production build', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow.indexOf('run: npm run build:ci')).toBeLessThan(
      workflow.indexOf('run: npx playwright test tests/e2e/admin-critical-flows.spec.js'),
    );
    expect(workflow).toContain('run: npx playwright test tests/e2e/admin-critical-flows.spec.js');
    expect(workflow).not.toContain('continue-on-error: true');
  });
});
