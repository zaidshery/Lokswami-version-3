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
  connect: vi.fn(async () => undefined),
  findOne: vi.fn(async (identity: { source: string; event: string; sessionId: string }) =>
    [...mongo.rows.values()].find((row) =>
      row.source === identity.source && row.event === identity.event && row.sessionId === identity.sessionId
    ) || null
  ),
  updateOne: vi.fn(async (
    filter: { _id: string },
    update: { $set: { metadata: Record<string, unknown> }; $setOnInsert?: Partial<MongoRow> },
    options?: { upsert?: boolean }
  ) => {
    const id = String(filter._id);
    let row = mongo.rows.get(id);
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
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
      mongo.rows.set(id, row);
    }
    if (row) {
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
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalMongoUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalMongoUri;
  });

  it('upserts absolute Web Vital values in Mongo while generic events still append', async () => {
    process.env.MONGODB_URI = 'mongodb://mock-only';
    const service = new AnalyticsService(new AnalyticsRepository());
    const send = (id: string, value: number, page = '/main/videos') =>
      service.trackWebVital({ name: 'CLS', id, value, path: page });

    await send('cls-1', 0.04);
    expect(mongo.rows.size).toBe(1);
    const first = [...mongo.rows.values()][0];
    const originalId = first._id;
    const originalCreatedAt = first.createdAt;

    await send('cls-1', 0.12, '/main/epaper');
    expect(mongo.rows.size).toBe(1);
    expect(first._id).toBe(originalId);
    expect(first.createdAt).toBe(originalCreatedAt);
    expect(first.page).toBe('/main/videos');
    expect(first.metadata).toMatchObject({ value: 0.12, rating: 'needs-improvement' });
    const writesAfterChangedValue = mongo.updateOne.mock.calls.length;

    await send('cls-1', 0.12);
    expect(mongo.rows.size).toBe(1);
    expect(mongo.updateOne).toHaveBeenCalledTimes(writesAfterChangedValue);

    await send('cls-2', 0.03);
    expect(mongo.rows.size).toBe(2);
    await send('bf-cls-1', 0.02, '/main/epaper');
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
        $setOnInsert: expect.objectContaining({ page: '/main/videos', ipAddress: '', userAgent: '' }),
      }),
      { upsert: true, runValidators: true }
    );

    await service.trackPublicEvent({ event: 'page_view', page: '/main', sessionId: 'generic-session-1' });
    await service.trackPublicEvent({ event: 'page_view', page: '/main', sessionId: 'generic-session-1' });
    expect(mongo.generic).toHaveLength(2);
  });

  it('coalesces concurrent Mongo retries using one built-in _id identity', async () => {
    process.env.MONGODB_URI = 'mongodb://mock-only';
    const service = new AnalyticsService(new AnalyticsRepository());
    await Promise.all(Array.from({ length: 4 }, () =>
      service.trackWebVital({ name: 'CLS', id: 'cls-concurrent', value: 0.04, path: '/main' })
    ));
    expect(mongo.rows.size).toBe(1);
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
    await service.trackWebVital({ name: 'CLS', id: 'legacy-cls', value: 0.12, path: '/main/epaper' });
    expect(mongo.rows.size).toBe(1);
    expect(mongo.rows.get('legacy-object-id')).toMatchObject({
      page: '/main/videos', createdAt,
      metadata: { value: 0.12, rating: 'needs-improvement' },
    });
  });

  it('upserts file fallback samples and preserves generic append behavior in an isolated file', async () => {
    delete process.env.MONGODB_URI;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lokswami-vitals-'));
    const tempFile = path.join(tempDir, 'analytics-events.json');
    try {
      const service = new AnalyticsService(new AnalyticsRepository(tempFile));
      const send = (id: string, value: number, page = '/main/videos') =>
        service.trackWebVital({
          name: 'CLS', id, value, path: page,
          navigationType: id.startsWith('bf-') ? 'back-forward-cache' : 'navigate',
        });

      await send('cls-1', 0.04);
      const initial = await listStoredAnalyticsEvents(tempFile);
      expect(initial).toHaveLength(1);
      expect(initial[0]).toMatchObject({ ipAddress: null, userAgent: null });
      const createdAt = initial[0].createdAt;
      const originalId = initial[0]._id;

      await send('cls-1', 0.12, '/main/epaper');
      const updated = await listStoredAnalyticsEvents(tempFile);
      expect(updated).toHaveLength(1);
      expect(updated[0]).toMatchObject({
        _id: originalId,
        page: '/main/videos',
        createdAt,
        metadata: { value: 0.12, rating: 'needs-improvement' },
      });
      const updatedAt = updated[0].updatedAt;

      await send('cls-1', 0.12);
      const repeated = await listStoredAnalyticsEvents(tempFile);
      expect(repeated).toHaveLength(1);
      expect(repeated[0].updatedAt).toBe(updatedAt);

      await Promise.all([
        send('cls-2', 0.03),
        send('bf-cls-1', 0.02, '/main/epaper'),
        send('cls-2', 0.03),
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
});
