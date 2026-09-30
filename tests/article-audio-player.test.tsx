import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleAudioPlayer from '@/components/article/ArticleAudioPlayer';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ai/ttsClient', async () => ({ ...await vi.importActual<typeof import('@/lib/ai/ttsClient')>('@/lib/ai/ttsClient'), requestArticleTtsAudio: request }));

class ControlledAudio {
  static instances: ControlledAudio[] = [];
  currentTime = 0;
  duration = 100;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  constructor(public src: string) { ControlledAudio.instances.push(this); }
}
const props = { articleId: 'story-one', text: 'First sentence. Second sentence.', contentLanguage: 'en' as const, language: 'en' as const };
const mount = (language: 'hi' | 'en' = 'en') => render(<ArticleAudioPlayer {...props} language={language} />);
const start = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }));
  await screen.findByRole('button', { name: 'Pause' });
  return ControlledAudio.instances.at(-1)!;
};
beforeEach(() => {
  request.mockReset().mockResolvedValue({ audioUrl: '/offline-article.mp3' });
  ControlledAudio.instances = [];
  vi.stubGlobal('Audio', ControlledAudio);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('article audio player using the real playback hook', () => {
  it.each(['hi', 'en'] as const)('renders localized idle controls without requesting or playing audio in %s', language => {
    mount(language);
    expect(screen.getByRole('button', { name: language === 'hi' ? 'लेख सुनें' : 'Listen to article' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(language === 'hi' ? 'सुनें चुनने पर' : 'only when you choose');
    expect(request).not.toHaveBeenCalled();
    expect(ControlledAudio.instances).toHaveLength(0);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('exposes preparing state and prevents repeated requests', async () => {
    let resolve!: (value: { audioUrl: string }) => void;
    request.mockReturnValue(new Promise(value => { resolve = value; }));
    mount();
    const button = screen.getByRole('button', { name: 'Listen to article' });
    fireEvent.click(button); fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Preparing audio…' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Listen to article' })).toHaveAttribute('aria-busy', 'true');
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ audioUrl: '/offline-article.mp3' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeEnabled();
  });

  it('plays, pauses, resumes, completes and replays cached audio with actual progress', async () => {
    mount();
    const audio = await start();
    expect(audio.play).toHaveBeenCalledTimes(1);
    audio.currentTime = 35;
    act(() => audio.ontimeupdate?.());
    expect(screen.getByRole('progressbar', { name: 'Article audio progress' })).toHaveAttribute('value', '35');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(audio.pause).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(audio.play).toHaveBeenCalledTimes(2);
    act(() => audio.onended?.());
    expect(screen.getByRole('status')).toHaveTextContent('Audio complete');
    fireEvent.click(screen.getByRole('button', { name: 'Listen again' }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(ControlledAudio.instances).toHaveLength(2);
  });

  it('restarts and stops the current recording', async () => {
    mount(); const audio = await start();
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(ControlledAudio.instances).toHaveLength(2));
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.currentTime).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('button', { name: 'Listen to article' })).toBeEnabled();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows a safe localized failure and permits retry when network and speech are unavailable', async () => {
    request.mockRejectedValue(new Error('PRIVATE server detail'));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Audio unavailable'));
    expect(screen.queryByText(/PRIVATE/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Listen to article' })).toBeEnabled();
    request.mockResolvedValue({ audioUrl: '/retry.mp3' });
    await start();
    expect(screen.getByRole('status')).toHaveTextContent('Playing');
  });

  it('uses the existing browser speech fallback and reports chunk progress', async () => {
    const utterances: SpeechSynthesisUtterance[] = [];
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], speak: (value: SpeechSynthesisUtterance) => utterances.push(value), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    request.mockRejectedValue(new Error('No manual recording'));
    mount(); await start();
    expect(screen.getByText('Reading with your browser voice')).toBeInTheDocument();
    expect(utterances[0].lang).toBe('en-IN');
    act(() => utterances[0].onend?.({} as SpeechSynthesisEvent));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50');
    act(() => utterances[1].onend?.({} as SpeechSynthesisEvent));
    expect(screen.getByRole('button', { name: 'Listen again' })).toBeEnabled();
  });

  it('aborts a pending request on navigation and ignores its late result', async () => {
    let resolve!: (value: { audioUrl: string }) => void;
    request.mockReturnValue(new Promise(value => { resolve = value; }));
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }));
    const signal = request.mock.calls[0][1] as AbortSignal;
    view.rerender(<ArticleAudioPlayer {...props} articleId="story-two" />);
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ audioUrl: '/old-story.mp3' }));
    expect(ControlledAudio.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Listen to article' })).toBeEnabled();
  });

  it('stops playback and detaches media handlers on unmount', async () => {
    const view = mount(); const audio = await start(); view.unmount();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.onended).toBeNull(); expect(audio.onerror).toBeNull(); expect(audio.ontimeupdate).toBeNull();
  });

  it('cancels preparation immediately without playing a late response', async () => {
    let resolve!: (value: { audioUrl: string }) => void;
    request.mockReturnValue(new Promise(value => { resolve = value; }));
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect((request.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    await act(async () => resolve({ audioUrl: '/cancelled.mp3' }));
    expect(ControlledAudio.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Listen to article' })).toBeEnabled();
  });

  it('ends a failed speech fallback without falsely reporting completion', async () => {
    const utterances: SpeechSynthesisUtterance[] = [];
    vi.stubGlobal('speechSynthesis', { getVoices: () => [], speak: (value: SpeechSynthesisUtterance) => utterances.push(value), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    request.mockRejectedValue(new Error('No recording'));
    mount(); await start();
    act(() => utterances[0].onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent));
    expect(screen.getByRole('status')).toHaveTextContent('Audio unavailable');
    expect(screen.queryByRole('button', { name: 'Listen again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Listen to article' })).toBeEnabled();
  });

  it('clears a failed resume instead of leaving a permanently paused control', async () => {
    mount(); const audio = await start();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    audio.play.mockRejectedValueOnce(new Error('Raw playback failure'));
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Audio unavailable'));
    expect(screen.queryByText(/Raw playback failure/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Listen to article' })).toBeEnabled();
  });

  it('does not revive playback from a late rejected play promise after unmount', async () => {
    let reject!: (value: Error) => void;
    const delayed = new Promise<void>((_, rejectValue) => { reject = rejectValue; });
    const view = mount();
    request.mockImplementation(async () => {
      // Delay play on the real media adapter rather than replacing the hook.
      class DelayedAudio extends ControlledAudio { play = vi.fn().mockReturnValue(delayed); }
      vi.stubGlobal('Audio', DelayedAudio);
      return { audioUrl: '/delayed.mp3' };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }));
    await waitFor(() => expect(ControlledAudio.instances).toHaveLength(1));
    view.unmount();
    await act(async () => reject(new Error('late cancellation')));
    expect(ControlledAudio.instances[0].onended).toBeNull();
  });

  it('times out a stalled audio lookup and leaves loading through the fallback', async () => {
    vi.useFakeTimers();
    request.mockImplementation((_: string, signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }));
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.getByRole('button', { name: 'Listen to article' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Audio unavailable');
  });
});
