import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { projectReaderProfile } from '@/lib/server/reader/readerRepository';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf-8');

describe('Phase 2.5 Reader domain boundaries', () => {
  const routes = [
    'app/api/auth/register/route.ts',
    'app/api/user/profile/route.ts',
    'app/api/user/save/route.ts',
    'app/api/user/track/route.ts',
  ];

  it.each(routes)('%s has no raw persistence imports', (route) => {
    const source = read(route);
    expect(source).not.toMatch(/lib\/models\/(User|Article)/);
    expect(source).not.toContain('lib/db/mongoose');
    expect(source).not.toContain('lib/storage/usersFile');
    expect(source).not.toContain("from 'mongoose'");
  });

  it('keeps the stable Reader credentials facade and shared NextAuth boundary', () => {
    const facade = read('lib/auth/readerCredentials.ts');
    const nextAuthRoute = read('app/api/auth/[...nextauth]/route.ts');
    expect(facade).toContain('readerIdentityService.authorize(input)');
    expect(facade).not.toContain('User.find');
    expect(nextAuthRoute).toContain("export const { GET, POST } = handlers");
  });

  it('keeps Mongo-only save and tracking persistence in ReaderRepository', () => {
    const repository = read('lib/server/reader/readerRepository.ts');
    expect(repository).toContain('$addToSet: { savedArticles: targetId }');
    expect(repository).toContain('$pull: { savedArticles: targetId }');
    expect(repository).toContain('$slice: -50');
    expect(repository).not.toMatch(/trackRead[\s\S]*upsertStoredUser/);
  });

  it('projects only non-secret Reader profile fields, including hostile nested input', () => {
    const projected = projectReaderProfile({
      _id: 'reader-1',
      name: 'Reader',
      email: 'READER@EXAMPLE.COM',
      passwordHash: 'secret',
      passwordSetAt: new Date(),
      nested: { passwordHash: 'nested-secret' },
    });
    expect(projected.email).toBe('reader@example.com');
    expect(JSON.stringify(projected)).not.toContain('passwordHash');
    expect(JSON.stringify(projected)).not.toContain('passwordSetAt');
  });

  it.each(['admin', 'super_admin', 'reporter', 'copy_editor'] as const)(
    'preserves the %s role without projecting Mongo credential fields',
    (role) => {
      const projected = projectReaderProfile({
        _id: 'staff-1',
        name: 'Staff',
        email: 'staff@example.com',
        role,
        passwordHash: 'mongo-secret',
      });
      expect(projected.role).toBe(role);
      expect(JSON.stringify(projected)).not.toContain('passwordHash');
    }
  );

  it('does not make the Reader domain depend on shared NextAuth configuration', () => {
    for (const file of [
      'lib/server/reader/readerRepository.ts',
      'lib/server/reader/readerService.ts',
      'lib/server/reader/readerIdentityService.ts',
      'lib/server/reader/readerTypes.ts',
    ]) {
      expect(read(file)).not.toContain("from '@/lib/auth'");
    }
  });
});
