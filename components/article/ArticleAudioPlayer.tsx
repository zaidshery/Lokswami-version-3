'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Headphones, Loader2, Pause, Play, RotateCcw, Square } from 'lucide-react';
import { useArticleTts } from '@/lib/hooks/useArticleTts';
import { buildTtsAudioSource, requestArticleTtsAudio } from '@/lib/ai/ttsClient';
import styles from './ArticleReader.module.css';

const labels = {
  en: { title: 'Listen to article', idle: 'Audio plays only when you choose Listen.', preparing: 'Preparing audio…', listen: 'Listen', pause: 'Pause', resume: 'Resume', again: 'Listen again', restart: 'Restart', stop: 'Stop', playing: 'Playing', paused: 'Paused', complete: 'Audio complete', unavailable: 'Audio unavailable. Try again or continue reading.', fallback: 'Reading with your browser voice', progress: 'Article audio progress' },
  hi: { title: 'लेख सुनें', idle: 'सुनें चुनने पर ही ऑडियो चलेगा।', preparing: 'ऑडियो तैयार हो रहा है…', listen: 'सुनें', pause: 'रोकें', resume: 'जारी रखें', again: 'फिर सुनें', restart: 'शुरू से सुनें', stop: 'बंद करें', playing: 'ऑडियो चल रहा है', paused: 'ऑडियो रुका है', complete: 'ऑडियो पूरा हुआ', unavailable: 'ऑडियो उपलब्ध नहीं है। फिर कोशिश करें या लेख पढ़ें।', fallback: 'ब्राउज़र की आवाज़ में पढ़ा जा रहा है', progress: 'लेख के ऑडियो की प्रगति' },
};

export default function ArticleAudioPlayer({ articleId, text, contentLanguage, language, secondaryAction, children }: {
  articleId: string; text: string; contentLanguage: 'hi' | 'en'; language: 'hi' | 'en';
  secondaryAction?: ReactNode;
  children?: ReactNode;
}) {
  const copy = labels[language];
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const cachedSource = useRef<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tts = useArticleTts({ text, lang: contentLanguage === 'hi' ? 'hi-IN' : 'en-IN', onError: () => setFailed(true) });
  const { stop } = tts;

  const cancelRequest = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = null;
    busy.current = false;
  }, []);

  useEffect(() => {
    setHydrated(true);
    cachedSource.current = null;
    setPreparing(false);
    setFailed(false);
    return () => { cancelRequest(); stop(); };
  }, [articleId, contentLanguage, cancelRequest, stop]);

  const start = async () => {
    if (busy.current || !text.trim()) return;
    busy.current = true;
    const request = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setFailed(false);
    setPreparing(true);
    // Bound lookup and media preparation, even if either promise never settles.
    // Invalidate late work before stopping so it cannot revive playback.
    timeout.current = setTimeout(() => {
      if (request !== generation.current) return;
      cancelRequest();
      stop();
      setFailed(true);
      setPreparing(false);
    }, 15_000);
    try {
      let src = cachedSource.current;
      if (!src) {
        try {
          src = buildTtsAudioSource(await requestArticleTtsAudio(articleId, abort.signal)) || null;
        } catch { src = null; }
      }
      if (request !== generation.current) return;
      cachedSource.current = src;
      await tts.play({ audioUrl: src, text, lang: contentLanguage === 'hi' ? 'hi-IN' : 'en-IN' });
    } catch {
      if (request === generation.current) setFailed(true);
    } finally {
      if (request === generation.current) {
        if (timeout.current !== null) clearTimeout(timeout.current);
        timeout.current = null;
        busy.current = false;
        controller.current = null;
        setPreparing(false);
      }
    }
  };

  const active = tts.isSpeaking || tts.isPaused;
  const complete = !active && tts.playbackProgress === 100 && !failed;
  const unavailable = hydrated && (!tts.isSupported || !text.trim());
  const status = failed || unavailable ? copy.unavailable : preparing ? copy.preparing : tts.isPaused ? copy.paused : tts.isSpeaking ? copy.playing : complete ? copy.complete : language === 'hi' ? 'लेख सुनने के लिए सुनें दबाएँ।' : 'Tap Listen to hear this article.';
  const action = preparing ? copy.preparing : tts.isSpeaking ? copy.pause : tts.isPaused ? copy.resume : complete ? copy.again : copy.listen;
  const controlClass = 'reader-focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60';

  return (
    <section data-article-audio aria-label={copy.title} aria-busy={preparing} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 sm:p-5">
      <div className={styles.audioToolbar}>
      <div className="flex min-w-0 items-start gap-3">
        <Headphones className="mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{copy.title}</h2>
          <p role="status" aria-live="polite" aria-atomic="true" className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{status}</p>
          {tts.currentMode === 'speech' && active ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{copy.fallback}</p> : null}
        </div>
      </div>
      <div className={styles.audioButtons}>
        <button type="button" disabled={preparing || unavailable} aria-label={preparing ? copy.preparing : tts.isSpeaking ? copy.pause : tts.isPaused ? copy.resume : complete ? copy.again : copy.title}
          onClick={() => { if (tts.isSpeaking) tts.pause(); else if (tts.isPaused) tts.resume(); else void start(); }}
          className={`${controlClass} border-red-700 bg-red-700 text-white hover:bg-red-800 dark:border-red-500 dark:bg-red-600 dark:hover:bg-red-700`}>
          {preparing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : tts.isSpeaking ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}{action}
        </button>
        {secondaryAction}
        {active || preparing ? <>
          {active ? <button type="button" disabled={preparing} onClick={() => { stop(); void start(); }} className={`${controlClass} border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100`}><RotateCcw aria-hidden="true" className="h-4 w-4" />{copy.restart}</button> : null}
          <button type="button" onClick={() => { cancelRequest(); stop(); setPreparing(false); setFailed(false); }} className={`${controlClass} border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100`}><Square aria-hidden="true" className="h-4 w-4" />{copy.stop}</button>
        </> : null}
      </div>
      </div>
      {active || complete ? <div className="mt-4 flex items-center gap-3">
        <progress aria-label={copy.progress} value={tts.playbackProgress} max={100} className={`${styles.audioProgress} h-1.5 min-w-0 flex-1`} />
        <span aria-hidden="true" className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">{tts.playbackProgress}%</span>
      </div> : null}
      {children}
    </section>
  );
}
