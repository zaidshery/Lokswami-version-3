'use strict';

const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const PRODUCTION_HOSTS = new Set(['lokswami.com', 'www.lokswami.com']);
const NON_PROD_MARKER = /(staging|preview|test)/i;

function isProductionHostname(hostname) {
  if (!hostname) return false;
  const lower = String(hostname).trim().toLowerCase();
  if (PRODUCTION_HOSTS.has(lower)) return true;
  if (lower.endsWith('.lokswami.com') && !NON_PROD_MARKER.test(lower)) {
    return true;
  }
  return false;
}

function loadStagingEnvFiles() {
  let dotenv;

  try {
    dotenv = require('dotenv');
  } catch {
    return;
  }

  // Deliberately do NOT load .env.production, .env.hostinger, or generic .env.local.
  // Explicit process env (for example Vercel Preview variables) always wins.
  const envFileNames = ['.env.staging', '.env.staging.local'];

  for (const fileName of envFileNames) {
    const envPath = path.join(projectRoot, fileName);
    try {
      dotenv.config({ path: envPath, override: false, quiet: true });
    } catch {
      // Missing/unreadable staging files are fine when process.env is supplied by CI/deploy.
    }
  }
}

function readEnv(name, env = process.env) {
  return String(env[name] || '').trim();
}

function parseAbsoluteHttpUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function getMongoDatabaseName(uri) {
  const raw = String(uri || '').trim();
  if (!raw) return '';

  try {
    const withoutQuery = raw.split('?')[0];
    const slashIndex = withoutQuery.lastIndexOf('/');
    if (slashIndex < 0 || slashIndex === withoutQuery.length - 1) return '';
    return decodeURIComponent(withoutQuery.slice(slashIndex + 1)).trim();
  } catch {
    return '';
  }
}

function validateOptionalGroup(label, names, env, warnings) {
  const present = names.filter((name) => Boolean(readEnv(name, env)));
  if (present.length > 0 && present.length < names.length) {
    warnings.push(`${label} is partially configured. Set all or none of: ${names.join(', ')}`);
  }
}

function validateRequiredGroup(label, names, env, errors) {
  const missing = names.filter((name) => !readEnv(name, env));
  if (missing.length > 0) {
    errors.push(`${label} is missing required staging env: ${missing.join(', ')}`);
  }
}

function validateNoProductionOrigin(label, parsedUrl, errors) {
  if (!parsedUrl) return;
  const hostname = parsedUrl.hostname.toLowerCase();
  if (isProductionHostname(hostname)) {
    errors.push(`${label} must not point at the production LokSwami domain (${hostname}).`);
  }
}

function validateStagingEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const infos = [];

  const environmentName = readEnv('LOKSWAMI_ENV', env);
  if (environmentName !== 'staging') {
    errors.push('LOKSWAMI_ENV must be exactly "staging" for the Phase 3.4 staging environment.');
  }

  const mongodbUri = readEnv('MONGODB_URI', env);
  if (!mongodbUri) {
    errors.push('Missing required staging env: MONGODB_URI');
  } else if (!mongodbUri.startsWith('mongodb://') && !mongodbUri.startsWith('mongodb+srv://')) {
    errors.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  } else {
    const databaseName = getMongoDatabaseName(mongodbUri);
    if (!databaseName) {
      errors.push('MONGODB_URI must include an explicit staging database name.');
    } else if (!NON_PROD_MARKER.test(databaseName)) {
      errors.push(
        `MONGODB_URI database "${databaseName}" is not clearly non-production. Include staging, preview, or test in the database name.`
      );
    }

    try {
      const uriMatch = mongodbUri.match(/@([^/?#]+)/);
      if (uriMatch && uriMatch[1]) {
        const mongoHost = uriMatch[1].toLowerCase();
        if ((mongoHost.includes('prod') || mongoHost.includes('production')) && !NON_PROD_MARKER.test(mongoHost)) {
          errors.push('MONGODB_URI cluster host appears to be production. Staging must use an isolated cluster or staging host.');
        }
      }
    } catch {
      // Ignore regex parsing error
    }
  }

  const nextauthSecret = readEnv('NEXTAUTH_SECRET', env);
  if (!nextauthSecret) {
    errors.push('Missing required staging env: NEXTAUTH_SECRET');
  } else if (nextauthSecret.length < 32) {
    errors.push('NEXTAUTH_SECRET must be at least 32 characters in staging.');
  }

  const jwtSecret = readEnv('JWT_SECRET', env);
  if (jwtSecret && jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters when configured in staging.');
  }

  const nextauthUrlRaw = readEnv('NEXTAUTH_URL', env);
  const publicSiteUrlRaw = readEnv('NEXT_PUBLIC_SITE_URL', env);
  const nextauthUrl = parseAbsoluteHttpUrl(nextauthUrlRaw);
  const publicSiteUrl = parseAbsoluteHttpUrl(publicSiteUrlRaw);

  if (!nextauthUrlRaw) errors.push('Missing required staging env: NEXTAUTH_URL');
  if (!publicSiteUrlRaw) errors.push('Missing required staging env: NEXT_PUBLIC_SITE_URL');
  if (nextauthUrlRaw && !nextauthUrl) errors.push('NEXTAUTH_URL must be an absolute http(s) URL.');
  if (publicSiteUrlRaw && !publicSiteUrl) {
    errors.push('NEXT_PUBLIC_SITE_URL must be an absolute http(s) URL.');
  }

  validateNoProductionOrigin('NEXTAUTH_URL', nextauthUrl, errors);
  validateNoProductionOrigin('NEXT_PUBLIC_SITE_URL', publicSiteUrl, errors);

  if (nextauthUrl && publicSiteUrl) {
    if (nextauthUrl.origin !== publicSiteUrl.origin) {
      errors.push('NEXTAUTH_URL and NEXT_PUBLIC_SITE_URL must use the same staging origin.');
    }

    const isLocal = ['localhost', '127.0.0.1'].includes(nextauthUrl.hostname.toLowerCase());
    if (!isLocal && nextauthUrl.protocol !== 'https:') {
      errors.push('Remote staging origins must use https://.');
    }
  }

  validateRequiredGroup(
    'DigitalOcean staging storage',
    [
      'DIGITALOCEAN_SPACES_ACCESS_KEY',
      'DIGITALOCEAN_SPACES_SECRET_KEY',
      'DIGITALOCEAN_SPACES_BUCKET',
      'DIGITALOCEAN_SPACES_REGION',
    ],
    env,
    errors
  );

  const bucket = readEnv('DIGITALOCEAN_SPACES_BUCKET', env);
  if (bucket && !NON_PROD_MARKER.test(bucket)) {
    errors.push(
      `DIGITALOCEAN_SPACES_BUCKET "${bucket}" is not clearly non-production. Include staging, preview, or test in the bucket name.`
    );
  }

  const cdnUrlRaw = readEnv('DIGITALOCEAN_SPACES_CDN_BASE_URL', env);
  const cdnUrl = parseAbsoluteHttpUrl(cdnUrlRaw);
  if (cdnUrlRaw && !cdnUrl) {
    errors.push('DIGITALOCEAN_SPACES_CDN_BASE_URL must be an absolute http(s) URL when configured.');
  }
  validateNoProductionOrigin('DIGITALOCEAN_SPACES_CDN_BASE_URL', cdnUrl, errors);

  const corsOrigins = readEnv('DIGITALOCEAN_SPACES_CORS_ORIGINS', env)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const origin of corsOrigins) {
    const parsed = parseAbsoluteHttpUrl(origin);
    if (!parsed) {
      errors.push(`Invalid staging Spaces CORS origin: ${origin}`);
      continue;
    }
    validateNoProductionOrigin('DIGITALOCEAN_SPACES_CORS_ORIGINS', parsed, errors);
  }

  const socialProvider = readEnv('SOCIAL_AUTOMATION_PROVIDER', env).toLowerCase();
  if (socialProvider !== 'manual') {
    errors.push('SOCIAL_AUTOMATION_PROVIDER must be explicitly set to "manual" in Phase 3.4 staging.');
  }

  const forbiddenOutboundValues = [
    'SOCIAL_AUTOMATION_WEBHOOK_URL',
    'N8N_SOCIAL_WEBHOOK_URL',
    'SOCIAL_AUTOMATION_SHARED_SECRET',
    'RESEND_API_KEY',
    'CONTACT_ACK_FROM_EMAIL',
    'LEADERSHIP_REPORT_FROM_EMAIL',
    'RESEND_FROM_EMAIL',
    'LEADERSHIP_REPORT_CRON_SECRET',
    'ADMIN_CRON_SECRET',
    'CRON_SECRET',
  ];

  for (const name of forbiddenOutboundValues) {
    if (readEnv(name, env)) {
      errors.push(`${name} must remain empty while Phase 3.4 staging outbound integrations are disabled.`);
    }
  }

  const analyticsEnvNames = ['NEXT_PUBLIC_GTM_ID', 'NEXT_PUBLIC_GA4_MEASUREMENT_ID'];
  const configuredAnalytics = analyticsEnvNames.filter((name) => Boolean(readEnv(name, env)));
  if (configuredAnalytics.length > 0) {
    const stagingAnalyticsPermitted = readEnv('ALLOW_STAGING_ANALYTICS', env).toLowerCase() === 'true';
    if (!stagingAnalyticsPermitted) {
      errors.push(
        `Analytics IDs (${configuredAnalytics.join(', ')}) must remain empty in Phase 3.4 staging unless ALLOW_STAGING_ANALYTICS=true is explicitly configured with a dedicated non-production container.`
      );
    } else {
      for (const name of configuredAnalytics) {
        const val = readEnv(name, env).toUpperCase();
        if ((val.includes('PROD') || val.includes('PRODUCTION')) && !NON_PROD_MARKER.test(val)) {
          errors.push(`${name} appears to reference a production analytics container.`);
        }
      }
    }
  }

  if (readEnv('GEMINI_API_KEY', env)) {
    warnings.push('GEMINI_API_KEY is configured. Phase 3.4 defaults to no paid external AI keys in staging.');
  }

  if (readEnv('OCR_CUSTOM_API_URL', env) || readEnv('OCR_CUSTOM_API_KEY', env)) {
    warnings.push(
      'Custom OCR is configured. Confirm the endpoint is an approved staging/sandbox service before use.'
    );
  }

  validateOptionalGroup(
    'Google staging login',
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXT_PUBLIC_GOOGLE_CLIENT_ID'],
    env,
    warnings
  );

  const googleClientId = readEnv('GOOGLE_CLIENT_ID', env);
  const publicGoogleClientId = readEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', env);
  if (googleClientId && publicGoogleClientId && googleClientId !== publicGoogleClientId) {
    errors.push('GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID must match in staging.');
  }
  if (googleClientId && (googleClientId.includes('production') || googleClientId.includes('lokswami-prod')) && !NON_PROD_MARKER.test(googleClientId)) {
    errors.push('GOOGLE_CLIENT_ID appears to reference a production OAuth client.');
  }

  const oauthRedirectUrls = [
    { label: 'GOOGLE_REDIRECT_URI', value: readEnv('GOOGLE_REDIRECT_URI', env) },
    { label: 'GOOGLE_CALLBACK_URL', value: readEnv('GOOGLE_CALLBACK_URL', env) },
  ];
  for (const { label, value } of oauthRedirectUrls) {
    if (value) {
      const parsed = parseAbsoluteHttpUrl(value);
      if (!parsed) {
        errors.push(`${label} must be an absolute http(s) URL.`);
      } else {
        validateNoProductionOrigin(label, parsed, errors);
      }
    }
  }

  if (readEnv('EPAPER_FORCE_STORAGE', env) !== '1') {
    warnings.push(
      'EPAPER_FORCE_STORAGE is not set to 1. Preview deployments should avoid runtime writes into immutable public deploy output.'
    );
  }

  infos.push('Phase 3.4 validation does not prove Vercel project isolation; verify Preview environment scoping in Vercel.');
  infos.push('Use a fresh/sanitized staging database with no production leadership webhook schedules.');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    infos,
  };
}

function printValidationReport(result) {
  if (result.ok) {
    console.log('Staging environment validation passed.');
  } else {
    console.error('Staging environment validation failed.');
  }

  for (const message of result.errors) console.error(`ERROR ${message}`);
  for (const message of result.warnings) console.warn(`WARN ${message}`);
  for (const message of result.infos) console.log(`INFO ${message}`);
}

function main() {
  loadStagingEnvFiles();
  const result = validateStagingEnv(process.env);
  printValidationReport(result);

  if (!result.ok) process.exit(1);
}

if (require.main === module) main();

module.exports = {
  getMongoDatabaseName,
  isProductionHostname,
  loadStagingEnvFiles,
  parseAbsoluteHttpUrl,
  printValidationReport,
  validateStagingEnv,
};
