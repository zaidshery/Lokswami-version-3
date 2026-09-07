import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chunkTextForSpeech,
  selectBestVoice,
  stripHtmlAndMarkdown,
  useArticleTts,
} from '@/lib/hooks/useArticleTts';

describe('useArticleTts and speech utilities', () => {
  describe('stripHtmlAndMarkdown', () => {
    it('strips HTML tags and entities', () => {
      const html = '<p>यह <strong>महत्वपूर्ण</strong> खबर है।&nbsp;&amp;&nbsp;विस्तार से पढ़ें।</p>';
      const cleaned = stripHtmlAndMarkdown(html);
      expect(cleaned).toBe('यह महत्वपूर्ण खबर है। & विस्तार से पढ़ें।');
    });

    it('strips script and style tags completely', () => {
      const dirty = '<div><script>alert(1)</script><style>.bad{color:red}</style>मुख्य समाचार।</div>';
      const cleaned = stripHtmlAndMarkdown(dirty);
      expect(cleaned).toBe('मुख्य समाचार।');
    });

    it('strips markdown formatting, links, and URLs', () => {
      const md = '# शीर्षक\n\n**बोल्ड टेक्स्ट** और [लिंक देखें](https://example.com) https://news.lokswami.in/story';
      const cleaned = stripHtmlAndMarkdown(md);
      expect(cleaned).toBe('शीर्षक बोल्ड टेक्स्ट और लिंक देखें');
    });
  });

  describe('chunkTextForSpeech', () => {
    it('splits text on Devanagari danda (।) and double danda (॥)', () => {
      const text = 'पहला वाक्य यहाँ है। दूसरा वाक्य यहाँ है॥ तीसरा वाक्य? चौथा वाक्य!';
      const chunks = chunkTextForSpeech(text);
      expect(chunks).toEqual([
        'पहला वाक्य यहाँ है।',
        'दूसरा वाक्य यहाँ है॥',
        'तीसरा वाक्य?',
        'चौथा वाक्य!',
      ]);
    });

    it('splits sentences exceeding maxChunkLength into sub-clauses', () => {
      const longSentence =
        'यह एक बहुत लंबा हिंदी समाचार वाक्य है जिसे विशेष रूप से जांचने के लिए तैयार किया गया है, ताकि यह सुनिश्चित किया जा सके कि वाक्य को सही सीमा में विभाजित किया जाए और सफारी ब्राउज़र पर कोई समस्या न आए।';
      const chunks = chunkTextForSpeech(longSentence, 80);
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(95); // subParts boundary tolerance
      });
    });

    it('returns empty array for empty or whitespace-only input', () => {
      expect(chunkTextForSpeech('')).toEqual([]);
      expect(chunkTextForSpeech('   \n\t  ')).toEqual([]);
    });
  });

  describe('selectBestVoice', () => {
    const mockVoices = [
      { name: 'Alex', lang: 'en-US', default: true, localService: true },
      { name: 'Google हिन्दी', lang: 'hi-IN', default: false, localService: false },
      { name: 'Microsoft Swara (Natural) - Hindi', lang: 'hi-IN', default: false, localService: true },
      { name: 'Ravi', lang: 'en-IN', default: false, localService: true },
    ] as unknown as SpeechSynthesisVoice[];

    it('prioritizes neural/Google/Microsoft Hindi voice over default voice', () => {
      const selected = selectBestVoice(mockVoices, 'hi-IN');
      expect(selected).not.toBeNull();
      expect(selected?.lang).toBe('hi-IN');
      expect(selected?.name).toMatch(/(Google|Microsoft)/);
    });

    it('falls back to Indian English (en-IN) if no Hindi voice is found', () => {
      const englishOnlyVoices = [
        { name: 'Alex', lang: 'en-US', default: true, localService: true },
        { name: 'Ravi', lang: 'en-IN', default: false, localService: true },
      ] as unknown as SpeechSynthesisVoice[];

      const selected = selectBestVoice(englishOnlyVoices, 'hi-IN');
      expect(selected?.lang).toBe('en-IN');
    });

    it('falls back to default system voice if neither Hindi nor Indian English are found', () => {
      const genericVoices = [
        { name: 'Alex', lang: 'en-US', default: true, localService: true },
      ] as unknown as SpeechSynthesisVoice[];

      const selected = selectBestVoice(genericVoices, 'hi-IN');
      expect(selected?.name).toBe('Alex');
    });
  });

  describe('useArticleTts Hook', () => {
    let mockSpeak: ReturnType<typeof vi.fn>;
    let mockCancel: ReturnType<typeof vi.fn>;
    let mockPause: ReturnType<typeof vi.fn>;
    let mockResume: ReturnType<typeof vi.fn>;
    let mockGetVoices: ReturnType<typeof vi.fn>;
    let capturedUtterances: any[] = [];
    let audioInstanceMock: any;

    beforeEach(() => {
      capturedUtterances = [];
      mockSpeak = vi.fn((utterance) => {
        capturedUtterances.push(utterance);
      });
      mockCancel = vi.fn();
      mockPause = vi.fn();
      mockResume = vi.fn();
      mockGetVoices = vi.fn(() => [
        { name: 'Google हिन्दी', lang: 'hi-IN', default: false, localService: false },
        { name: 'Default Voice', lang: 'en-US', default: true, localService: true },
      ]);

      // Mock SpeechSynthesis
      Object.defineProperty(window, 'speechSynthesis', {
        writable: true,
        configurable: true,
        value: {
          speak: mockSpeak,
          cancel: mockCancel,
          pause: mockPause,
          resume: mockResume,
          getVoices: mockGetVoices,
          onvoiceschanged: null,
        },
      });

      // Mock SpeechSynthesisUtterance
      class MockSpeechSynthesisUtterance {
        text: string;
        lang = 'hi-IN';
        rate = 1.0;
        pitch = 1.0;
        voice: any = null;
        onend: (() => void) | null = null;
        onerror: ((e: any) => void) | null = null;

        constructor(text: string) {
          this.text = text;
        }
      }

      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        writable: true,
        configurable: true,
        value: MockSpeechSynthesisUtterance,
      });

      // Mock HTMLAudioElement
      audioInstanceMock = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        currentTime: 0,
        duration: 100,
        ontimeupdate: null,
        onended: null,
        onerror: null,
      };

      function MockAudio() {
        return audioInstanceMock;
      }

      vi.stubGlobal('Audio', MockAudio);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.clearAllMocks();
    });

    it('initializes with default idle state and isSupported true', () => {
      const { result } = renderHook(() =>
        useArticleTts({
          text: 'टेस्ट समाचार।',
        })
      );

      expect(result.current.isSupported).toBe(true);
      expect(result.current.isSpeaking).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.currentMode).toBe('none');
      expect(result.current.playbackProgress).toBe(0);
    });

    it('Mode 2 (Web Speech Fallback): synthesizes speech when audioUrl is null/empty', async () => {
      const { result } = renderHook(() =>
        useArticleTts({
          text: 'पहला वाक्य। दूसरा वाक्य।',
          lang: 'hi-IN',
        })
      );

      await act(async () => {
        await result.current.play();
      });

      expect(mockCancel).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();
      expect(result.current.currentMode).toBe('speech');
      expect(result.current.isSpeaking).toBe(true);

      // Verify that the first utterance chunk was queued
      expect(capturedUtterances.length).toBe(1);
      expect(capturedUtterances[0].text).toBe('पहला वाक्य।');

      // Simulate chunk 1 onend event
      act(() => {
        capturedUtterances[0].onend?.();
      });

      // Verify second chunk was queued
      expect(capturedUtterances.length).toBe(2);
      expect(capturedUtterances[1].text).toBe('दूसरा वाक्य।');
      expect(result.current.playbackProgress).toBe(50);

      // Simulate chunk 2 onend event (narration completes)
      act(() => {
        capturedUtterances[1].onend?.();
      });

      expect(result.current.isSpeaking).toBe(false);
      expect(result.current.currentMode).toBe('none');
      expect(result.current.playbackProgress).toBe(100);
    });

    it('Mode 1 (Remote MP3): uses HTML5 Audio when audioUrl is provided', async () => {
      const { result } = renderHook(() =>
        useArticleTts({
          audioUrl: 'https://cdn.lokswami.in/audio/story-1.mp3',
          text: 'बैकअप टेक्स्ट।',
        })
      );

      await act(async () => {
        await result.current.play();
      });

      expect(audioInstanceMock.play).toHaveBeenCalled();
      expect(result.current.currentMode).toBe('audio');
      expect(result.current.isSpeaking).toBe(true);

      // Simulate timeupdate
      audioInstanceMock.currentTime = 50;
      audioInstanceMock.duration = 100;
      act(() => {
        audioInstanceMock.ontimeupdate?.();
      });

      expect(result.current.playbackProgress).toBe(50);

      // Simulate audio ended
      act(() => {
        audioInstanceMock.onended?.();
      });

      expect(result.current.isSpeaking).toBe(false);
      expect(result.current.currentMode).toBe('none');
      expect(result.current.playbackProgress).toBe(100);
    });

    it('pauses and resumes speech synthesis playback cleanly', async () => {
      const { result } = renderHook(() =>
        useArticleTts({
          text: 'टेस्ट वाक्य।',
        })
      );

      await act(async () => {
        await result.current.play();
      });

      act(() => {
        result.current.pause();
      });

      expect(mockPause).toHaveBeenCalled();
      expect(result.current.isPaused).toBe(true);
      expect(result.current.isSpeaking).toBe(false);

      act(() => {
        result.current.resume();
      });

      expect(mockResume).toHaveBeenCalled();
      expect(result.current.isPaused).toBe(false);
      expect(result.current.isSpeaking).toBe(true);
    });

    it('stop() cancels active speech and resets progress', async () => {
      const { result } = renderHook(() =>
        useArticleTts({
          text: 'वाक्य एक। वाक्य दो।',
        })
      );

      await act(async () => {
        await result.current.play();
      });

      act(() => {
        result.current.stop();
      });

      expect(mockCancel).toHaveBeenCalled();
      expect(result.current.isSpeaking).toBe(false);
      expect(result.current.isPaused).toBe(false);
      expect(result.current.currentMode).toBe('none');
      expect(result.current.playbackProgress).toBe(0);
    });

    it('cancels speech synthesis when the component unmounts to prevent orphaned playback', async () => {
      const { result, unmount } = renderHook(() =>
        useArticleTts({
          text: 'पेज छोड़ते समय रुकना चाहिए।',
        })
      );

      await act(async () => {
        await result.current.play();
      });

      unmount();
      expect(mockCancel).toHaveBeenCalled();
    });
  });
});
