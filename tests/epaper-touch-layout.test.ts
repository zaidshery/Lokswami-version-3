import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('E-paper touch layout', () => {
  it('keeps spread mode desktop-only and disables it for coarse pointers', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/(reader)/main/epaper/EPaperPageClient.tsx'),
      'utf8'
    );

    expect(source).toContain("window.matchMedia('(min-width: 1024px)')");
    expect(source).toContain('isWideScreen && !isCoarsePointer');
  });
});
