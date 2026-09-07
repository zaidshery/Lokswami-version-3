'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type TtsMode = 'audio' | 'speech' | 'none';

export interface UseArticleTtsOptions {
  audioUrl?: string | null;
  text?: string;
  title?: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

export interface UseArticleTtsState {
  isSupported: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  currentMode: TtsMode;
  playbackProgress: number;
}

export interface UseArticleTtsPlayParams {
  audioUrl?: string | null;
  text?: string;
  lang?: string;
}

export interface UseArticleTtsControls {
  play: (params?: UseArticleTtsPlayParams) => Promise<void> | void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

export type UseArticleTtsReturn = UseArticleTtsState & UseArticleTtsControls;

/**
 * Strips HTML tags, script/style blocks, Markdown syntax, and common editorial metadata.
 */
export function stripHtmlAndMarkdown(input: string): string {
  if (!input) return '';
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^>\s+/gm, '')
    .replace(/`{1,3}[^`\n]*`{1,3}/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits Devanagari (Hindi) and bilingual text into digestible chunks
 * split on punctuation (।, ॥, ?, !, \n, .) so iOS Safari and Chrome
 * do not stall or hit utterance size limits.
 */
export function chunkTextForSpeech(text: string, maxChunkLength = 160): string[] {
  const cleaned = stripHtmlAndMarkdown(text);
  if (!cleaned) return [];

  // Match sentences delimited by ।, ॥, ?, !, or .
  const sentenceRegex = /[^।॥?!.\n]+[।॥?!.\n]*/g;
  const rawSentences = cleaned.match(sentenceRegex) || [cleaned];
  const chunks: string[] = [];

  for (const rawSentence of rawSentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length <= maxChunkLength) {
      chunks.push(sentence);
    } else {
      // Sub-chunk long sentence on commas, semicolons, dashes, or whitespace
      const subParts = sentence.split(/([,;:—]+|\s+)/);
      let currentSubChunk = '';

      for (const part of subParts) {
        if (!part) continue;
        if ((currentSubChunk + part).length <= maxChunkLength) {
          currentSubChunk += part;
        } else {
          if (currentSubChunk.trim()) {
            chunks.push(currentSubChunk.trim());
          }
          currentSubChunk = part.trim();
        }
      }

      if (currentSubChunk.trim()) {
        chunks.push(currentSubChunk.trim());
      }
    }
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Evaluates candidate speech synthesis voices, giving highest priority to
 * neural Hindi voices (Google, Microsoft, Apple, Natural), with fallback to
 * Indian English (en-IN), general English, and system defaults.
 */
export function selectBestVoice(
  voices: SpeechSynthesisVoice[],
  preferredLang = 'hi-IN'
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const targetLang = preferredLang.toLowerCase().replace('_', '-');
  const targetPrefix = targetLang.split('-')[0];

  const getQualityScore = (voice: SpeechSynthesisVoice): number => {
    const name = voice.name.toLowerCase();
    let score = 0;
    if (
      name.includes('google') ||
      name.includes('microsoft') ||
      name.includes('natural') ||
      name.includes('neural')
    ) {
      score += 50;
    }
    if (name.includes('apple') || name.includes('siri') || name.includes('premium')) {
      score += 30;
    }
    if (voice.localService === false) {
      score += 10;
    }
    return score;
  };

  // 1. Exact language match (e.g. 'hi-in')
  const exactLangVoices = voices.filter((v) => {
    const vLang = v.lang.toLowerCase().replace('_', '-');
    return vLang === targetLang;
  });
  if (exactLangVoices.length > 0) {
    return exactLangVoices.sort((a, b) => getQualityScore(b) - getQualityScore(a))[0];
  }

  // 2. Language prefix match (e.g. 'hi')
  const prefixLangVoices = voices.filter((v) => {
    const vLang = v.lang.toLowerCase().replace('_', '-');
    return vLang.startsWith(targetPrefix);
  });
  if (prefixLangVoices.length > 0) {
    return prefixLangVoices.sort((a, b) => getQualityScore(b) - getQualityScore(a))[0];
  }

  // 3. Fallback to Indian English (en-IN) then general English
  if (targetPrefix === 'hi') {
    const enInVoices = voices.filter((v) => {
      const vLang = v.lang.toLowerCase().replace('_', '-');
      return vLang === 'en-in';
    });
    if (enInVoices.length > 0) {
      return enInVoices.sort((a, b) => getQualityScore(b) - getQualityScore(a))[0];
    }

    const enVoices = voices.filter((v) => {
      const vLang = v.lang.toLowerCase().replace('_', '-');
      return vLang.startsWith('en');
    });
    if (enVoices.length > 0) {
      return enVoices.sort((a, b) => getQualityScore(b) - getQualityScore(a))[0];
    }
  }

  // 4. Default system voice
  const defaultVoice = voices.find((v) => v.default);
  if (defaultVoice) return defaultVoice;

  return voices[0] || null;
}

export function useArticleTts(options: UseArticleTtsOptions = {}): UseArticleTtsReturn {
  const {
    audioUrl,
    text,
    lang = 'hi-IN',
    rate = 1.0,
    pitch = 1.0,
    onEnded,
    onError,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentMode, setCurrentMode] = useState<TtsMode>('none');
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  const isSupported =
    typeof window !== 'undefined' &&
    ('speechSynthesis' in window || typeof Audio !== 'undefined');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);
  const isCancelledRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Populate voices handling Chromium asynchronous onvoiceschanged
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const synth = window.speechSynthesis;
    const updateVoices = () => {
      const voices = synth.getVoices();
      if (voices && voices.length > 0) {
        setAvailableVoices(voices);
      }
    };

    updateVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }

    return () => {
      if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = null;
      }
    };
  }, []);

  const stop = useCallback(() => {
    isCancelledRef.current = true;

    // 1. Stop audio element if active
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current = null;
    }

    // 2. Stop speech synthesis if active
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    chunksRef.current = [];
    currentChunkIndexRef.current = 0;
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentMode('none');
    setPlaybackProgress(0);
  }, []);

  // Cleanup on unmount to prevent orphaned audio playing across page navigation
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const speakNextChunk = useCallback(() => {
    if (
      isCancelledRef.current ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window)
    ) {
      return;
    }

    const synth = window.speechSynthesis;
    const chunks = chunksRef.current;
    const index = currentChunkIndexRef.current;

    if (index >= chunks.length) {
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentMode('none');
      setPlaybackProgress(100);
      optionsRef.current.onEnded?.();
      return;
    }

    const chunk = chunks[index];
    const utterance = new SpeechSynthesisUtterance(chunk);
    const chosenLang = optionsRef.current.lang || 'hi-IN';
    utterance.lang = chosenLang;
    utterance.rate = optionsRef.current.rate ?? 1.0;
    utterance.pitch = optionsRef.current.pitch ?? 1.0;

    const voices = synth.getVoices();
    const voice = selectBestVoice(voices, chosenLang);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      if (isCancelledRef.current) return;
      currentChunkIndexRef.current += 1;
      const progress = Math.min(
        100,
        Math.round((currentChunkIndexRef.current / chunks.length) * 100)
      );
      setPlaybackProgress(progress);
      speakNextChunk();
    };

    utterance.onerror = (event) => {
      // Ignore user-induced cancellations or interruptions
      if (
        event.error === 'canceled' ||
        event.error === 'interrupted' ||
        isCancelledRef.current
      ) {
        return;
      }
      console.warn('Speech synthesis utterance error:', event.error);
      // Advance to next chunk on individual failure rather than stalling
      currentChunkIndexRef.current += 1;
      speakNextChunk();
    };

    synth.speak(utterance);
  }, []);

  const play = useCallback(
    async (params?: UseArticleTtsPlayParams) => {
      stop();
      isCancelledRef.current = false;

      const activeAudioUrl = params?.audioUrl !== undefined ? params.audioUrl : audioUrl;
      const activeText = params?.text !== undefined ? params.text : text;
      const activeLang = params?.lang || lang || 'hi-IN';

      // Mode 1: Remote MP3 Audio
      if (activeAudioUrl && activeAudioUrl.trim()) {
        try {
          const audio = new Audio(activeAudioUrl.trim());
          audioRef.current = audio;
          setCurrentMode('audio');
          setIsSpeaking(true);
          setIsPaused(false);

          audio.ontimeupdate = () => {
            if (audio.duration && !Number.isNaN(audio.duration)) {
              const progress = Math.min(
                100,
                Math.round((audio.currentTime / audio.duration) * 100)
              );
              setPlaybackProgress(progress);
            }
          };

          audio.onended = () => {
            setIsSpeaking(false);
            setIsPaused(false);
            setCurrentMode('none');
            setPlaybackProgress(100);
            optionsRef.current.onEnded?.();
          };

          audio.onerror = () => {
            console.warn('Remote audio playback failed, attempting speech fallback...');
            // Resilient fallback: if remote audio fails and we have text, fall back to Web Speech
            if (activeText && activeText.trim()) {
              audioRef.current = null;
              startSpeechSynthesis(activeText, activeLang);
            } else {
              stop();
              optionsRef.current.onError?.('Failed to play audio.');
            }
          };

          await audio.play();
          return;
        } catch (error) {
          console.warn('Audio play() threw error, attempting speech fallback:', error);
          if (activeText && activeText.trim()) {
            startSpeechSynthesis(activeText, activeLang);
            return;
          }
          stop();
          optionsRef.current.onError?.('Playback was interrupted.');
          return;
        }
      }

      // Mode 2: Client-side Web Speech API Fallback
      if (activeText && activeText.trim()) {
        startSpeechSynthesis(activeText, activeLang);
        return;
      }

      optionsRef.current.onError?.('No audio source or readable text available.');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [audioUrl, text, lang, stop]
  );

  const startSpeechSynthesis = (textToSpeak: string, languageCode: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      optionsRef.current.onError?.('Speech synthesis is not supported on this browser.');
      return;
    }

    const chunks = chunkTextForSpeech(textToSpeak);
    if (!chunks.length) {
      optionsRef.current.onError?.('No speakable text found.');
      return;
    }

    window.speechSynthesis.cancel();
    chunksRef.current = chunks;
    currentChunkIndexRef.current = 0;
    setCurrentMode('speech');
    setIsSpeaking(true);
    setIsPaused(false);
    setPlaybackProgress(0);

    speakNextChunk();
  };

  const pause = useCallback(() => {
    if (currentMode === 'audio' && audioRef.current) {
      audioRef.current.pause();
      setIsPaused(true);
      setIsSpeaking(false);
    } else if (
      currentMode === 'speech' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsSpeaking(false);
    }
  }, [currentMode]);

  const resume = useCallback(() => {
    if (currentMode === 'audio' && audioRef.current) {
      audioRef.current
        .play()
        .then(() => {
          setIsPaused(false);
          setIsSpeaking(true);
        })
        .catch((err) => {
          console.warn('Failed to resume audio:', err);
        });
    } else if (
      currentMode === 'speech' &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsSpeaking(true);
    }
  }, [currentMode]);

  return {
    isSupported,
    isSpeaking,
    isPaused,
    currentMode,
    playbackProgress,
    play,
    pause,
    resume,
    stop,
  };
}

export default useArticleTts;
