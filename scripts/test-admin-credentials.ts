export {};

const path = require('node:path') as typeof import('node:path');
const Module = require('node:module') as typeof import('node:module') & {
  _resolveFilename: (
    request: string,
    parent: NodeModule | null,
    isMain: boolean,
    options?: { paths?: string[] }
  ) => string;
};
const dotenv = require('dotenv') as typeof import('dotenv');

const projectRoot = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilenameWithAlias(
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
  options?: { paths?: string[] }
) {
  const nextRequest = request.startsWith('@/') ? path.join(projectRoot, request.slice(2)) : request;
  return originalResolveFilename.call(this, nextRequest, parent, isMain, options);
};

type AdminCredentialsModule = typeof import('../lib/auth/adminCredentials');
const requireCurrentEnvAdminConfig = process.env.REQUIRE_CURRENT_ADMIN_ENV === '1';

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function restoreEnv(snapshot: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }
}

function reloadModule<T>(modulePath: string) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath) as T;
}

async function main() {
  const originalEnv = { ...process.env };
  let failures = 0;

  async function runCase(name: string, check: () => Promise<void> | void) {
    try {
      await check();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL: ${name} -> ${message}`);
    }
  }

  try {
    dotenv.config({
      path: path.join(projectRoot, '.env.local'),
      override: false,
    });

    const currentConfig = reloadModule<AdminCredentialsModule>('../lib/auth/adminCredentials');

    if (requireCurrentEnvAdminConfig) {
      await runCase('current environment enables admin credentials auth', () => {
        expect(
          currentConfig.isAdminCredentialsAuthConfigured(),
          'ADMIN_LOGIN_ID or ADMIN_USERNAME plus ADMIN_PASSWORD_HASH must be configured'
        );
      });
    } else if (currentConfig.isAdminCredentialsAuthConfigured()) {
      console.log('PASS: current environment enables admin credentials auth');
    } else {
      console.log(
        'SKIP: current environment admin credentials are not configured; running synthetic regression cases only.'
      );
    }

    const testPassword = 'S3cret!Pass123';
    const testHash = await reloadModule<typeof import('../lib/auth/jwt')>(
      '../lib/auth/jwt'
    ).hashPassword(testPassword);

    process.env.ADMIN_LOGIN_ID = 'admin';
    process.env.ADMIN_USERNAME = '';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_DISPLAY_NAME = 'Regression Admin';
    process.env.ADMIN_PASSWORD_HASH = testHash;
    process.env.GOOGLE_CLIENT_ID = '';
    process.env.GOOGLE_CLIENT_SECRET = '';
    process.env.ADMIN_GOOGLE_LOGIN_ENABLED = '';
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
    process.env.JWT_SECRET = 'test-secret';
    process.env.NEXTAUTH_SECRET = 'test-secret';

    const adminCredentials = reloadModule<AdminCredentialsModule>(
      '../lib/auth/adminCredentials'
    );

    await runCase('admin login succeeds with login ID and password', async () => {
      const result = await adminCredentials.authorizeAdminCredentials({
        loginId: 'admin',
        password: testPassword,
      });

      expect(result, 'expected credentials authorization to return a user');
      expect(result?.role === 'super_admin', 'expected super_admin role');
      expect(result?.isActive === true, 'expected active admin session');
    });

    await runCase('admin login accepts case-insensitive login ID', async () => {
      const result = await adminCredentials.authorizeAdminCredentials({
        loginId: 'AdMiN',
        password: testPassword,
      });

      expect(result?.userId === 'env-admin:admin', 'expected normalized admin user id');
    });

    await runCase('admin login accepts configured email as identifier', async () => {
      const result = await adminCredentials.authorizeAdminCredentials({
        loginId: 'ADMIN@EXAMPLE.COM',
        password: testPassword,
      });

      expect(result?.email === 'admin@example.com', 'expected normalized admin email');
    });

    await runCase('admin login rejects wrong password', async () => {
      const result = await adminCredentials.authorizeAdminCredentials({
        loginId: 'admin',
        password: 'wrong-password',
      });

      expect(result === null, 'expected invalid password to be rejected');
    });

    await runCase('admin login rejects unknown login ID', async () => {
      const result = await adminCredentials.authorizeAdminCredentials({
        loginId: 'editor',
        password: testPassword,
      });

      expect(result === null, 'expected unknown login id to be rejected');
    });

    process.env.ADMIN_PASSWORD_HASH = testHash.replace(/\$/g, '\\$');

    const escapedHashAdminCredentials = reloadModule<AdminCredentialsModule>(
      '../lib/auth/adminCredentials'
    );

    await runCase('admin login accepts bcrypt hashes copied with escaped dollar signs', async () => {
      const result = await escapedHashAdminCredentials.authorizeAdminCredentials({
        loginId: 'admin',
        password: testPassword,
      });

      expect(result?.userId === 'env-admin:admin', 'expected escaped hash normalization to work');
    });

    await runCase('isBootstrapAdminUserId detects env-admin user IDs', () => {
      expect(adminCredentials.isBootstrapAdminUserId('env-admin:admin'), 'expected env-admin:admin to match');
      expect(adminCredentials.isBootstrapAdminUserId('env-admin:qa.superadmin'), 'expected env-admin:qa.superadmin to match');
      expect(!adminCredentials.isBootstrapAdminUserId('66f1234567890abcdef12345'), 'expected DB user ID not to match');
      expect(!adminCredentials.isBootstrapAdminUserId('admin'), 'expected bare username not to match');
      expect(!adminCredentials.isBootstrapAdminUserId(null), 'expected null not to match');
    });

    await runCase('isConfiguredBootstrapLoginId detects configured bootstrap identifiers case-insensitively', () => {
      expect(adminCredentials.isConfiguredBootstrapLoginId('admin'), 'expected admin to match');
      expect(adminCredentials.isConfiguredBootstrapLoginId('ADMIN'), 'expected ADMIN to match');
      expect(adminCredentials.isConfiguredBootstrapLoginId('AdMiN'), 'expected AdMiN to match');
      expect(!adminCredentials.isConfiguredBootstrapLoginId('editor'), 'expected editor not to match');
      expect(!adminCredentials.isConfiguredBootstrapLoginId(''), 'expected empty string not to match');
    });
  } finally {
    restoreEnv(originalEnv);
  }

  if (failures > 0) {
    console.error(`\nAdmin credentials regression checks failed (${failures}).`);
    process.exit(1);
  }

  console.log('\nAdmin credentials regression checks passed.');
}

void main();
