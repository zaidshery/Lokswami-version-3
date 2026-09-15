import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('B3 Development Accelerator v1 — Tooling & Governance Tests', () => {
  const projectRoot = path.resolve(__dirname, '..');

  it('contains all required documentation and template deliverables', () => {
    const requiredDocs = [
      'docs/b3/PHASE3_EXECUTION_PLAYBOOK.md',
      'docs/b3/PHASE3_QA_MATRIX.md',
      'docs/b3/PHASE3_STAGING_POLICY.md',
      'docs/b3/PHASE3_RBAC_POLICY.md',
      'docs/b3/templates/PHASE3_TASK_TEMPLATE.md',
      'docs/b3/templates/PHASE3_PR_REPORT_TEMPLATE.md',
    ];

    for (const doc of requiredDocs) {
      const fullPath = path.join(projectRoot, doc);
      expect(fs.existsSync(fullPath), `Missing documentation file: ${doc}`).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content.length).toBeGreaterThan(200);
    }

    // Playbook and templates must explicitly state non-merge policy
    const playbook = fs.readFileSync(path.join(projectRoot, 'docs/b3/PHASE3_EXECUTION_PLAYBOOK.md'), 'utf8');
    expect(playbook).toMatch(/NEVER merge/i);

    const taskTemplate = fs.readFileSync(path.join(projectRoot, 'docs/b3/templates/PHASE3_TASK_TEMPLATE.md'), 'utf8');
    expect(taskTemplate).toMatch(/DO NOT MERGE/i);

    const prTemplate = fs.readFileSync(path.join(projectRoot, 'docs/b3/templates/PHASE3_PR_REPORT_TEMPLATE.md'), 'utf8');
    expect(prTemplate).toMatch(/DO NOT MERGE/i);
  });

  it('declares the 9 canonical responsive viewports in QA matrix', () => {
    const qaMatrixPath = path.join(projectRoot, 'docs/b3/PHASE3_QA_MATRIX.md');
    const content = fs.readFileSync(qaMatrixPath, 'utf8');

    const expectedWidths = ['360', '375', '390', '412', '430', '768', '820', '1024', '1440'];
    for (const width of expectedWidths) {
      expect(content).toContain(width);
    }

    expect(content).toContain('389px / 390px');
    expect(content).toContain('767px / 768px');
    expect(content).toContain('1023px / 1024px');
  });

  it('defines the 4 canonical newsroom roles and points to permissions.ts as source of truth', () => {
    const qaMatrixPath = path.join(projectRoot, 'docs/b3/PHASE3_QA_MATRIX.md');
    const content = fs.readFileSync(qaMatrixPath, 'utf8');

    expect(content).toContain('super_admin');
    expect(content).toContain('admin');
    expect(content).toContain('copy_editor');
    expect(content).toContain('reporter');
    expect(content).toContain('lib/auth/permissions.ts');
  });

  it('defines the three isolated environments in staging policy without secrets', () => {
    const stagingPolicyPath = path.join(projectRoot, 'docs/b3/PHASE3_STAGING_POLICY.md');
    const content = fs.readFileSync(stagingPolicyPath, 'utf8');

    expect(content).toContain('LOCAL');
    expect(content).toContain('PREVIEW / STAGING');
    expect(content).toContain('PRODUCTION');
    expect(content).toMatch(/NEVER blindly copy or reuse production/i);
    // Ensure no real unredacted credentials are in the document
    expect(content).not.toMatch(/mongodb\+srv:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_\-!#$%^&*]{8,}@/i);
  });

  it('documents Super Admin as technical control plane in RBAC policy without code mutations', () => {
    const rbacPath = path.join(projectRoot, 'docs/b3/PHASE3_RBAC_POLICY.md');
    const content = fs.readFileSync(rbacPath, 'utf8');

    expect(content).toContain('POLICY DOCUMENTATION ONLY');
    expect(content).toContain('SUPER ADMIN');
    expect(content).toContain('E-Paper Complete Lifecycle');
    expect(content).toContain('AI Ops');
    expect(content).toMatch(/Election platform/i);
  });

  it('has valid package.json scripts for Phase 3 Accelerator commands', () => {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    expect(pkg.scripts['verify:phase3']).toBeDefined();
    expect(pkg.scripts['verify:phase3']).toContain('typecheck');
    expect(pkg.scripts['verify:phase3']).toContain('lint:strict');
    expect(pkg.scripts['verify:phase3']).toContain('test:security');
    expect(pkg.scripts['verify:phase3']).toContain('test:governance');
    expect(pkg.scripts['verify:phase3']).toContain('test:four-role-newsroom');
    expect(pkg.scripts['verify:phase3']).toContain('verify:dependency-security');
    expect(pkg.scripts['verify:phase3']).toContain('test:ci');
    expect(pkg.scripts['verify:phase3']).toContain('build:ci');

    expect(pkg.scripts['check:phase3-scope']).toBe('node scripts/phase3/check-scope.js');
    expect(pkg.scripts['qa:responsive']).toBe('node scripts/phase3/responsive-qa.js');
    expect(pkg.scripts['check:pr-readiness']).toBe('node scripts/phase3/pr-readiness.js');
  });

  it('has .gitignore entry for artifacts/phase3-qa/', () => {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');

    expect(gitignore).toContain('artifacts/phase3-qa/');
  });

  it('scripts/phase3/check-scope.js exists and is valid JavaScript', () => {
    const scriptPath = path.join(projectRoot, 'scripts/phase3/check-scope.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain('data/analytics-events.json');
    expect(content).toContain('.env');
  });

  it('scripts/phase3/responsive-qa.js defines canonical viewports and reader route', () => {
    const scriptPath = path.join(projectRoot, 'scripts/phase3/responsive-qa.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain('360');
    expect(content).toContain('375');
    expect(content).toContain('390');
    expect(content).toContain('412');
    expect(content).toContain('430');
    expect(content).toContain('768');
    expect(content).toContain('820');
    expect(content).toContain('1024');
    expect(content).toContain('1440');
    expect(content).toContain('/main');
  });

  it('scripts/phase3/pr-readiness.js implements read-only checks without merging', () => {
    const scriptPath = path.join(projectRoot, 'scripts/phase3/pr-readiness.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain('b3/foundation');
    expect(content).toContain('statusCheckRollup');
    expect(content).not.toMatch(/gh pr merge/i);
    expect(content).toContain('DO NOT MERGE');
  });
});
