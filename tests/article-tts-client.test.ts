import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTtsAudioSource, requestArticleTtsAudio } from '@/lib/ai/ttsClient';

afterEach(() => vi.unstubAllGlobals());
describe('article manual audio client contract', () => {
  it.each([
    'https://cdn.example.com/lokswami/tts/article/manual/listen.mp3',
    'https://storage.example.com/listen.wav?signature=fixture%2Bonly&expires=123',
    '/uploads/article/listen.mp3',
  ])('preserves a direct playable uploaded URL: %s', async audioUrl => {
    const data = { provider: 'manual', model: 'manual-upload', voice: 'manual-upload', mimeType: 'audio/mpeg', audioUrl, chunkCount: 1 };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true, data }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await requestArticleTtsAudio('article / id');
    expect(result).toEqual(data);
    expect(buildTtsAudioSource(result)).toBe(audioUrl);
    expect(fetchMock).toHaveBeenCalledWith('/api/articles/article%20%2F%20id/tts', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { success: true }, { success: true, data: {} }, { success: true, data: { audioUrl: 42 } }, { success: true, data: { audioUrl: ' ' } }])('rejects malformed or unavailable data for fallback: %j', async payload => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(requestArticleTtsAudio('story')).rejects.toThrow('Unable to load article audio');
  });

  it('rejects invalid JSON and missing manual assets without retrying or generating audio', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('invalid')).mockResolvedValueOnce(Response.json({ success: false, error: 'No uploaded asset' }, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestArticleTtsAudio('story')).rejects.toThrow('Unable to load article audio');
    await expect(requestArticleTtsAudio('story')).rejects.toThrow('No uploaded asset');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes cancellation through fetch unchanged', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fetchMock);
    const request = requestArticleTtsAudio('story', controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
