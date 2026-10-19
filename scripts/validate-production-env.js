const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function loadProjectEnvFiles() {
  let dotenv;

  try {
    dotenv = require('dotenv');
  } catch {
    return;
  }

  const envFileNames = [
    '.env',
    '.env.hostinger',
    '.env.production',
    '.env.local',
    '.env.production.local',
  ];

  for (const fileName of envFileNames) {
    const envPath = path.join(projectRoot, fileName);
    try {
      dotenv.config({
        path: envPath,
        override: false,
        quiet: true,
      });
    } catch {
      // Ignore missing or unreadable env files. Explicit process env still wins.
    }
  }
}

function readEnv(name, env = process.env) {
  return String(env[name] || '').trim();
}

function parseAbsoluteHttpUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0'
  );
}

function validateOptionalEnvGroup(label, names, env, warnings) {
  const present = names.filter((name) => Boolean(readEnv(name, env)));
  if (present.length > 0 && present.length < names.length) {
    warnings.push(
      `${label} is partially configured. Set all of: ${names.join(', ')}`
    );
  }
}

function validateRequiredEnvGroup(label, names, env, errors) {
  const missing = names.filter((name) => !readEnv(name, env));
  if (missing.length > 0) {
    errors.push(`${label} is missing required env: ${missing.join(', ')}`);
  }
}

function validateProductionEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const infos = [];

  const mongodbUri = readEnv('MONGODB_URI', env);
  const nextauthSecret = readEnv('NEXTAUTH_SECRET', env);
  const nextauthUrl = readEnv('NEXTAUTH_URL', env);
  const publicSiteUrl = readEnv('NEXT_PUBLIC_SITE_URL', env);
  const adminLoginId = readEnv('ADMIN_LOGIN_ID', env);
  const adminUsername = readEnv('ADMIN_USERNAME', env);
  const adminPasswordHash = readEnv('ADMIN_PASSWORD_HASH', env);
  const uploadsBaseDir = readEnv('EPAPER_STORAGE_UPLOADS_BASE_DIR', env);
  const forceStorage = readEnv('EPAPER_FORCE_STORAGE', env);
  const epaperCronSecret = readEnv('ADMIN_CRON_SECRET', env) || readEnv('CRON_SECRET', env);

  if (!mongodbUri) {
    errors.push('Missing required env: MONGODB_URI');
  } else if (
    !mongodbUri.startsWith('mongodb://') &&
    !mongodbUri.startsWith('mongodb+srv://')
  ) {
    errors.push('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  if (!nextauthSecret) {
    errors.push('Missing required env: NEXTAUTH_SECRET');
  } else if (nextauthSecret.length < 32) {
    warnings.push(
      'NEXTAUTH_SECRET is shorter than 32 characters. Use a longer random secret for production.'
    );
  }

  if (!nextauthUrl) {
    errors.push('Missing required env: NEXTAUTH_URL');
  }

  if (!publicSiteUrl) {
    errors.push('Missing required env: NEXT_PUBLIC_SITE_URL');
  }

  const parsedNextauthUrl = parseAbsoluteHttpUrl(nextauthUrl);
  const parsedPublicSiteUrl = parseAbsoluteHttpUrl(publicSiteUrl);

  if (nextauthUrl && !parsedNextauthUrl) {
    errors.push('NEXTAUTH_URL must be an absolute http(s) URL');
  }

  if (publicSiteUrl && !parsedPublicSiteUrl) {
    errors.push('NEXT_PUBLIC_SITE_URL must be an absolute http(s) URL');
  }

  if (parsedNextauthUrl && parsedPublicSiteUrl) {
    if (parsedNextauthUrl.origin !== parsedPublicSiteUrl.origin) {
      errors.push(
        'NEXTAUTH_URL and NEXT_PUBLIC_SITE_URL must use the same origin'
      );
    }

    if (
      (parsedNextauthUrl.protocol === 'http:' &&
        !isLocalHostname(parsedNextauthUrl.hostname)) ||
      (parsedPublicSiteUrl.protocol === 'http:' &&
        !isLocalHostname(parsedPublicSiteUrl.hostname))
    ) {
      warnings.push(
        'Production URLs are using http://. Prefer https:// on the final domain.'
      );
    }

    if (
      isLocalHostname(parsedNextauthUrl.hostname) ||
      isLocalHostname(parsedPublicSiteUrl.hostname)
    ) {
      warnings.push(
        'NEXTAUTH_URL or NEXT_PUBLIC_SITE_URL still points at localhost. Replace these with the final production domain before deploy.'
      );
    }
  }

  if (!adminLoginId && !adminUsername) {
    warnings.push(
      'Neither ADMIN_LOGIN_ID nor ADMIN_USERNAME is configured. Confirm you have another intentional admin login path before deploy.'
    );
  }

  if (!adminPasswordHash) {
    warnings.push(
      'ADMIN_PASSWORD_HASH is missing. Confirm admin authentication is intentionally provided another way before deploy.'
    );
  } else if (adminPasswordHash.includes('\\$')) {
    warnings.push(
      'ADMIN_PASSWORD_HASH contains escaped "$" characters. Use the raw bcrypt hash value without backslashes.'
    );
  }

  if (adminLoginId && adminUsername && adminLoginId !== adminUsername) {
    warnings.push(
      'ADMIN_LOGIN_ID and ADMIN_USERNAME are both set to different values. Prefer one consistent admin identifier.'
    );
  }

  if (!uploadsBaseDir) {
    infos.push(
      'EPAPER_STORAGE_UPLOADS_BASE_DIR is not set. The app will use the default storage/uploads path.'
    );
  }

  if (forceStorage !== '1') {
    warnings.push(
      'EPAPER_FORCE_STORAGE is not set to 1. Hostinger GitHub releases should keep runtime-generated uploads out of public/uploads.'
    );
  }

  if (!epaperCronSecret) {
    errors.push(
      'Missing required env: ADMIN_CRON_SECRET or CRON_SECRET. Hostinger cron needs this to run E-paper/E-magazine PDF conversion jobs.'
    );
  }

  validateRequiredEnvGroup(
    'DigitalOcean Spaces uploads',
    [
      'DIGITALOCEAN_SPACES_ACCESS_KEY',
      'DIGITALOCEAN_SPACES_SECRET_KEY',
      'DIGITALOCEAN_SPACES_BUCKET',
      'DIGITALOCEAN_SPACES_REGION',
    ],
    env,
    errors
  );
  if (!readEnv('DIGITALOCEAN_SPACES_CDN_BASE_URL', env)) {
    warnings.push(
      'DIGITALOCEAN_SPACES_CDN_BASE_URL is missing. Set it to the Spaces CDN base URL used for public media delivery.'
    );
  }

  validateOptionalEnvGroup(
    'Google login',
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXT_PUBLIC_GOOGLE_CLIENT_ID'],
    env,
    warnings
  );

  const advertisingEmailEnabled = readEnv('ADVERTISE_INQUIRY_EMAIL_ENABLED', env);
  if (advertisingEmailEnabled && !['true', 'false'].includes(advertisingEmailEnabled)) {
    errors.push('ADVERTISE_INQUIRY_EMAIL_ENABLED must be true or false');
  }
  if (advertisingEmailEnabled === 'true') {
    validateRequiredEnvGroup('Advertising enquiry email', ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'], env, errors);
    const recipient = readEnv('ADVERTISE_INQUIRY_NOTIFY_EMAIL', env);
    if (recipient && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(recipient)) {
      errors.push('ADVERTISE_INQUIRY_NOTIFY_EMAIL must contain one valid email address');
    }
    if (parsedPublicSiteUrl?.protocol !== 'https:' || parsedPublicSiteUrl?.username || parsedPublicSiteUrl?.password) {
      errors.push('Advertising enquiry email requires an HTTPS NEXT_PUBLIC_SITE_URL without credentials');
    }
    if (/[\r\n]/.test(readEnv('RESEND_FROM_EMAIL', env))) {
      errors.push('RESEND_FROM_EMAIL must not contain line breaks');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    infos,
  };
}

function printValidationReport(result) {
  if (result.errors.length === 0) {
    console.log('Production environment validation passed.');
  } else {
    console.error('Production environment validation failed.');
  }

  for (const message of result.errors) {
    console.error(`ERROR ${message}`);
  }

  for (const message of result.warnings) {
    console.warn(`WARN ${message}`);
  }

  for (const message of result.infos) {
    console.log(`INFO ${message}`);
  }
}

function main() {
  loadProjectEnvFiles();
  const result = validateProductionEnv(process.env);
  printValidationReport(result);

  if (!result.ok) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadProjectEnvFiles,
  validateProductionEnv,
  printValidationReport,
};
