// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSourceRelease } = require('../scripts/create-upload-zip');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateReleaseCi } = require('../scripts/verify-release-ci');

describe('source release boundary', () => {
  it('excludes credentials/runtime files and refuses uncommitted source', () => {
    const parent = path.resolve(tmpdir());
    const root = mkdtempSync(path.join(parent, 'lokswami-release-'));
    const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
    try {
      git(['init']); git(['config', 'user.name', 'Isolated test']); git(['config', 'user.email', 'test@example.invalid']);
      writeFileSync(path.join(root, '.gitattributes'), readFileSync('.gitattributes'));
      writeFileSync(path.join(root, '.gitignore'), 'lokswami-upload.zip\nrelease-evidence.json\n');
      writeFileSync(path.join(root, '.env.staging.local'), 'PRIVATE_SENTINEL=never-export\n');
      mkdirSync(path.join(root, 'data')); writeFileSync(path.join(root, 'data', 'private-leads.json'), '[]');
      writeFileSync(path.join(root, 'app.txt'), 'reviewed-source');
      git(['add', '.']); git(['commit', '-m', 'Isolated fixture']);
      const result = createSourceRelease(root);
      const archive = readFileSync(path.join(root, 'lokswami-upload.zip'));
      expect(archive.includes(Buffer.from('.env.staging.local'))).toBe(false);
      expect(archive.includes(Buffer.from('private-leads.json'))).toBe(false);
      expect(archive.includes(Buffer.from('app.txt'))).toBe(true);
      expect(result.sourceArchiveSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.sourceCommit).toBe(git(['rev-parse', 'HEAD']).trim());
      writeFileSync(path.join(root, 'app.txt'), 'unreviewed');
      expect(() => createSourceRelease(root)).toThrow('Commit or isolate');
    } finally {
      if (path.dirname(path.resolve(root)) !== parent || !path.basename(root).startsWith('lokswami-release-')) throw new Error('Unexpected temporary directory');
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('requires the intended workflow, main push, repository and successful exact SHA', () => {
    const expected = { repository: 'example/news', sha: 'a'.repeat(40) };
    const valid = { status: 'completed', conclusion: 'success', path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: expected.sha, repository: { full_name: expected.repository }, head_repository: { full_name: expected.repository } };
    expect(validateReleaseCi(valid, expected)).toBe(true);
    for (const patch of [{ conclusion: 'failure' }, { event: 'pull_request' }, { head_sha: 'b'.repeat(40) }, { head_branch: 'feature' }, { path: '.github/workflows/other.yml' }, { head_repository: { full_name: 'fork/news' } }]) {
      expect(validateReleaseCi({ ...valid, ...patch }, expected)).toBe(false);
    }
  });
});
