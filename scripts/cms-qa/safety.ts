import {
  isLocalMongoUri,
  parseMongoDatabaseName,
} from '@/scripts/demo/safety';
import type { AdminRole } from '@/lib/auth/roles';

export const CMS_QA_PASSWORD_MIN_LENGTH = 12;

export const CMS_QA_IDENTITIES = [
  {
    email: 'qa-super-admin@localhost.example',
    loginId: 'qa-super-admin',
    name: 'LokSwami QA Super Admin',
    role: 'super_admin',
    passwordEnv: 'LOKSWAMI_QA_SUPER_ADMIN_PASSWORD',
  },
  {
    email: 'qa-admin@localhost.example',
    loginId: 'qa-admin',
    name: 'LokSwami QA Admin',
    role: 'admin',
    passwordEnv: 'LOKSWAMI_QA_ADMIN_PASSWORD',
  },
  {
    email: 'qa-copy-editor@localhost.example',
    loginId: 'qa-copy-editor',
    name: 'LokSwami QA Copy Editor',
    role: 'copy_editor',
    passwordEnv: 'LOKSWAMI_QA_COPY_EDITOR_PASSWORD',
  },
  {
    email: 'qa-reporter@localhost.example',
    loginId: 'qa-reporter',
    name: 'LokSwami QA Reporter',
    role: 'reporter',
    passwordEnv: 'LOKSWAMI_QA_REPORTER_PASSWORD',
  },
] as const satisfies readonly {
  email: string;
  loginId: string;
  name: string;
  role: AdminRole;
  passwordEnv: string;
}[];

export type CmsQaIdentity = (typeof CMS_QA_IDENTITIES)[number];

export type CmsQaExistingAccount = {
  email?: unknown;
  loginId?: unknown;
  name?: unknown;
};

export type CmsQaSafetyResult = {
  dbName: string;
  targetDescription: string;
};

const NON_PRODUCTION_DB_MARKER = /(?:^|[_-])(dev|development|local|qa|test|testing|sandbox)(?:$|[_-])/i;
const PRODUCTION_DB_MARKER = /(?:^|[_-])(prod|production|live)(?:$|[_-])/i;

function normalize(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isClearlyReservedCmsQaAccount(
  record: CmsQaExistingAccount,
  identity: CmsQaIdentity
): boolean {
  return (
    normalize(record.email) === identity.email &&
    normalize(record.loginId) === identity.loginId &&
    (typeof record.name === 'string' ? record.name.trim() : '') === identity.name
  );
}

export function readCmsQaPassword(
  identity: CmsQaIdentity,
  env: NodeJS.ProcessEnv = process.env
): string {
  return String(env[identity.passwordEnv] || '');
}

export function assertCmsQaEnvironmentSafe(
  env: NodeJS.ProcessEnv = process.env
): CmsQaSafetyResult {
  if (env.NODE_ENV === 'production') {
    throw new Error('CMS QA provisioning is prohibited when NODE_ENV is "production".');
  }

  if (env.LOKSWAMI_CMS_QA !== 'true') {
    throw new Error(
      'CMS QA provisioning is disabled. Set LOKSWAMI_CMS_QA=true to opt in.'
    );
  }

  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) {
    throw new Error('CMS QA provisioning requires an explicit local MONGODB_URI.');
  }

  if (!isLocalMongoUri(mongoUri)) {
    throw new Error('CMS QA provisioning requires a loopback-only MongoDB target.');
  }

  const dbName = parseMongoDatabaseName(mongoUri);
  if (!dbName) {
    throw new Error('CMS QA provisioning requires an explicit MongoDB database name.');
  }

  const confirmedDbName = String(env.LOKSWAMI_CMS_QA_DB_NAME || '').trim();
  if (!confirmedDbName) {
    throw new Error(
      'CMS QA provisioning requires LOKSWAMI_CMS_QA_DB_NAME to confirm the local database.'
    );
  }

  if (confirmedDbName.toLowerCase() !== dbName.toLowerCase()) {
    throw new Error(
      `CMS QA database confirmation does not match the MONGODB_URI database "${dbName}".`
    );
  }

  if (PRODUCTION_DB_MARKER.test(dbName) || !NON_PRODUCTION_DB_MARKER.test(dbName)) {
    throw new Error(
      'CMS QA provisioning requires a clearly non-production database name containing dev, local, qa, test, or sandbox.'
    );
  }

  for (const identity of CMS_QA_IDENTITIES) {
    const password = readCmsQaPassword(identity, env);
    if (!password) {
      throw new Error(`CMS QA provisioning requires ${identity.passwordEnv}.`);
    }
    if (password.length < CMS_QA_PASSWORD_MIN_LENGTH) {
      throw new Error(
        `${identity.passwordEnv} must be at least ${CMS_QA_PASSWORD_MIN_LENGTH} characters.`
      );
    }
  }

  return {
    dbName,
    targetDescription: `Local MongoDB (${dbName})`,
  };
}
