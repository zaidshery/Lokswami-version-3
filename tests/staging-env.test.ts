import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const requireFromTest = createRequire(import.meta.url);
const { validateStagingEnv } = requireFromTest('../scripts/validate-staging-env.js') as {
  validateStagingEnv: (env: Record<string, string>) => {
    ok: boolean;
    errors: string[];
    warnings: string[];
    infos: string[];
  };
};

function makeSafeStagingEnv(overrides: Record<string, string | undefined> = {}): Record<string, string> {
  const base: Record<string, string> = {
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
  };

  for (const [key, val] of Object.entries(overrides)) {
    if (val !== undefined) {
      base[key] = val;
    } else {
      delete base[key];
    }
  }

  return base;
}

describe('Phase 3.4 staging environment validator', () => {
  it('accepts an isolated staging configuration with outbound integrations disabled', () => {
    const result = validateStagingEnv(makeSafeStagingEnv());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects the live LokSwami production origin and subdomains', () => {
    const targets = [
      'https://lokswami.com',
      'https://www.lokswami.com',
      'https://prod.lokswami.com',
      'https://api.lokswami.com',
    ];

    for (const origin of targets) {
      const result = validateStagingEnv(
        makeSafeStagingEnv({
          NEXTAUTH_URL: origin,
          NEXT_PUBLIC_SITE_URL: origin,
        })
      );

      expect(result.ok, `Expected rejection for ${origin}`).toBe(false);
      expect(result.errors.some((message) => message.includes('production LokSwami domain'))).toBe(
        true
      );
    }
  });

  it('allows valid non-production staging subdomain origins', () => {
    const validOrigins = [
      'https://staging.lokswami.com',
      'https://preview.lokswami.com',
      'https://test.lokswami.com',
    ];

    for (const origin of validOrigins) {
      const result = validateStagingEnv(
        makeSafeStagingEnv({
          NEXTAUTH_URL: origin,
          NEXT_PUBLIC_SITE_URL: origin,
          DIGITALOCEAN_SPACES_CORS_ORIGINS: `http://localhost:3000,${origin}`,
        })
      );

      expect(result.ok, `Expected acceptance for ${origin}`).toBe(true);
    }
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

  it('rejects a MongoDB cluster host targeting production', () => {
    const result = validateStagingEnv(
      makeSafeStagingEnv({
        MONGODB_URI:
          'mongodb+srv://user:secret@production-cluster.example.mongodb.net/lokswami_staging?retryWrites=true&w=majority',
      })
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((message) => message.includes('MONGODB_URI cluster host appears to be production'))).toBe(true);
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

  it('rejects non-manual social automation provider and empty provider', () => {
    const nonManual = ['n8n', 'generic_webhook', ''];
    for (const provider of nonManual) {
      const result = validateStagingEnv(
        makeSafeStagingEnv({ SOCIAL_AUTOMATION_PROVIDER: provider })
      );

      expect(result.ok).toBe(false);
      expect(result.errors.some((message) => message.includes('SOCIAL_AUTOMATION_PROVIDER'))).toBe(
        true
      );
    }
  });

  it('rejects social automation and n8n webhooks or shared secrets', () => {
    const outboundFields: Record<string, string>[] = [
      { SOCIAL_AUTOMATION_WEBHOOK_URL: 'https://automation.example/webhook' },
      { N8N_SOCIAL_WEBHOOK_URL: 'https://n8n.example/webhook' },
      { SOCIAL_AUTOMATION_SHARED_SECRET: 'super-secret-token' },
    ];

    for (const override of outboundFields) {
      const result = validateStagingEnv(makeSafeStagingEnv(override));
      expect(result.ok).toBe(false);
      const fieldName = Object.keys(override)[0];
      expect(result.errors.some((message) => message.includes(fieldName))).toBe(true);
    }
  });

  it('rejects email and Resend credentials in staging', () => {
    const emailFields: Record<string, string>[] = [
      { RESEND_API_KEY: 're_123456789' },
      { RESEND_FROM_EMAIL: 'news@lokswami.com' },
      { CONTACT_ACK_FROM_EMAIL: 'contact@lokswami.com' },
      { LEADERSHIP_REPORT_FROM_EMAIL: 'reports@lokswami.com' },
    ];

    for (const override of emailFields) {
      const result = validateStagingEnv(makeSafeStagingEnv(override));
      expect(result.ok).toBe(false);
      const fieldName = Object.keys(override)[0];
      expect(result.errors.some((message) => message.includes(fieldName))).toBe(true);
    }
  });

  it('rejects cron secrets in staging', () => {
    const cronFields: Record<string, string>[] = [
      { LEADERSHIP_REPORT_CRON_SECRET: 'cron-secret-123' },
      { ADMIN_CRON_SECRET: 'admin-cron-secret' },
      { CRON_SECRET: 'cron-secret-global' },
    ];

    for (const override of cronFields) {
      const result = validateStagingEnv(makeSafeStagingEnv(override));
      expect(result.ok).toBe(false);
      const fieldName = Object.keys(override)[0];
      expect(result.errors.some((message) => message.includes(fieldName))).toBe(true);
    }
  });

  it('rejects unapproved analytics IDs and production analytics', () => {
    const resultUnapproved = validateStagingEnv(
      makeSafeStagingEnv({ NEXT_PUBLIC_GTM_ID: 'GTM-XXXXXXX' })
    );
    expect(resultUnapproved.ok).toBe(false);
    expect(resultUnapproved.errors.some((message) => message.includes('Analytics IDs'))).toBe(true);

    const resultProdAnalytics = validateStagingEnv(
      makeSafeStagingEnv({
        ALLOW_STAGING_ANALYTICS: 'true',
        NEXT_PUBLIC_GTM_ID: 'GTM-PROD-CONTAINER',
      })
    );
    expect(resultProdAnalytics.ok).toBe(false);
    expect(resultProdAnalytics.errors.some((message) => message.includes('production analytics container'))).toBe(true);
  });

  it('rejects production OAuth callbacks and mismatched Google OAuth client IDs', () => {
    const resultProdCallback = validateStagingEnv(
      makeSafeStagingEnv({
        GOOGLE_REDIRECT_URI: 'https://lokswami.com/api/auth/callback/google',
      })
    );
    expect(resultProdCallback.ok).toBe(false);
    expect(resultProdCallback.errors.some((message) => message.includes('production LokSwami domain'))).toBe(true);

    const resultMismatchedClients = validateStagingEnv(
      makeSafeStagingEnv({
        GOOGLE_CLIENT_ID: 'staging-client-id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'staging-client-secret',
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'different-client-id.apps.googleusercontent.com',
      })
    );
    expect(resultMismatchedClients.ok).toBe(false);
    expect(resultMismatchedClients.errors.some((message) => message.includes('must match in staging'))).toBe(true);
  });

  it('rejects short auth secrets (< 32 characters)', () => {
    const resultShort = validateStagingEnv(
      makeSafeStagingEnv({ NEXTAUTH_SECRET: 'short-secret' })
    );
    expect(resultShort.ok).toBe(false);
    expect(resultShort.errors.some((message) => message.includes('at least 32 characters'))).toBe(true);
  });

  it('never prints secret contents or values in error reports', () => {
    const sensitiveTokens = [
      'very-secret-password-12345',
      're_live_top_secret_token_99999',
      'super-private-jwt-secret-string',
      'n8n-private-webhook-key-98765',
    ];

    const result = validateStagingEnv(
      makeSafeStagingEnv({
        MONGODB_URI: `mongodb+srv://admin:${sensitiveTokens[0]}@prod-cluster.mongodb.net/lokswami`,
        RESEND_API_KEY: sensitiveTokens[1],
        JWT_SECRET: 'short',
        N8N_SOCIAL_WEBHOOK_URL: `https://n8n.example/hook?token=${sensitiveTokens[3]}`,
      })
    );

    expect(result.ok).toBe(false);
    const combinedErrors = result.errors.join('\n');
    for (const token of sensitiveTokens) {
      expect(combinedErrors).not.toContain(token);
    }
  });
});

describe('Phase 3.4 staging smoke verification tooling (verify-staging.js)', () => {
  const { parseArgs, verifyStaging } = requireFromTest('../scripts/verify-staging.js') as {
    parseArgs: (argv: string[]) => {
      help: boolean;
      targetUrl: string;
      timeoutMs: number;
      envOnly: boolean;
    };
    verifyStaging: (options?: {
      targetUrlRaw?: string;
      timeoutMs?: number;
      envOnly?: boolean;
      env?: Record<string, string>;
    }) => Promise<{
      ok: boolean;
      phase: string;
      reason?: string;
      error?: string;
    }>;
  };

  it('correctly parses CLI arguments', () => {
    const parsedPositional = parseArgs(['https://preview-123.vercel.app']);
    expect(parsedPositional.targetUrl).toBe('https://preview-123.vercel.app');
    expect(parsedPositional.envOnly).toBe(false);

    const parsedUrlFlag = parseArgs(['--url=https://preview-flag.vercel.app', '--timeoutMs=25000']);
    expect(parsedUrlFlag.targetUrl).toBe('https://preview-flag.vercel.app');
    expect(parsedUrlFlag.timeoutMs).toBe(25000);

    const parsedEnvOnly = parseArgs(['--env-only']);
    expect(parsedEnvOnly.envOnly).toBe(true);

    const parsedHelp = parseArgs(['--help']);
    expect(parsedHelp.help).toBe(true);
  });

  it('fails closed when staging environment is invalid', async () => {
    const invalidEnv = makeSafeStagingEnv({ LOKSWAMI_ENV: 'production' });
    const result = await verifyStaging({ env: invalidEnv });

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('env');
  });

  it('aborts with critical security failure if target URL is live production', async () => {
    const safeEnv = makeSafeStagingEnv();
    const result = await verifyStaging({
      targetUrlRaw: 'https://lokswami.com',
      env: safeEnv,
    });

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('origin-security');
    expect(result.error).toBe('production-origin-detected');
  });

  it('reports template domain as smoke-blocked with infrastructure pending', async () => {
    const safeEnv = makeSafeStagingEnv({
      NEXTAUTH_URL: 'https://lokswami-staging.example.com',
      NEXT_PUBLIC_SITE_URL: 'https://lokswami-staging.example.com',
    });
    const result = await verifyStaging({
      targetUrlRaw: 'https://lokswami-staging.example.com',
      env: safeEnv,
    });

    expect(result.ok).toBe(true);
    expect(result.phase).toBe('smoke-blocked');
    expect(result.reason).toBe('template-domain');
  });

  it('completes successfully with --env-only without attempting network requests', async () => {
    const safeEnv = makeSafeStagingEnv();
    const result = await verifyStaging({
      envOnly: true,
      env: safeEnv,
    });

    expect(result.ok).toBe(true);
    expect(result.phase).toBe('env-only');
  });
});
