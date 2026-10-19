import mongoose from 'mongoose';

import { ADVERTISING_OWNER, ADVERTISING_STATUSES, type AdvertisingWorkflow } from '@/lib/advertising/inquiryWorkflow';

export interface IAdvertiseInquiry extends mongoose.Document, AdvertisingWorkflow {
  name: string;
  company: string;
  email: string;
  phone?: string;
  budget?: string;
  campaignType: string;
  targetLocations?: string;
  timeline?: string;
  consent?: boolean;
  consentAt?: string;
  consentVersion?: string;
  message: string;
  source: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdvertiseInquirySchema = new mongoose.Schema<IAdvertiseInquiry>(
  {
    status: { type: String, enum: ADVERTISING_STATUSES, default: 'new', index: true },
    assignee: { type: String, default: ADVERTISING_OWNER, maxlength: 120 },
    followUpAt: { type: String, default: '' },
    followUpNote: { type: String, default: '', maxlength: 1000 },
    updatedBy: { type: String, default: '', maxlength: 120 },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    company: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
      maxlength: 180,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: '',
    },
    budget: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    campaignType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    targetLocations: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    timeline: { type: String, trim: true, maxlength: 120, default: '' },
    consent: { type: Boolean, default: false },
    consentAt: { type: String, default: '' },
    consentVersion: { type: String, maxlength: 80, default: '' },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    source: {
      type: String,
      trim: true,
      default: 'main-advertise',
      maxlength: 40,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { timestamps: true }
);

AdvertiseInquirySchema.index({ createdAt: -1 });

export default mongoose.models.AdvertiseInquiry ||
  mongoose.model<IAdvertiseInquiry>('AdvertiseInquiry', AdvertiseInquirySchema);
