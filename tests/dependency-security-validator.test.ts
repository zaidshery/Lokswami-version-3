import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { findUnsafeDependencies } = createRequire(import.meta.url)('../scripts/validate-dependency-security.js') as {
  findUnsafeDependencies: (lockfile: { packages: Record<string, { version: string }> }) => string[];
};

describe('dependency security validator', () => {
  it.each([
    ['next', '15.5.27', '15.5.28'],
    ['sharp', '0.35.4', '0.35.5'],
    ['@tiptap/core', '3.30.4', '3.30.5'],
    ['prosemirror-view', '1.42.2', '1.42.3'],
    ['postcss-selector-parser', '7.1.5', '7.1.6'],
    ['source-map-js', '1.2.1', '1.2.2'],
    ['vitest', '4.1.10', '4.1.11'],
    ['@vitest/mocker', '4.1.10', '4.1.11'],
    ['undici', '7.29.0', '7.29.1'],
    ['js-yaml', '4.3.1', '4.3.2'],
    ['brace-expansion', '1.1.20', '1.1.21'],
    ['brace-expansion', '5.0.11', '5.0.12'],
  ])('rejects vulnerable %s versions including nested copies', (name, vulnerable, patched) => {
    const root = `node_modules/${name}`;
    const nested = `node_modules/parent/node_modules/${name}`;
    expect(findUnsafeDependencies({ packages: {
      [root]: { version: patched }, [nested]: { version: vulnerable },
    } })).toEqual([`${nested}@${vulnerable}`]);
    expect(findUnsafeDependencies({ packages: { [root]: { version: patched } } })).toEqual([]);
  });
  it('accepts the locked dependency tree after all tracked advisory fixes', () => {
    const output = execFileSync(
      process.execPath,
      [path.join(process.cwd(), 'scripts', 'validate-dependency-security.js')],
      { encoding: 'utf8' }
    );

    expect(output).toContain(
      'Dependency security check passed for all tracked advisory ranges.'
    );
  });
});
