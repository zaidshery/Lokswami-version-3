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
        const reportSequence = payload.metadata.reportSequence as number;
        const identity = {
          source: payload.source,
          event: payload.event,
          sessionId: payload.sessionId,
        };
        // The predicate is evaluated by Mongo as part of the write, so a
        // delayed older request cannot overwrite a newer completed write.
        const newerThanStored = {
          $or: [
            { 'metadata.reportSequence': { $lt: reportSequence } },
            { 'metadata.reportSequence': { $exists: false } },
          ],
        };
        const existing = await AnalyticsEvent.findOne(identity);
        if (existing) {
          await AnalyticsEvent.updateOne(
            { _id: existing._id, ...identity, ...newerThanStored },
            { $set: { metadata: payload.metadata } }
          );
          return;
        }

        // Mongo's existing _id uniqueness makes concurrent retries one sample
        // without a new production index or migration.
        const stableId = crypto.createHash('sha256')
          .update(JSON.stringify([payload.source, payload.event, payload.sessionId]))
          .digest('hex').slice(0, 24);
        try {
          await AnalyticsEvent.updateOne(
            { _id: stableId, ...identity },
            { $setOnInsert: {
              event: payload.event,
              page: payload.page,
              source: payload.source,
              sessionId: payload.sessionId,
              ipAddress: '',
              userAgent: '',
              metadata: payload.metadata,
              createdAt: new Date(),
              updatedAt: new Date(),
            } },
            { upsert: true, runValidators: true, timestamps: false }
          );
        } catch (error) {
          // Two first reports may race to insert the deterministic _id.
          // Its built-in uniqueness arbitrates without a new index.
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
        }
        await AnalyticsEvent.updateOne(
          { _id: stableId, ...identity, ...newerThanStored },
          { $set: { metadata: payload.metadata } }
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
