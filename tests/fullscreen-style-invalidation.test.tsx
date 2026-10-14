import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FullscreenFix from '@/components/providers/FullscreenFix';

const css = fs.readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
const fullscreenRule = css.slice(css.indexOf('html.fullscreen-active *,'), css.indexOf('/* Ensure the iframe'));
afterEach(() => { vi.unstubAllGlobals(); document.documentElement.classList.remove('fullscreen-active'); document.querySelectorAll('[data-qa-fullscreen-style]').forEach(node => node.remove()); });

describe('fullscreen fix uses the existing explicit state instead of subtree queries', () => {
  it('does not register document-wide relational fullscreen selectors', () => {
    expect(css).not.toMatch(/html:has\(:(?:fullscreen|-webkit-full-screen)\)/);
    expect(css).toContain('iframe:fullscreen,');
    expect(css).toContain('iframe:-webkit-full-screen');
  });
  it.each([
    ['fullscreenElement', 'fullscreenchange'],
    ['webkitFullscreenElement', 'webkitfullscreenchange'],
    ['mozFullScreenElement', 'mozfullscreenchange'],
    ['msFullscreenElement', 'MSFullscreenChange'],
  ])('preserves %s entry, exit and existing transform correction', (property, event) => {
    let active: Element | null = null;
    Object.defineProperty(document, property, { configurable: true, get: () => active });
    const style = document.createElement('style'); style.dataset.qaFullscreenStyle = ''; style.textContent = fullscreenRule; document.head.append(style);
    const { getByTestId } = render(<><FullscreenFix /><div data-testid="page" style={{ transform: 'scale(2)' }}>QA page</div></>);
    const page = getByTestId('page');
    expect(document.documentElement).not.toHaveClass('fullscreen-active');
    expect(getComputedStyle(page).transform).toBe('scale(2)');
    act(() => { active = page; document.dispatchEvent(new Event(event)); });
    expect(document.documentElement).toHaveClass('fullscreen-active');
    // The same stylesheet correction remains present for actual fullscreen.
    expect(fullscreenRule).toContain('transform: none !important;');
    act(() => { active = null; document.dispatchEvent(new Event(event)); });
    expect(document.documentElement).not.toHaveClass('fullscreen-active');
    expect(getComputedStyle(page).transform).toBe('scale(2)');
    delete (document as unknown as Record<string, unknown>)[property];
  });
  it('synchronizes an already-fullscreen document when the provider mounts', () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.body });
    const { unmount } = render(<FullscreenFix />);
    expect(document.documentElement).toHaveClass('fullscreen-active');
    unmount(); delete (document as unknown as Record<string, unknown>).fullscreenElement;
    document.documentElement.classList.remove('fullscreen-active');
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(document.documentElement).not.toHaveClass('fullscreen-active');
  });
});
