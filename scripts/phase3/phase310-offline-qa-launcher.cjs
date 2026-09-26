'use strict';

/**
 * Starts Next directly for offline Phase 3.10 QA. This script never invokes the
 * staging-aware npm run dev launcher and never reads an env file.
 */

const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');

const projectRoot = path.resolve(__dirname, '..', '..');
const guardPath = path.join(__dirname, 'offline-network-guard.cjs');
const nextBin = require.resolve('next/dist/bin/next');
const portArg = process.argv.find((value) => /^--port=\d+$/.test(value));
const port = Number(portArg ? portArg.split('=')[1] : 3310);
const host = 'localhost';
const baseUrl = `http://${host}:${port}`;
const qaPassword = 'Phase310-QA-Only!2026';

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Offline QA port must be an integer from 1024 to 65535.');
}

const safeInheritedKeys = [
  'SystemRoot',
  'SYSTEMROOT',
  'WINDIR',
  'ComSpec',
  'COMSPEC',
  'PATHEXT',
  'TEMP',
  'TMP',
  'PATH',
];

function safeRuntimeEnvironment() {
  const env = {};
  for (const key of safeInheritedKeys) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return env;
}

async function main() {
  const passwordHash = await bcrypt.hash(qaPassword, 10);
  const secret = crypto.randomBytes(48).toString('base64url');
  const env = {
    ...safeRuntimeEnvironment(),
    NODE_ENV: 'development',
    PORT: String(port),
    HOSTNAME: host,
    NEXTAUTH_URL: baseUrl,
    AUTH_URL: baseUrl,
    NEXT_PUBLIC_SITE_URL: baseUrl,
    AUTH_TRUST_HOST: 'true',
    ADMIN_LOGIN_ID: 'qa.phase310',
    ADMIN_USERNAME: 'qa.phase310',
    ADMIN_EMAIL: 'qa.phase310@lokswami.local',
    ADMIN_DISPLAY_NAME: 'Phase 310 QA',
    ADMIN_PASSWORD_HASH: passwordHash,
    NEXTAUTH_SECRET: secret,
    AUTH_SECRET: secret,
    JWT_SECRET: secret,
    MONGODB_URI: 'mongodb://127.0.0.1:1/lokswami_offline_qa?serverSelectionTimeoutMS=250&connectTimeoutMS=250',
    MONGODB_PUBLIC_PROBE_TIMEOUT_MS: '250',
    MONGODB_AVAILABLE_TTL_MS: '250',
    MONGODB_UNAVAILABLE_TTL_MS: '60000',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    ADMIN_GOOGLE_LOGIN_ENABLED: 'false',
    ADMIN_EMAILS: '',
    UPSTASH_REDIS_REST_URL: '',
    UPSTASH_REDIS_REST_TOKEN: '',
    DIGITALOCEAN_SPACES_ACCESS_KEY: '',
    DIGITALOCEAN_SPACES_SECRET_KEY: '',
    DIGITALOCEAN_SPACES_BUCKET: '',
    DIGITALOCEAN_SPACES_REGION: '',
    DIGITALOCEAN_SPACES_CDN_BASE_URL: '',
    EPAPER_FORCE_STORAGE: '0',
    EPAPER_BACKGROUND_PROCESSING_ENABLED: '0',
    EPAPER_LOCAL_OCR_ENABLED: '0',
    NEXT_PUBLIC_EPAPER_LOCAL_OCR_ONLY: 'true',
    NEXT_PUBLIC_EPAPER_REMOTE_OCR_FALLBACK: 'false',
    OCR_CUSTOM_API_URL: '',
    OCR_CUSTOM_API_KEY: '',
    OCR_SPACE_API_KEY: '',
    GEMINI_API_KEY: '',
    RESEND_API_KEY: '',
    RESEND_FROM_EMAIL: '',
    CONTACT_ACK_FROM_EMAIL: '',
    LEADERSHIP_REPORT_FROM_EMAIL: '',
    LEADERSHIP_REPORT_CRON_SECRET: '',
    ADMIN_CRON_SECRET: '',
    CRON_SECRET: '',
    SOCIAL_AUTOMATION_PROVIDER: 'manual',
    SOCIAL_AUTOMATION_WEBHOOK_URL: '',
    SOCIAL_AUTOMATION_SHARED_SECRET: '',
    N8N_SOCIAL_WEBHOOK_URL: '',
    TURNSTILE_SECRET_KEY: '',
    RECAPTCHA_SECRET_KEY: '',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
    NEXT_PUBLIC_GTM_ID: '',
    NEXT_PUBLIC_GA4_MEASUREMENT_ID: '',
    NEXT_PUBLIC_USE_REMOTE_DEMO_MEDIA: 'false',
    NEXT_TELEMETRY_DISABLED: '1',
    DISABLE_AUDIT_LOG: 'true',
    DISABLE_REQUEST_LOG: 'true',
    DISABLE_CSP_REPORT_LOG: 'true',
    NODE_OPTIONS: `--require=${guardPath}`,
  };

  const child = spawn(process.execPath, [nextBin, 'dev', '-H', host, '-p', String(port)], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });

  let stopping = false;
  function stop(signal = 'SIGTERM') {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null && !child.killed) child.kill(signal);
  }

  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.stdin?.on('data', (chunk) => {
    if (String(chunk).trim() === 'STOP') stop('SIGTERM');
  });

  child.once('error', (error) => {
    console.error(`OFFLINE_QA_LAUNCH_FAILED ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = typeof code === 'number' && (code === 0 || stopping) ? 0 : 1;
  });

  console.log(`OFFLINE_QA_LAUNCHED origin=${baseUrl}`);
}

main().catch((error) => {
  console.error(`OFFLINE_QA_LAUNCH_FAILED ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
