import { fork } from 'node:child_process';
import path from 'node:path';
import type { EPaperArticleHotspot } from '@/lib/types/epaper';
import { isValidEpaperHotspot } from '@/lib/utils/epaperHotspotGeometry';

export const LOCAL_OCR_ENGINE_VERSION = 'tesseract-7-hin-eng-1';
export type LocalOcrSuggestion = { title: string; text: string; confidence: number; hotspot: EPaperArticleHotspot };
export function runIsolatedLocalOcr(image: Buffer, timeoutMs = 180_000): Promise<LocalOcrSuggestion[]> {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(process.cwd(), 'scripts/epaper-local-ocr-worker.cjs'), [], {
      execArgv: ['--max-old-space-size=512'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP },
    });
    let settled = false;
    const finish = (error?: Error, suggestions: LocalOcrSuggestion[] = []) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      if (error) reject(error); else resolve(suggestions);
    };
    const timer = setTimeout(() => finish(new Error('Local OCR exceeded its three-minute deadline.')), timeoutMs);
    child.once('error', (error) => finish(error));
    child.once('exit', (code) => finish(new Error(code === 75 ? 'Local OCR exceeded its memory budget.' : 'Local OCR worker stopped before returning a result.')));
    child.once('message', (message: { error?: string; suggestions?: LocalOcrSuggestion[] }) => {
      if (message.error) return finish(new Error(`Local OCR: ${message.error}`));
      if (!Array.isArray(message.suggestions)) return finish(new Error('Invalid OCR worker output.'));
      finish(undefined, message.suggestions.filter((entry) => entry.text && entry.title && isValidEpaperHotspot(entry.hotspot)));
    });
    child.send({ image: image.toString('base64') }, (error) => { if (error) finish(error); });
  });
}
