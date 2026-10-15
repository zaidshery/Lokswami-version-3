import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  disconnect: vi.fn(),
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock('@/lib/db/mongoose', () => ({ default: mocks.connectDB }));
vi.mock('@/lib/models/User', () => ({
  default: {
    find: mocks.find,
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
}));
vi.mock('@/lib/auth/jwt', () => ({ hashPassword: mocks.hashPassword }));

import { provisionCmsQaAccounts } from '@/scripts/cms-qa/provision';
import { CMS_QA_IDENTITIES } from '@/scripts/cms-qa/safety';

const PASSWORDS = Object.fromEntries(
  CMS_QA_IDENTITIES.map((identity, index) => [identity.passwordEnv, `local-qa-password-${index}`])
);

function safeEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    LOKSWAMI_CMS_QA: 'true',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/lokswami_cms_qa',
    LOKSWAMI_CMS_QA_DB_NAME: 'lokswami_cms_qa',
    ...PASSWORDS,
  } as NodeJS.ProcessEnv;
}

describe('CMS QA provisioner service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectDB.mockResolvedValue({ disconnect: mocks.disconnect });
    mocks.find.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mocks.findOneAndUpdate.mockResolvedValue({});
    mocks.hashPassword.mockImplementation(async (password: string) => `hash:${password.length}`);
  });

  it('upserts only the four exact identities with canonical roles and no plaintext writes', async () => {
    const result = await provisionCmsQaAccounts(safeEnv());

    expect(result.accounts).toHaveLength(4);
    expect(mocks.find).toHaveBeenCalledWith({
      $or: [
        { email: { $in: CMS_QA_IDENTITIES.map((identity) => identity.email) } },
        { loginId: { $in: CMS_QA_IDENTITIES.map((identity) => identity.loginId) } },
      ],
    });
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(4);
    for (const [index, identity] of CMS_QA_IDENTITIES.entries()) {
      const [filter, update, options] = mocks.findOneAndUpdate.mock.calls[index];
      expect(filter).toEqual({ email: identity.email });
      expect(update.$set).toMatchObject({
        name: identity.name,
        loginId: identity.loginId,
        role: identity.role,
        isActive: true,
      });
      expect(update.$set.passwordHash).toBe(`hash:${PASSWORDS[identity.passwordEnv].length}`);
      expect(JSON.stringify(update)).not.toContain(PASSWORDS[identity.passwordEnv]);
      expect(options).toMatchObject({ upsert: true, new: true, runValidators: true });
    }
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it('is idempotent for canonical reserved accounts', async () => {
    mocks.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue(
        CMS_QA_IDENTITIES.map(({ email, loginId, name }) => ({ email, loginId, name }))
      ),
    });

    const result = await provisionCmsQaAccounts(safeEnv());

    expect(result.accounts.every((account) => account.action === 'updated')).toBe(true);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(4);
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });

  it.each([
    {
      email: CMS_QA_IDENTITIES[1].email,
      loginId: 'real-admin',
      name: 'Existing Admin',
    },
    {
      email: 'existing-admin@localhost.example',
      loginId: CMS_QA_IDENTITIES[1].loginId,
      name: 'Existing Admin',
    },
  ])('aborts all writes before hashing for reserved identity collisions: $email', async (collision) => {
    mocks.find.mockReturnValue({
      lean: vi.fn().mockResolvedValue([collision]),
    });

    await expect(provisionCmsQaAccounts(safeEnv())).rejects.toThrow(/reserved email or login ID/);
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  });
});
