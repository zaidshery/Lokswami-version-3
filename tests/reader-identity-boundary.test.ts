import { describe, expect, it, vi } from 'vitest';
import { ReaderIdentityService } from '@/lib/server/reader/readerIdentityService';
import type { ReaderRepository } from '@/lib/server/reader/readerRepository';

function repositoryReturning(role: unknown, isActive = true) {
  return {
    findCredential: vi.fn().mockResolvedValue({
      id: 'user-1',
      name: 'Account',
      email: 'account@example.com',
      image: '',
      role,
      isActive,
      optInDailyEpaper: true,
      savedArticles: [],
      passwordHash: '$2a$12$not-evaluated-for-ineligible-account',
      touchLastLogin: vi.fn(),
    }),
  } as unknown as ReaderRepository;
}

describe('Reader identity eligibility and fail-closed boundary', () => {
  it.each(['admin', 'super_admin', 'reporter', 'copy_editor'])(
    'does not authenticate a privileged %s account through Reader credentials',
    async (role) => {
      const service = new ReaderIdentityService(repositoryReturning(role));
      await expect(service.authorize({ loginId: 'account@example.com', password: 'secret' }))
        .resolves.toBeNull();
    }
  );

  it('does not authenticate an inactive Reader', async () => {
    const service = new ReaderIdentityService(repositoryReturning('reader', false));
    await expect(service.authorize({ loginId: 'reader@example.com', password: 'secret' }))
      .resolves.toBeNull();
  });

  it('fails closed when the authoritative repository is unavailable', async () => {
    const repository = {
      findCredential: vi.fn().mockRejectedValue(new Error('Mongo unavailable')),
    } as unknown as ReaderRepository;
    const service = new ReaderIdentityService(repository);
    await expect(service.authorize({ loginId: 'reader@example.com', password: 'secret' }))
      .resolves.toBeNull();
  });
});
