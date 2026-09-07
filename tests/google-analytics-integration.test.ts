import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Google analytics integration', () => {
  it('validates public tag IDs and defers third-party analytics until after interaction readiness', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('NEXT_PUBLIC_GTM_ID');
    expect(layout).toContain('NEXT_PUBLIC_GA4_MEASUREMENT_ID');
    expect(layout).toContain('/^GTM-[A-Z0-9]+$/');
    expect(layout).toContain('/^G-[A-Z0-9]+$/');
    expect(layout).toContain('strategy="afterInteractive"');
    expect(layout).not.toMatch(/lokswami-google-tag-manager" strategy="beforeInteractive"/);
  });

  it('does not forward the internal pseudonymous session ID to Google', () => {
    const tracker = read('lib/analytics/trackClient.ts');
    expect(tracker).not.toContain('lokswami_session_id');
    expect(tracker).toContain("window.gtag('event'");
  });
});
