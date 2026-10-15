import React from 'react';
import { act } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePublicationReaderTheme } from '@/lib/hooks/usePublicationReaderTheme';
import { useAppStore } from '@/lib/store/appStore';

const initial = useAppStore.getState();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
function ReaderTheme() {
  const theme = usePublicationReaderTheme();
  return <div className={theme === 'dark' ? 'dark' : ''}><button aria-label={theme === 'dark' ? 'Switch reader to light mode' : 'Switch reader to dark mode'}>{theme}</button></div>;
}
afterEach(() => {
  act(() => root?.unmount());
  root = undefined; container?.remove(); container = undefined;
  useAppStore.setState(initial);
});
describe('publication reader theme hydration', () => {
  it.each(['light','dark'] as const)('hydrates matching server markup before applying %s preference', async theme => {
    useAppStore.setState({theme});
    container = document.createElement('div'); document.body.append(container);
    container.innerHTML = renderToString(<ReaderTheme />);
    expect(container.textContent).toBe('dark');
    const recover = vi.fn();
    await act(async () => { root = hydrateRoot(container!, <ReaderTheme />, {onRecoverableError:recover}); });
    expect(recover).not.toHaveBeenCalled();
    expect(container.textContent).toBe(theme);
    expect(container.querySelector('div')?.className).toBe(theme === 'dark' ? 'dark' : '');
    act(() => useAppStore.setState({theme:theme === 'dark' ? 'light' : 'dark'}));
    expect(container.textContent).toBe(theme === 'dark' ? 'light' : 'dark');
  });
});
