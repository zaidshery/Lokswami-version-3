import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '@/lib/server/analytics/analyticsService';
import { AnalyticsRepository } from '@/lib/server/analytics/analyticsRepository';
import {
  listStoredAnalyticsEvents,
} from '@/lib/storage/analyticsEventsFile';

type MongoRow = {
  _id: string;
  event: string;
  page: string;
  source: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const mongo = vi.hoisted(() => ({
  rows: new Map<string, MongoRow>(),
  generic: [] as Record<string, unknown>[],
  waitForSequenceOne: null as Promise<void> | null,
  sequenceOneEntered: null as (() => void) | null,
  connect: vi.fn(async () => undefined),
  findOne: vi.fn(async (identity: { source: string; event: string; sessionId: string }) =>
    [...mongo.rows.values()].find((row) =>
      row.source === identity.source && row.event === identity.event && row.sessionId === identity.sessionId
    ) || null
  ),
  updateOne: vi.fn(async (
    filter: { _id: string; source?: string; event?: string; sessionId?: string; $or?: Array<Record<string, unknown>> },
    update: { $set?: { metadata: Record<string, unknown> }; $setOnInsert?: Partial<MongoRow> },
    options?: { upsert?: boolean }
  ) => {
    if (filter.$or && update.$set?.metadata.reportSequence === 1 && mongo.waitForSequenceOne) {
      mongo.sequenceOneEntered?.();
      await mongo.waitForSequenceOne;
    }
    const id = String(filter._id);
    let row = mongo.rows.get(id);
    if (row && (filter.source !== row.source || filter.event !== row.event || filter.sessionId !== row.sessionId)) return;
    if (row && filter.$or) {
      const stored = row.metadata.reportSequence;
      const incoming = update.$set?.metadata.reportSequence as number;
      if (typeof stored === 'number' && stored >= incoming) return;
    }
    if (!row && options?.upsert && update.$setOnInsert) {
      const now = new Date();
      row = {
        _id: id,
        event: update.$setOnInsert.event || '',
        page: update.$setOnInsert.page || '',
        source: update.$setOnInsert.source || '',
        sessionId: update.$setOnInsert.sessionId || '',
        ipAddress: update.$setOnInsert.ipAddress || '',
        userAgent: update.$setOnInsert.userAgent || '',
        metadata: update.$setOnInsert.metadata || {},
        createdAt: update.$setOnInsert.createdAt || now,
        updatedAt: update.$setOnInsert.updatedAt || now,
      };
      mongo.rows.set(id, row);
    }
    if (row && update.$set) {
      row.metadata = update.$set.metadata;
      row.updatedAt = new Date();
    }
  }),
  create: vi.fn(async (input: Record<string, unknown>) => {
    mongo.generic.push(input);
  }),
}));

vi.mock('@/lib/db/mongoose', () => ({ default: mongo.connect }));
vi.mock('@/lib/models/AnalyticsEvent', () => ({
  default: { findOne: mongo.findOne, updateOne: mongo.updateOne, create: mongo.create },
}));

const originalMongoUri = process.env.MONGODB_URI;

describe('Web Vital persistence', () => {
  beforeEach(() => {
    mongo.rows.clear();
    mongo.generic.length = 0;
    mongo.waitForSequenceOne = null;
    mongo.sequenceOneEntered = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;
  });

  it('upserts absolute Web Vital values in Mongo while generic events still append', async () => {
    process.env.MONGODB_URI = 'mongodb://mock-only';
    const service = new AnalyticsService(new AnalyticsRepository());
    const send = (id: string, value: number, reportSequence: number, page = '/main/videos') =>
      service.trackWebVital({ name: 'CLS', id, value, reportSequence, path: page });

    await send('cls-1', 0.04, 1);
    expect(mongo.rows.size).toBe(1);
    const first = [...mongo.rows.values()][0];
    const originalId = first._id;
    const originalCreatedAt = first.createdAt;

    await send('cls-1', 0.12, 2, '/main/epaper');
    expect(mongo.rows.size).toBe(1);
    expect(first._id).toBe(originalId);
    expect(first.createdAt).toBe(originalCreatedAt);
    expect(first.page).toBe('/main/videos');
    expect(first.metadata).toMatchObject({ value: 0.12, rating: 'needs-improvement', reportSequence: 2 });
    const writesAfterChangedValue = mongo.updateOne.mock.calls.length;

    await send('cls-1', 0.12, 2);
    expect(mongo.rows.size).toBe(1);
    expect(mongo.updateOne).toHaveBeenCalledTimes(writesAfterChangedValue + 1);

    await send('cls-1', 0.04, 1);
    expect(first.metadata).toMatchObject({ value: 0.12, reportSequence: 2 });
    await send('cls-1', 0.08, 3);
    expect(first.metadata).toMatchObject({ value: 0.08, reportSequence: 3 });

    await send('cls-2', 0.03, 1);
    expect(mongo.rows.size).toBe(2);
    await send('bf-cls-1', 0.02, 1, '/main/epaper');
    expect(mongo.rows.size).toBe(3);
    expect([...mongo.rows.values()].map((row) => row.sessionId).sort()).toEqual([
      'bf-cls-1', 'cls-1', 'cls-2',
    ]);
    expect([...mongo.rows.values()].every((row) => row.ipAddress === '' && row.userAgent === '')).toBe(true);
    expect(first.metadata).not.toHaveProperty('email');
    expect(mongo.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: expect.stringMatching(/^[a-f0-9]{24}$/),
        source: 'web_vitals_beacon', event: 'web_vital_cls', sessionId: 'cls-1',
      }),
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ page: '/main/videos', ipAddress: '', userAgent: '', metadata: expect.objectContaining({ reportSequence: 1 }) }),
      }),
      { upsert: true, runValidators: true, timestamps: false }
    );

    await service.trackPublicEvent({ event: 'page_view', page: '/main', sessionId: 'generic-session-1' });
    await service.trackPublicEvent({ event: 'page_view', page: '/main', sessionId: 'generic-session-1' });
    expect(mongo.generic).toHaveLength(2);
  });

  it('coalesces concurrent Mongo retries using one built-in _id identity', async () => {
    process.env.MONGODB_URI = 'mongodb://mock-only';
    const service = new AnalyticsService(new AnalyticsRepository());
    await Promise.all(Array.from({ length: 4 }, () =>
      service.trackWebVital({ name: 'CLS', id: 'cls-concurrent', value: 0.04, reportSequence: 1, path: '/main' })
    ));
    expect(mongo.rows.size).toBe(1);
  });

  it('keeps sequence two when Mongo receives it before sequence one', async () => {
    process.env.MONGODB_URI = 'mongodb://mock-only';
    const service = new AnalyticsService(new AnalyticsRepository());
    const send = (value: number, reportSequence: number) => service.trackWebVital({
      name: 'CLS', id: 'cls-out-of-order', value, reportSequence, path: '/main',
    });
    await send(0.12, 2);
    await send(0.04, 1);
    await send(0.12, 2);
    expect(mongo.rows.size).toBe(1);
    const row = [...mongo.rows.values()][0];
    expect(row.metadata).toMatchObject({ value: 0.12, reportSequence: 2 });
    await send(0.08, 3);
    expect(row.metadata).toMatchObject({ value: 0.08, reportSequence: 3 });
  });

  it('accepts legacy Mongo reports as sequence one without regressing a newer sample', async () => {
    process.env.MONGODB_URI = 'mongodb://mock-only';
    const service = new AnalyticsService(new AnalyticsRepository());
    const send = (id: string, value: number, reportSequence?: number) => service.trackWebVital({
      name: 'CLS', id, value, path: '/main',
      ...(reportSequence === undefined ? {} : { reportSequence }),
    });

    await send('legacy-first-mongo', 0.04);
    expect(mongo.rows.size).toBe(1);
    const first = [...mongo.rows.values()][0];
    expect(first.metadata).toMatchObject({ value: 0.04, reportSequence: 1 });
    await send('legacy-first-mongo', 0.12, 2);
    await send('legacy-first-mongo', 0.04);
    expect(mongo.rows.size).toBe(1);
    expect(first.metadata).toMatchObject({ value: 0.12, reportSequence: 2 });

    await send('newer-first-mongo', 0.12, 2);
    await send('newer-first-mongo', 0.04);
    expect(mongo.rows.size).toBe(2);
    expect([...mongo.rows.values()].find((row) => row.sessionId === 'newer-first-mongo')?.metadata)
      .toMatchObject({ value: 0.12, reportSequence: 2 });
  });

  it('rejects an older Mongo write even when its conditional update finishes last', async () => {
    process.env.MONGODB_URI = 'mongodb://mock-only';
    const service = new AnalyticsService(new AnalyticsRepository());
    let releaseOld!: () => void;
    mongo.waitForSequenceOne = new Promise<void>((resolve) => { releaseOld = resolve; });
    let oldEntered!: () => void;
    const oldAtWrite = new Promise<void>((resolve) => { oldEntered = resolve; });
    mongo.sequenceOneEntered = oldEntered;

    const older = service.trackWebVital({
      name: 'CLS', id: 'cls-reversed', value: 0.04, reportSequence: 1, path: '/main',
    });
    await oldAtWrite;
    await service.trackWebVital({
      name: 'CLS', id: 'cls-reversed', value: 0.12, reportSequence: 2, path: '/main',
    });
    releaseOld();
    await older;
    expect(mongo.rows.size).toBe(1);
    expect([...mongo.rows.values()][0].metadata).toMatchObject({ value: 0.12, reportSequence: 2 });
  });

  it('updates a pre-existing Web Vital event without moving its original path', async () => {
    process.env.MONGODB_URI = 'mongodb://mock-only';
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    mongo.rows.set('legacy-object-id', {
      _id: 'legacy-object-id', event: 'web_vital_cls', page: '/main/videos',
      source: 'web_vitals_beacon', sessionId: 'legacy-cls', ipAddress: '', userAgent: '',
      metadata: { value: 0.04, rating: 'good' }, createdAt, updatedAt: createdAt,
    });
    const service = new AnalyticsService(new AnalyticsRepository());
    await service.trackWebVital({ name: 'CLS', id: 'legacy-cls', value: 0.12, reportSequence: 1, path: '/main/epaper' });
    expect(mongo.rows.size).toBe(1);
    expect(mongo.rows.get('legacy-object-id')).toMatchObject({
      page: '/main/videos', createdAt,
      metadata: { value: 0.12, rating: 'needs-improvement', reportSequence: 1 },
    });
  });

  it('upserts file fallback samples and preserves generic append behavior in an isolated file', async () => {
    delete process.env.MONGODB_URI;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lokswami-vitals-'));
    const tempFile = path.join(tempDir, 'analytics-events.json');
    try {
      const service = new AnalyticsService(new AnalyticsRepository(tempFile));
      const send = (id: string, value: number, reportSequence: number, page = '/main/videos') =>
        service.trackWebVital({
          name: 'CLS', id, value, reportSequence, path: page,
          navigationType: id.startsWith('bf-') ? 'back-forward-cache' : 'navigate',
        });

      await send('cls-1', 0.04, 1);
      const initial = await listStoredAnalyticsEvents(tempFile);
      expect(initial).toHaveLength(1);
      expect(initial[0]).toMatchObject({ ipAddress: null, userAgent: null });
      const createdAt = initial[0].createdAt;
      const originalId = initial[0]._id;

      await send('cls-1', 0.12, 2, '/main/epaper');
      const updated = await listStoredAnalyticsEvents(tempFile);
      expect(updated).toHaveLength(1);
      expect(updated[0]).toMatchObject({
        _id: originalId,
        page: '/main/videos',
        createdAt,
        metadata: { value: 0.12, rating: 'needs-improvement', reportSequence: 2 },
      });
      const updatedAt = updated[0].updatedAt;

      await send('cls-1', 0.12, 2);
      const repeated = await listStoredAnalyticsEvents(tempFile);
      expect(repeated).toHaveLength(1);
      expect(repeated[0].updatedAt).toBe(updatedAt);

      await send('cls-1', 0.04, 1);
      expect((await listStoredAnalyticsEvents(tempFile))[0].metadata).toMatchObject({ value: 0.12, reportSequence: 2 });
      await send('cls-1', 0.08, 3);
      expect((await listStoredAnalyticsEvents(tempFile))[0].metadata).toMatchObject({ value: 0.08, reportSequence: 3 });

      await Promise.all([
        send('cls-2', 0.03, 1),
        send('bf-cls-1', 0.02, 1, '/main/epaper'),
        send('cls-2', 0.03, 1),
      ]);
      expect((await listStoredAnalyticsEvents(tempFile)).filter((item) => item.source === 'web_vitals_beacon')).toHaveLength(3);
      expect((await listStoredAnalyticsEvents(tempFile)).map((item) => item.sessionId).sort()).toEqual([
        'bf-cls-1', 'cls-1', 'cls-2',
      ]);

      const genericEvent = { event: 'page_view', page: '/main', sessionId: 'generic-session' };
      await service.trackPublicEvent(genericEvent);
      await service.trackPublicEvent(genericEvent);
      expect(await listStoredAnalyticsEvents(tempFile)).toHaveLength(5);
    } finally {
      await fs.unlink(tempFile).catch(() => undefined);
      await fs.rmdir(tempDir);
    }
  });

  it('lets a sequenced file update supersede one legacy sample without moving its path', async () => {
    delete process.env.MONGODB_URI;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lokswami-vitals-legacy-'));
    const tempFile = path.join(tempDir, 'analytics-events.json');
    try {
      await fs.writeFile(tempFile, JSON.stringify([{
        _id: 'legacy-file-id', event: 'web_vital_cls', page: '/main/videos',
        source: 'web_vitals_beacon', sessionId: 'legacy-file-cls',
        ipAddress: null, userAgent: null, metadata: { value: 0.04, rating: 'good' },
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }]));
      const service = new AnalyticsService(new AnalyticsRepository(tempFile));
      await service.trackWebVital({
        name: 'CLS', id: 'legacy-file-cls', value: 0.12, reportSequence: 1, path: '/main/epaper',
      });
      const rows = await listStoredAnalyticsEvents(tempFile);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        _id: 'legacy-file-id', page: '/main/videos',
        metadata: { value: 0.12, reportSequence: 1 },
      });
    } finally {
      await fs.unlink(tempFile).catch(() => undefined);
      await fs.rmdir(tempDir);
    }
  });

  it('keeps sequence two when the file fallback receives it before sequence one', async () => {
    delete process.env.MONGODB_URI;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lokswami-vitals-order-'));
    const tempFile = path.join(tempDir, 'analytics-events.json');
    try {
      const service = new AnalyticsService(new AnalyticsRepository(tempFile));
      const send = (value: number, reportSequence: number) => service.trackWebVital({
        name: 'CLS', id: 'cls-file-order', value, reportSequence, path: '/main',
      });
      await send(0.12, 2);
      await send(0.04, 1);
      await send(0.12, 2);
      let rows = await listStoredAnalyticsEvents(tempFile);
      expect(rows).toHaveLength(1);
      expect(rows[0].metadata).toMatchObject({ value: 0.12, reportSequence: 2 });
      await send(0.08, 3);
      rows = await listStoredAnalyticsEvents(tempFile);
      expect(rows).toHaveLength(1);
      expect(rows[0].metadata).toMatchObject({ value: 0.08, reportSequence: 3 });
    } finally {
      await fs.unlink(tempFile).catch(() => undefined);
      await fs.rmdir(tempDir);
    }
  });

  it('accepts legacy file reports as sequence one without regressing a newer sample', async () => {
    delete process.env.MONGODB_URI;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lokswami-vitals-legacy-order-'));
    const tempFile = path.join(tempDir, 'analytics-events.json');
    try {
      const service = new AnalyticsService(new AnalyticsRepository(tempFile));
      const send = (id: string, value: number, reportSequence?: number) => service.trackWebVital({
        name: 'CLS', id, value, path: '/main',
        ...(reportSequence === undefined ? {} : { reportSequence }),
      });
      await send('legacy-first-file', 0.04);
      expect((await listStoredAnalyticsEvents(tempFile))[0].metadata)
        .toMatchObject({ value: 0.04, reportSequence: 1 });
      await send('legacy-first-file', 0.12, 2);
      await send('legacy-first-file', 0.04);
      let rows = await listStoredAnalyticsEvents(tempFile);
      expect(rows).toHaveLength(1);
      expect(rows[0].metadata).toMatchObject({ value: 0.12, reportSequence: 2 });

      await send('newer-first-file', 0.12, 2);
      await send('newer-first-file', 0.04);
      rows = await listStoredAnalyticsEvents(tempFile);
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.sessionId === 'newer-first-file')?.metadata)
        .toMatchObject({ value: 0.12, reportSequence: 2 });
    } finally {
      await fs.unlink(tempFile).catch(() => undefined);
      await fs.rmdir(tempDir);
    }
  });
});
