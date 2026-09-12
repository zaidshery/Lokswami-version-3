import path from 'node:path';
import dotenv from 'dotenv';
import { hashPassword } from '@/lib/auth/jwt';
import {
  assertCmsQaEnvironmentSafe,
  CMS_QA_IDENTITIES,
  isClearlyReservedCmsQaAccount,
  readCmsQaPassword,
} from './safety';

type ExistingQaAccount = {
  email?: unknown;
  loginId?: unknown;
  name?: unknown;
};

function loadLocalEnvironment() {
  const projectRoot = path.resolve(__dirname, '..', '..');
  dotenv.config({ path: path.join(projectRoot, '.env.local'), override: false });
  dotenv.config({ path: path.join(projectRoot, '.env'), override: false });
}

export async function provisionCmsQaAccounts(env: NodeJS.ProcessEnv = process.env) {
  const safety = assertCmsQaEnvironmentSafe(env);
  const [{ default: connectDB }, { default: User }] = await Promise.all([
    import('@/lib/db/mongoose'),
    import('@/lib/models/User'),
  ]);

  const connection = await connectDB();
  try {
    const emails = CMS_QA_IDENTITIES.map((identity) => identity.email);
    const existingAccounts = (await User.find({ email: { $in: emails } }).lean()) as ExistingQaAccount[];
    const existingByEmail = new Map(
      existingAccounts.map((record) => [String(record.email || '').trim().toLowerCase(), record])
    );

    for (const identity of CMS_QA_IDENTITIES) {
      const existing = existingByEmail.get(identity.email);
      if (existing && !isClearlyReservedCmsQaAccount(existing, identity)) {
        throw new Error(
          `Refusing to modify ${identity.email}: the existing account is not clearly CMS-QA-reserved.`
        );
      }
    }

    const passwordHashes = await Promise.all(
      CMS_QA_IDENTITIES.map((identity) => hashPassword(readCmsQaPassword(identity, env)))
    );

    const results = [];
    for (const [index, identity] of CMS_QA_IDENTITIES.entries()) {
      const passwordHash = passwordHashes[index];
      const existed = existingByEmail.has(identity.email);
      await User.findOneAndUpdate(
        { email: identity.email },
        {
          $set: {
            name: identity.name,
            loginId: identity.loginId,
            role: identity.role,
            passwordHash,
            passwordSetAt: new Date(),
            isActive: true,
          },
          $setOnInsert: {
            email: identity.email,
            image: '',
            savedArticles: [],
            preferredLanguage: 'hi',
            preferredCategories: [],
            notificationsEnabled: false,
          },
          $unset: {
            setupTokenHash: 1,
            setupTokenExpiresAt: 1,
            setupTokenIssuedAt: 1,
          },
        },
        { upsert: true, new: true, runValidators: true }
      );

      results.push({
        email: identity.email,
        loginId: identity.loginId,
        role: identity.role,
        action: existed ? 'updated' : 'created',
      });
    }

    return { safety, accounts: results };
  } finally {
    await connection.disconnect();
  }
}

async function main() {
  loadLocalEnvironment();
  const result = await provisionCmsQaAccounts(process.env);

  console.log('LokSwami local CMS QA accounts provisioned.');
  console.log(`Target: ${result.safety.targetDescription}`);
  for (const account of result.accounts) {
    console.log(`${account.action}: ${account.email} (${account.role}, login: ${account.loginId})`);
  }
  console.log('Passwords and password hashes were not printed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'CMS QA provisioning failed.');
    process.exitCode = 1;
  });
}
