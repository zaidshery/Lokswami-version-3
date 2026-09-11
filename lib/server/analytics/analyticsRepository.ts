import connectDB from '@/lib/db/mongoose';
import AnalyticsEvent from '@/lib/models/AnalyticsEvent';
import { createStoredAnalyticsEvent } from '@/lib/storage/analyticsEventsFile';
import type { AnalyticsEventPayload } from './analyticsTypes';

export class AnalyticsRepository {
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

    await createStoredAnalyticsEvent(payload);
  }
}

export const analyticsRepository = new AnalyticsRepository();
