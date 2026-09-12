import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCmsQaEnvironmentSafe,
  CMS_QA_IDENTITIES,
  isClearlyReservedCmsQaAccount,
} from '@/scripts/cms-qa/safety';
import { canViewPage } from '@/lib/auth/permissions';

const PASSWORD_ENV = Object.fromEntries(
  CMS_QA_IDENTITIES.map((identity) => [identity.passwordEnv, 'local-only-password'])
);

function safeEnv(
  overrides: Record<string, string | undefined> = {}
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    LOKSWAMI_CMS_QA: 'true',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/lokswami_cms_qa',
    LOKSWAMI_CMS_QA_DB_NAME: 'lokswami_cms_qa',
    ...PASSWORD_ENV,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('CMS QA provisioning safety', () => {
  it('defines only the exact reserved identities and canonical roles', () => {
    expect(CMS_QA_IDENTITIES.map(({ email, role }) => ({ email, role }))).toEqual([
      { email: 'qa-super-admin@localhost.example', role: 'super_admin' },
      { email: 'qa-admin@localhost.example', role: 'admin' },
      { email: 'qa-copy-editor@localhost.example', role: 'copy_editor' },
      { email: 'qa-reporter@localhost.example', role: 'reporter' },
    ]);
  });

  it('requires explicit opt-in and always refuses production', () => {
    expect(() => assertCmsQaEnvironmentSafe(safeEnv({ LOKSWAMI_CMS_QA: undefined }))).toThrow(
      /LOKSWAMI_CMS_QA=true/
    );
    expect(() => assertCmsQaEnvironmentSafe(safeEnv({ NODE_ENV: 'production' }))).toThrow(
      /prohibited.*production/i
    );
  });

  it('allows only loopback MongoDB with an exact non-production database confirmation', () => {
    expect(() => assertCmsQaEnvironmentSafe(safeEnv())).not.toThrow();
    expect(() =>
      assertCmsQaEnvironmentSafe(
        safeEnv({ MONGODB_URI: 'mongodb://db.example.com:27017/lokswami_cms_qa' })
      )
    ).toThrow(/loopback-only/i);
    expect(() =>
      assertCmsQaEnvironmentSafe(safeEnv({ LOKSWAMI_CMS_QA_DB_NAME: 'another_qa' }))
    ).toThrow(/does not match/i);
    expect(() =>
      assertCmsQaEnvironmentSafe(
        safeEnv({
          MONGODB_URI: 'mongodb://localhost:27017/lokswami_prod',
          LOKSWAMI_CMS_QA_DB_NAME: 'lokswami_prod',
        })
      )
    ).toThrow(/non-production database name/i);
  });

  it('requires all four passwords and enforces the minimum without echoing values', () => {
    expect(() =>
      assertCmsQaEnvironmentSafe(safeEnv({ LOKSWAMI_QA_REPORTER_PASSWORD: undefined }))
    ).toThrow(/LOKSWAMI_QA_REPORTER_PASSWORD/);

    const secret = 'too-short';
    expect(() =>
      assertCmsQaEnvironmentSafe(safeEnv({ LOKSWAMI_QA_ADMIN_PASSWORD: secret }))
    ).toThrow(/at least 12 characters/);
    try {
      assertCmsQaEnvironmentSafe(safeEnv({ LOKSWAMI_QA_ADMIN_PASSWORD: secret }));
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it('refuses an exact-email collision unless the account has the reserved QA identity', () => {
    const identity = CMS_QA_IDENTITIES[1];
    expect(
      isClearlyReservedCmsQaAccount(
        { email: identity.email, loginId: identity.loginId, name: identity.name },
        identity
      )
    ).toBe(true);
    expect(
      isClearlyReservedCmsQaAccount(
        { email: identity.email, loginId: 'real-admin', name: 'Existing Admin' },
        identity
      )
    ).toBe(false);
  });

  it('does not embed password values or log password variables in the provisioner', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'scripts/cms-qa/provision.ts'),
      'utf8'
    );
    expect(source).not.toContain('local-only-password');
    expect(source).not.toMatch(/console\.(?:log|info|error)\([^\n]*(?:passwordHash|readCmsQaPassword)/);
  });
});

describe('high-value canonical CMS page access', () => {
  it('preserves Super Admin governance access', () => {
    expect(canViewPage('super_admin', 'dashboard')).toBe(true);
    expect(canViewPage('super_admin', 'settings')).toBe(true);
    expect(canViewPage('super_admin', 'audit_log')).toBe(true);
    expect(canViewPage('super_admin', 'permission_review')).toBe(true);
  });

  it('preserves Admin allow and deny boundaries', () => {
    expect(canViewPage('admin', 'dashboard')).toBe(true);
    expect(canViewPage('admin', 'review_queue')).toBe(true);
    expect(canViewPage('admin', 'analytics')).toBe(true);
    expect(canViewPage('admin', 'operations_center')).toBe(true);
    expect(canViewPage('admin', 'settings')).toBe(false);
    expect(canViewPage('admin', 'audit_log')).toBe(false);
  });

  it('preserves Copy Editor allow and deny boundaries', () => {
    expect(canViewPage('copy_editor', 'copy_desk')).toBe(true);
    expect(canViewPage('copy_editor', 'articles')).toBe(true);
    expect(canViewPage('copy_editor', 'article_edit')).toBe(true);
    expect(canViewPage('copy_editor', 'videos')).toBe(true);
    expect(canViewPage('copy_editor', 'video_create')).toBe(false);
    expect(canViewPage('copy_editor', 'epaper_edit')).toBe(true);
    expect(canViewPage('copy_editor', 'settings')).toBe(false);
  });

  it('preserves Reporter allow and deny boundaries', () => {
    expect(canViewPage('reporter', 'dashboard')).toBe(true);
    expect(canViewPage('reporter', 'my_work')).toBe(true);
    expect(canViewPage('reporter', 'article_create')).toBe(true);
    expect(canViewPage('reporter', 'story_create')).toBe(true);
    expect(canViewPage('reporter', 'media')).toBe(true);
    expect(canViewPage('reporter', 'review_queue')).toBe(false);
    expect(canViewPage('reporter', 'articles')).toBe(false);
    expect(canViewPage('reporter', 'video_create')).toBe(false);
    expect(canViewPage('reporter', 'settings')).toBe(false);
  });
});
