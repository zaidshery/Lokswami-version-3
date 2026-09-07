import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Swipe service-worker media policy', () => {
  it('excludes video and streaming assets from runtime caches', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
    expect(source).toMatch(/mp4\|m3u8\|m4s\|ts\|webm\|mov/);
    expect(source).toContain("request.destination");
    expect(source).not.toMatch(/\['style', 'script', 'image', 'font', 'manifest', 'video'\]/);
  });
});
