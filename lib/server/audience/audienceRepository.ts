import connectDB from '@/lib/db/mongoose';
import AdvertiseInquiry from '@/lib/models/AdvertiseInquiry';
import CareerApplication from '@/lib/models/CareerApplication';
import MarketingLead from '@/lib/models/MarketingLead';
import Subscriber from '@/lib/models/Subscriber';
import { createStoredAdvertiseInquiry } from '@/lib/storage/advertiseInquiriesFile';
import { createStoredCareerApplication } from '@/lib/storage/careerApplicationsFile';
import { upsertStoredMarketingLead } from '@/lib/storage/marketingLeadsFile';
import type {
  AdvertiseInquiryInput,
  CareerApplicationInput,
  MarketingLeadInput,
  SubscriptionResult,
} from './audienceTypes';

export class AudienceRepository {
  async subscribe(email: string, source: string): Promise<SubscriptionResult> {
    await connectDB();
    const existing = await Subscriber.findOne({ email });

    if (existing) {
      if (!existing.sources.includes(source)) {
        existing.sources.push(source);
        await existing.save();
      }
      return 'existing';
    }

    await Subscriber.create({
      email,
      sources: [source],
      subscribedAt: new Date(),
    });
    return 'created';
  }

  private async syncSubscriber(email: string) {
    const subscriber = await Subscriber.findOne({ email });
    if (!subscriber) {
      await Subscriber.create({
        email,
        sources: ['main'],
        subscribedAt: new Date(),
      });
      return;
    }

    if (!subscriber.sources.includes('main')) {
      subscriber.sources.push('main');
      await subscriber.save();
    }
  }

  async saveMarketingLead(input: MarketingLeadInput) {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        await MarketingLead.findOneAndUpdate(
          { email: input.email, source: input.source },
          input,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (input.wantsDailyAlerts) {
          await this.syncSubscriber(input.email);
        }
        return;
      } catch (mongoError) {
        console.error('Mongo unavailable for marketing leads, using file store:', mongoError);
      }
    }

    await upsertStoredMarketingLead(input);
  }

  async createAdvertiseInquiry(input: AdvertiseInquiryInput) {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        await AdvertiseInquiry.create(input);
        return;
      } catch (mongoError) {
        console.error('Mongo write failed, falling back to file storage:', mongoError);
      }
    }

    await createStoredAdvertiseInquiry(input);
  }

  async createCareerApplication(input: CareerApplicationInput) {
    if (process.env.MONGODB_URI) {
      try {
        await connectDB();
        await CareerApplication.create(input);
        return;
      } catch (mongoError) {
        console.error('Mongo write failed, falling back to file storage:', mongoError);
      }
    }

    await createStoredCareerApplication(input);
  }
}

export const audienceRepository = new AudienceRepository();

