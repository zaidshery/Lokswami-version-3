import React, { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PublicationReaderOverlay from '@/components/epaper/reader/PublicationReaderOverlay';
import EPaperToolbar from '@/components/epaper/reader/EPaperToolbar';
import { useAppStore } from '@/lib/store/appStore';

const initial = useAppStore.getState();
let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; container?.remove(); container = undefined; act(()=>useAppStore.setState(initial)); });
const props = {title:'QA issue',editionLabel:'Monthly Issue',issueDateLabel:'September',currentPage:16,pageCount:32,zoom:1,onPreviousPage:vi.fn(),onNextPage:vi.fn(),onPageSelect:vi.fn(),onZoomIn:vi.fn(),onZoomOut:vi.fn(),onClose:vi.fn(),onToggleTheme:vi.fn(),shareUrl:'https://example.test/main/e-magazine',shareText:'QA',language:'en' as const};

describe('publication theme subscriptions remain in the surface and toolbar', () => {
  it('changes the surface without rerendering its un-memoized canvas/navigation children or losing focus', () => {
    useAppStore.setState({theme:'dark'});
    const childRender=vi.fn(), ref=createRef<HTMLDivElement>();
    function ReaderControls(){childRender();return <button>Next page control</button>;}
    render(<PublicationReaderOverlay ref={ref} role="dialog" aria-label="QA reader" className="fixed"><ReaderControls /></PublicationReaderOverlay>);
    const next=screen.getByRole('button');next.focus();const calls=childRender.mock.calls.length;
    act(()=>useAppStore.setState({theme:'light'}));
    expect(childRender).toHaveBeenCalledTimes(calls);expect(ref.current?.classList.contains('dark')).toBe(false);expect(ref.current?.classList.contains('fixed')).toBe(true);expect(document.activeElement).toBe(next);
    act(()=>useAppStore.setState({theme:'dark'}));expect(childRender).toHaveBeenCalledTimes(calls);expect(ref.current?.classList.contains('dark')).toBe(true);
  });
  it.each(['light','dark'] as const)('hydrates the server snapshot safely, then applies %s without rerendering the child', async theme=>{
    useAppStore.setState({theme});const childRender=vi.fn();
    function Canvas(){childRender();return <div data-page="16">QA canvas</div>;}
    const reader=<PublicationReaderOverlay role="dialog" aria-label="QA reader"><Canvas /></PublicationReaderOverlay>;
    container=document.createElement('div');document.body.append(container);container.innerHTML=renderToString(reader);expect(container.firstElementChild?.classList.contains('dark')).toBe(true);
    childRender.mockClear();const recover=vi.fn();await act(async()=>{root=hydrateRoot(container!,reader,{onRecoverableError:recover});});
    expect(recover).not.toHaveBeenCalled();expect(childRender).toHaveBeenCalledTimes(1);expect(container.firstElementChild?.classList.contains('dark')).toBe(theme==='dark');
    act(()=>useAppStore.setState({theme:theme==='dark'?'light':'dark'}));expect(childRender).toHaveBeenCalledTimes(1);
  });
  it('updates toolbar language label from the sanctioned theme store and preserves Next handler',()=>{
    useAppStore.setState({theme:'light'});render(<EPaperToolbar {...props} canGoNext />);
    expect(screen.getAllByRole('button',{name:'Switch reader to dark mode'}).length).toBeGreaterThan(0);
    act(()=>useAppStore.setState({theme:'dark'}));expect(screen.getAllByRole('button',{name:'Switch reader to light mode'}).length).toBeGreaterThan(0);
    const before=props.onNextPage.mock.calls.length;fireEvent.click(screen.getAllByRole('button',{name:'Next page'})[0]);expect(props.onNextPage).toHaveBeenCalledTimes(before+1);
  });
  it('retains an explicit toolbar theme override',()=>{
    useAppStore.setState({theme:'dark'});render(<EPaperToolbar {...props} theme="light" />);
    expect(screen.getAllByRole('button',{name:'Switch reader to dark mode'}).length).toBeGreaterThan(0);
  });
});
