import { describe, expect, it } from 'vitest';

const { validateStagingEnv } = require('../scripts/validate-staging-env.js') as {
  validateStagingEnv: (env: Record<string, string>) => {
    ok: boolean;
    errors: string[];
    warnings: string[];
    infos: string[];
  };
};

function makeSafeStagingEnv(overrides: Record<string, string> = {}) {
  return {
    LOKSWAMI_ENV: 'staging',
    MONGODB_URI:
      'mongodb+srv://staging_user:secret@staging-cluster.example.mongodb.net/lokswami_staging?retryWrites=true&w=majority',
    NEXTAUTH_SECRET: 'staging-nextauth-secret-that-is-longer-than-32-characters',
    JWT_SECRET: 'staging-jwt-secret-that-is-longer-than-32-characters',
    NEXTAUTH_URL: 'https://staging.lokswami.example',
    NEXT_PUBLIC_SITE_URL: 'https://staging.lokswami.example',
    DIGITALOCEAN_SPACES_ACCESS_KEY: 'staging-access-key',
    DIGITALOCEAN_SPACES_SECRET_KEY: 'staging-secret-key',
    DIGITALOCEAN_SPACES_BUCKET: 'lokswami-staging-media',
    DIGITALOCEAN_SPACES_REGION: 'sgp1',
    DIGITALOCEAN_SPACES_CDN_BASE_URL:
      'https://lokswami-staging-media.sgp1.digitaloceanspaces.com',
    DIGITALOCEAN_SPACES_CORS_ORIGINS:
      'http://localhost:3000,https://staging.lokswami.example',
    SOCIAL_AUTOMATION_PROVIDER: 'manual',
    EPAPER_FORCE_STORAGE: '1',
    ...overrides,
  };
}

describe('Phase 3.4 staging environment validator', () => {
  it('accepts an isolated staging configuration with outbound integrations disabled', () => {
    const result = validateStagingEnv(makeSafeStagingEnv());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects the live LokSwami production origin', () => {
    const result = validateStagingEnv(
      makeSafeStagingEnv({
        NEXTAUTH_URL: 'https://lokswami.com',
        NEXT_PUBLIC_SITE_URL: 'https://lokswami.com',
      })
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes('production LokSwami domain'))).toBe(
      true
    );
  });

  it('rejects a MongoDB database name that is not clearly non-production', () => {
    const result = validateStagingEnv(
      makeSafeStagingEnv({
        MONGODB_URI:
          'mongodb+srv://user:secret@cluster.example.mongodb.net/lokswami?retryWrites=true&w=majority',
      })
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes('not clearly non-production'))).toBe(true);
  });

  it('rejects a media bucket that is not clearly staging, preview, or test', () => {
    const result = validateStagingEnv(
      makeSafeStagingEnv({ DIGITALOCEAN_SPACES_BUCKET: 'lokswami-media' })
    );

    expect(result.ok).toBe(false);
    expect(
      result.errors.some((message) => message.includes('DIGITALOCEAN_SPACES_BUCKET'))
    ).toBe(true);
  });

  it('rejects enabled social/email outbound delivery', () => {
    const result = validateStagingEnv(
      makeSafeStagingEnv({
        SOCIAL_AUTOMATION_PROVIDER: 'n8n',
        N8N_SOCIAL_WEBHOOK_URL: 'https://automation.example/webhook',
        RESEND_API_KEY: 're_staging_should_still_be_disabled_phase34',
      })
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes('SOCIAL_AUTOMATION_PROVIDER'))).toBe(
      true
    );
    expect(result.errors.some((message) => message.includes('N8N_SOCIAL_WEBHOOK_URL'))).toBe(true);
    expect(result.errors.some((message) => message.includes('RESEND_API_KEY'))).toBe(true);
  });
});
