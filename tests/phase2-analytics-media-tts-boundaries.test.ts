import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function lineCount(relativePath: string) {
  return read(relativePath).split(/\r?\n/).length;
}

const analyticsControllers = [
  'app/api/analytics/track/route.ts',
  'app/api/v1/public/analytics/vitals/route.ts',
  'app/api/admin/settings/leadership-reports/route.ts',
];

const mediaControllers = [
  'app/api/admin/media/route.ts',
  'app/api/admin/media/[id]/route.ts',
  'app/api/admin/upload/route.ts',
];

const ttsControllers = [
  'app/api/admin/tts/assets/route.ts',
  'app/api/admin/tts/cleanup/route.ts',
  'app/api/admin/tts/revalidate/route.ts',
  'app/api/admin/tts/settings/route.ts',
];

describe('Phase 2.7 Analytics, Media Storage, and TTS Domain Boundaries', () => {
  it('keeps analytics target controllers free of direct model, mongoose, and raw storage imports', () => {
    for (const file of analyticsControllers) {
      const source = read(file);
      expect(source, file).not.toContain('@/lib/models/AnalyticsEvent');
      expect(source, file).not.toContain('@/lib/db/mongoose');
      expect(source, file).not.toContain('@/lib/storage/analyticsEventsFile');
      expect(source, file).not.toMatch(/@\/lib\/storage\/leadershipReport.*File/);
    }
  });

  it('keeps media controllers free of direct Mongoose, Media model, Sharp, and DO Spaces signing imports', () => {
    for (const file of mediaControllers) {
      const source = read(file);
      expect(source, file).not.toContain('@/lib/models/Media');
      expect(source, file).not.toContain('@/lib/db/mongoose');
      expect(source, file).not.toContain("from 'sharp'");
      expect(source, file).not.toContain('@/lib/utils/digitalOceanSpaces');
      expect(source, file).not.toMatch(/from ['"](?:fs|fs\/promises)['"]/);
    }
  });

  it('keeps tts target controllers free of direct Mongoose, TtsAsset, and TtsAuditEvent imports', () => {
    for (const file of ttsControllers) {
      const source = read(file);
      expect(source, file).not.toContain('@/lib/models/TtsAsset');
      expect(source, file).not.toContain('@/lib/models/TtsAuditEvent');
      expect(source, file).not.toContain('@/lib/db/mongoose');
      expect(source, file).not.toContain('@/lib/utils/ttsStorage');
    }
  });

  it('ensures all migrated target controllers are thin (< 150 lines)', () => {
    const allControllers = [
      ...analyticsControllers,
      ...mediaControllers,
      ...ttsControllers,
    ];

    for (const file of allControllers) {
      const count = lineCount(file);
      expect(count, `${file} line count is ${count} (expected < 150)`).toBeLessThan(150);
    }
  });

  it('preserves the manual-only TTS invariant and rejects auto-TTS synthesis', () => {
    const settingsRoute = read('app/api/admin/tts/settings/route.ts');
    expect(settingsRoute).toContain('405');
    expect(settingsRoute).toContain('ttsService.recordConfigAttempt');

    const retryRoute = read('app/api/admin/tts/retry/route.ts');
    expect(retryRoute).toContain('405');

    const prewarmRoute = read('app/api/admin/tts/prewarm/route.ts');
    expect(prewarmRoute).toContain('410');
  });

  it('preserves existing live analytics JSON snapshots and SSE stream transport contracts', () => {
    const liveRoute = read('app/api/admin/analytics/live/route.ts');
    expect(liveRoute).toContain('no-store');
    expect(liveRoute).toContain('buildAnalyticsLiveChartsSnapshot');

    const streamRoute = read('app/api/admin/analytics/live/stream/route.ts');
    expect(streamRoute).toContain('text/event-stream');
    expect(streamRoute).toContain('buildAnalyticsLiveChartsSnapshot');
  });
});
