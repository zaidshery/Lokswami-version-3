import crypto from 'crypto';
import connectDB from '@/lib/db/mongoose';
import AnalyticsEvent from '@/lib/models/AnalyticsEvent';
import { createStoredAnalyticsEvent, upsertStoredWebVital } from '@/lib/storage/analyticsEventsFile';
import type { AnalyticsEventPayload } from './analyticsTypes';

export class AnalyticsRepository {
  constructor(private readonly filePath?: string) {}

  async saveEvent(payload: AnalyticsEventPayload): Promise<void> {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        await AnalyticsEvent.create(payload);
        return;
      } catch (mongoError) {
        console.error('Mongo write failed, analytics falling back to file store:', mongoError);
      }
    }

    if (this.filePath === undefined) await createStoredAnalyticsEvent(payload);
    else await createStoredAnalyticsEvent(payload, this.filePath);
  }

  async upsertWebVital(payload: AnalyticsEventPayload): Promise<void> {
    if (payload.source !== 'web_vitals_beacon' || !payload.event.startsWith('web_vital_')) {
      throw new Error('Web Vital upsert requires a Web Vital event');
    }

    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        const identity = {
          source: payload.source,
          event: payload.event,
          sessionId: payload.sessionId,
        };
        const existing = await AnalyticsEvent.findOne(identity);
        if (existing) {
          if (
            existing.metadata?.value === payload.metadata.value &&
            existing.metadata?.rating === payload.metadata.rating
          ) return;
          await AnalyticsEvent.updateOne(
            { _id: existing._id },
            { $set: { metadata: payload.metadata } }
          );
          return;
        }

        // Mongo's existing _id uniqueness makes concurrent retries one sample
        // without a new production index or migration.
        const stableId = crypto.createHash('sha256')
          .update(JSON.stringify([payload.source, payload.event, payload.sessionId]))
          .digest('hex').slice(0, 24);
        await AnalyticsEvent.updateOne(
          { _id: stableId, ...identity },
          {
            $set: { metadata: payload.metadata },
            $setOnInsert: {
              event: payload.event,
              page: payload.page,
              source: payload.source,
              sessionId: payload.sessionId,
              ipAddress: '',
              userAgent: '',
            },
          },
          { upsert: true, runValidators: true }
        );
        return;
      } catch (mongoError) {
        console.error('Mongo Web Vital write failed, analytics falling back to file store:', mongoError);
      }
    }

    if (this.filePath === undefined) await upsertStoredWebVital(payload);
    else await upsertStoredWebVital(payload, this.filePath);
  }
}

export const analyticsRepository = new AnalyticsRepository();
