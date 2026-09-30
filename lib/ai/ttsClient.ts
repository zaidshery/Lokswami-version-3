import type { TtsLanguageOption, TtsVoiceOption } from '@/lib/constants/tts';

export type TtsStatusData = {
  configured: boolean;
  provider: 'manual' | null;
  supportedLanguages?: TtsLanguageOption[];
  voices: TtsVoiceOption[];
  model?: string;
  defaultVoice?: string;
  articleListenMode?: string;
  disclosure?: string;
};

export type TtsAudioData = {
  provider: 'manual';
  model: string;
  voice: string;
  mimeType: string;
  audioUrl: string;
  chunkCount: number;
};

type TtsStatusResponse = {
  success?: boolean;
  data?: Partial<Omit<TtsStatusData, 'voices'>> & {
    voices?: Array<TtsVoiceOption | string>;
  };
  error?: string;
};

type TtsAudioResponse = {
  success?: boolean;
  data?: Partial<TtsAudioData>;
  error?: string;
};

export async function fetchTtsStatus() {
  const response = await fetch('/api/ai/tts', {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => ({}))) as TtsStatusResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || 'TTS status is unavailable.');
  }

  const voices = Array.isArray(payload.data.voices)
    ? payload.data.voices
        .map((voice) => {
          if (typeof voice === 'string') {
            return { id: voice, label: voice };
          }

          if (
            voice &&
            typeof voice.id === 'string' &&
            typeof voice.label === 'string'
          ) {
            return voice;
          }

          return null;
        })
        .filter((voice): voice is TtsVoiceOption => Boolean(voice))
    : [];

  return {
    ...payload.data,
    configured: Boolean(payload.data.configured),
    provider:
      payload.data.provider === 'manual'
        ? payload.data.provider
        : null,
    voices,
  } satisfies TtsStatusData;
}

export async function requestArticleTtsAudio(
  articleId: string,
  signal?: AbortSignal
) {
  const response = await fetch(`/api/articles/${encodeURIComponent(articleId)}/tts`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const payload = (await response.json().catch(() => ({}))) as TtsAudioResponse;

  if (!response.ok || !payload?.success || !payload.data ||
      typeof payload.data.audioUrl !== 'string' || !payload.data.audioUrl.trim()) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Unable to load article audio.');
  }

  return payload.data as TtsAudioData;
}

export async function requestEpaperStoryTtsAudio(
  paperId: string,
  storyId: string
) {
  const response = await fetch(
    `/api/epapers/${encodeURIComponent(paperId)}/articles/${encodeURIComponent(storyId)}/tts`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  const payload = (await response.json().catch(() => ({}))) as TtsAudioResponse;

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || 'Unable to load e-paper story audio.');
  }

  return payload.data as TtsAudioData;
}

export function buildTtsAudioSource(payload: {
  audioUrl?: string;
}) {
  return typeof payload.audioUrl === 'string' ? payload.audioUrl.trim() : '';
}
