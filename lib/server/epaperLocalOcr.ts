import { fork } from 'node:child_process';
import path from 'node:path';
import type { EPaperArticleHotspot } from '@/lib/types/epaper';
import { isValidEpaperHotspot } from '@/lib/utils/epaperHotspotGeometry';

export const LOCAL_OCR_ENGINE_VERSION = 'tesseract-7-hin-eng-1';

export type LocalOcrSuggestion = {
  title: string;
  text: string;
  confidence: number;
  hotspot: EPaperArticleHotspot;
};

export function isValidOcrSuggestion(
  entry: unknown
): entry is LocalOcrSuggestion {
  if (!entry || typeof entry !== 'object') return false;
  const item = entry as Partial<LocalOcrSuggestion>;
  if (
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    item.title.length > 500
  ) {
    return false;
  }
  if (
    typeof item.text !== 'string' ||
    !item.text.trim() ||
    item.text.length > 50_000
  ) {
    return false;
  }
  if (
    typeof item.confidence !== 'number' ||
    !Number.isFinite(item.confidence) ||
    item.confidence < 0 ||
    item.confidence > 100
  ) {
    return false;
  }
  return isValidEpaperHotspot(item.hotspot);
}

export function runIsolatedLocalOcr(
  image: Buffer,
  timeoutMs = 180_000
): Promise<LocalOcrSuggestion[]> {
  return new Promise((resolve, reject) => {
    const child = fork(
      path.join(process.cwd(), 'scripts/epaper-local-ocr-worker.cjs'),
      [],
      {
        execArgv: ['--max-old-space-size=512'],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
        },
      }
    );

    let settled = false;
    const finish = (error?: Error, suggestions: LocalOcrSuggestion[] = []) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      if (error) reject(error);
      else resolve(suggestions);
    };

    const timer = setTimeout(
      () => finish(new Error('Local OCR exceeded its three-minute deadline.')),
      timeoutMs
    );

    child.once('error', (error) => finish(error));
    child.once('exit', (code) =>
      finish(
        new Error(
          code === 75
            ? 'Local OCR exceeded its memory budget.'
            : 'Local OCR worker stopped before returning a result.'
        )
      )
    );
    child.once(
      'message',
      (message: { error?: string; suggestions?: unknown[] }) => {
        if (message.error) {
          return finish(new Error(`Local OCR: ${message.error}`));
        }
        if (!Array.isArray(message.suggestions)) {
          return finish(new Error('Invalid OCR worker output.'));
        }
        const validated = message.suggestions
          .filter(isValidOcrSuggestion)
          .map((entry) => ({
            title: entry.title.trim().slice(0, 220),
            text: entry.text.trim(),
            confidence: Math.round(
              Math.max(0, Math.min(100, entry.confidence))
            ),
            hotspot: entry.hotspot,
          }));
        finish(undefined, validated);
      }
    );

    child.send({ image: image.toString('base64') }, (error) => {
      if (error) finish(error);
    });
  });
}
