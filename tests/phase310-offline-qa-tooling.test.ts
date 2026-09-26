import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const guardPath = path.join(projectRoot, 'scripts', 'phase3', 'offline-network-guard.cjs');
const launcherPath = path.join(projectRoot, 'scripts', 'phase3', 'phase310-offline-qa-launcher.cjs');
const runnerPath = path.join(projectRoot, 'scripts', 'phase3', 'phase310-offline-browser-qa.cjs');

function read(filePath: string) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

describe('Phase 3.10E offline QA tooling', () => {
  it('blocks external Node networking before socket establishment', () => {
    const result = spawnSync(
      process.execPath,
      ['--require', guardPath, '-e', "require('https').get('https://example.com')"],
      { cwd: projectRoot, encoding: 'utf8', timeout: 5_000 }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('BLOCKED_OFFLINE_QA_EGRESS');
    expect(result.stderr).toContain('OFFLINE_QA_EGRESS_BLOCKED');
  });

  it('stubs only the known Next version check without opening external sockets', () => {
    const result = spawnSync(
      process.execPath,
      ['--require', guardPath, '-e', "fetch('https://registry.npmjs.org/-/package/next/dist-tags').then(r=>r.json()).then(v=>{if(!v.latest)process.exit(2)})"],
      { cwd: projectRoot, encoding: 'utf8', timeout: 5_000 }
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('OFFLINE_QA_LOCAL_STUB service=next-version-check');
    expect(result.stderr).not.toContain('BLOCKED_OFFLINE_QA_EGRESS');
  });

  it('limits the runtime to synthetic auth, loopback Mongo, and disabled providers', () => {
    const launcher = read(launcherPath);
    expect(launcher).not.toContain('start-next-dev');
    expect(launcher).not.toContain('loadStagingEnvFiles');
    expect(launcher).toContain("ADMIN_LOGIN_ID: 'qa.phase310'");
    expect(launcher).toContain("ADMIN_EMAIL: 'qa.phase310@lokswami.local'");
    expect(launcher).toContain('mongodb://127.0.0.1:1/lokswami_offline_qa');
    expect(launcher).toContain("SOCIAL_AUTOMATION_PROVIDER: 'manual'");
    expect(launcher).toContain("RESEND_API_KEY: ''");
    expect(launcher).toContain("NEXT_TELEMETRY_DISABLED: '1'");
    expect(launcher).toContain('NODE_OPTIONS: `--require=${guardPath}`');
  });

  it('rejects redirects and missing protected headings in the authenticated runner', () => {
    const runner = read(runnerPath);
    expect(runner).toContain('finalPath === routeConfig.path');
    expect(runner).toContain("getByRole('heading', { name: routeConfig.heading, exact: true })");
    expect(runner).toContain('browserExternalAttempts');
    expect(runner).toContain('consoleErrors.length');
    expect(runner).toContain('pageErrors.length');
    expect(runner).toContain("'/admin/operations-diagnostics'");
  });
});
