import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const layout = readFileSync(resolve(process.cwd(), 'app/layout.tsx'), 'utf8');
const literal = layout.match(/const ASSET_RECOVERY_SCRIPT = (`[\s\S]*?`);/)?.[1];
if (!literal) throw new Error('Shared asset recovery script was not found');
const script = runInNewContext(`(${literal})`) as string;

function recoveryHarness() {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const stored = new Map<string, string>();
  const replace = vi.fn();
  const window = {
    location: { href: 'https://qa.example/admin/work?view=mine', pathname: '/admin/work', replace },
    sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
    addEventListener: (name: string, callback: (event: Record<string, unknown>) => void) => handlers.set(name, callback),
    setTimeout: vi.fn(),
  };
  runInNewContext(script, { window, navigator: {}, URL }, { timeout: 1000 });
  return { replace, dispatch: async (name: string, event: Record<string, unknown>) => {
    handlers.get(name)?.(event);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  } };
}

describe('Shared stale-asset recovery', () => {
  it.each([
    'Minified React error #418; visit https://react.dev/errors/418?args[]=HTML',
    'TypeError: Cannot read properties of undefined',
  ])('does not reload healthy assets for a bundle runtime error: %s', async (message) => {
    const harness = recoveryHarness();
    await harness.dispatch('error', { message, filename: 'https://qa.example/_next/static/chunks/app.js' });
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it.each([
    { tagName: 'SCRIPT', src: 'https://qa.example/_next/static/chunks/app.js' },
    { tagName: 'LINK', href: 'https://qa.example/_next/static/css/app.css' },
  ])('recovers an actual failed $tagName application asset', async (target) => {
    const harness = recoveryHarness();
    await harness.dispatch('error', { target });
    expect(harness.replace).toHaveBeenCalledTimes(1);
    const recovery = new URL(harness.replace.mock.calls[0][0] as string);
    expect(recovery.pathname).toBe('/admin/work');
    expect(recovery.searchParams.get('view')).toBe('mine');
    expect(recovery.searchParams.has('__asset_recovery')).toBe(true);
  });

  it('recovers a genuine chunk rejection once even when a resource error is also delivered', async () => {
    const harness = recoveryHarness();
    await harness.dispatch('unhandledrejection', { reason: new Error('ChunkLoadError: Loading chunk 123 failed') });
    await harness.dispatch('error', { target: { tagName: 'SCRIPT', src: '/_next/static/chunks/123.js' } });
    expect(harness.replace).toHaveBeenCalledTimes(1);
  });
});
