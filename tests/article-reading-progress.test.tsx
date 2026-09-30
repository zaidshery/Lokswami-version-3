import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleReadingProgress from '@/components/article/ArticleReadingProgress';

describe('article reading progress', () => {
  let scroll = 0;
  let viewport = 800;
  let height = 1800;
  let start = 200;
  let frameId = 0;
  let frames: Map<number, FrameRequestCallback>;
  let region: HTMLElement;
  let resize: ResizeObserverCallback;
  const disconnect = vi.fn();
  const observe = vi.fn();
  const onProgress = vi.fn();

  const flush = () => act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => callback(0));
  });
  const mount = () => {
    const regionRef = { current: region };
    const view = render(<ArticleReadingProgress regionRef={regionRef} articleId="story-one" onProgress={onProgress} />);
    return { ...view, regionRef, bar: view.container.querySelector('[data-article-reading-progress] > div') as HTMLDivElement };
  };

  beforeEach(() => {
    scroll = 0; viewport = 800; height = 1800; start = 200; frameId = 0;
    frames = new Map();
    vi.clearAllMocks();
    region = document.createElement('article');
    document.body.append(region);
    vi.spyOn(region, 'getBoundingClientRect').mockImplementation(() => ({
      top: start - scroll, height, bottom: start - scroll + height,
      left: 0, right: 720, width: 720, x: 0, y: start - scroll, toJSON: () => ({}),
    }));
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scroll);
    vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => viewport);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.set(++frameId, callback); return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
  });
  afterEach(() => { cleanup(); region.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('starts at zero and reaches the article end before recommendations/footer', () => {
    const { bar, container } = mount();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(bar.style.transform).toBe('scaleX(0)');
    flush();
    scroll = 700; fireEvent.scroll(window); flush();
    expect(bar.style.transform).toBe('scaleX(0.5)');
    scroll = 1200; fireEvent.scroll(window); flush();
    expect(bar.style.transform).toBe('scaleX(1)');
    scroll = 5000; fireEvent.scroll(window); flush();
    expect(bar.style.transform).toBe('scaleX(1)');
    expect(onProgress.mock.calls.map(([value]) => value)).toEqual([0, 50, 100]);
  });

  it('coalesces passive scroll events into one animation frame', () => {
    const listener = vi.spyOn(window, 'addEventListener');
    const { bar } = mount(); flush();
    expect(listener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    scroll = 700;
    for (let i = 0; i < 10; i++) fireEvent.scroll(window);
    expect(frames.size).toBe(1);
    expect(bar.style.transform).toBe('scaleX(0)');
    flush();
    expect(bar.style.transform).toBe('scaleX(0.5)');
  });

  it('remeasures viewport, content and image changes', () => {
    const { bar } = mount(); flush();
    scroll = 700; viewport = 1000; fireEvent.resize(window); flush();
    expect(bar.style.transform).toBe('scaleX(0.625)');
    height = 2000; resize([], {} as ResizeObserver); flush();
    expect(bar.style.transform).toBe('scaleX(0.5)');
    height = 3000; region.dispatchEvent(new Event('load')); flush();
    expect(bar.style.transform).toBe('scaleX(0.25)');
  });

  it('handles short articles without dividing by zero or negative progress', () => {
    height = 300;
    const { bar } = mount(); flush();
    expect(bar.style.transform).toBe('scaleX(0)');
    scroll = start + 1; fireEvent.scroll(window); flush();
    expect(bar.style.transform).toBe('scaleX(1)');
  });

  it('restores visual progress without attributing an old scroll position as a new read', () => {
    scroll = 1200;
    const { bar } = mount(); flush();
    expect(bar.style.transform).toBe('scaleX(1)');
    expect(onProgress).not.toHaveBeenCalled();
    fireEvent.scroll(window); flush();
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it('resets on article navigation and removes pending work/listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = mount(); flush();
    scroll = 700; fireEvent.scroll(window); flush();
    start = 900;
    view.rerender(<ArticleReadingProgress regionRef={view.regionRef} articleId="story-two" onProgress={onProgress} />);
    expect(view.bar.style.transform).toBe('scaleX(0)');
    flush();
    fireEvent.scroll(window);
    view.unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
