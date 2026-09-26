import mongoose, { type Model } from 'mongoose';

export interface IGovernanceLock {
  _id: string;
  ownerId: string;
  acquiredAt: Date;
  lockedUntil: Date;
}

const GovernanceLockSchema = new mongoose.Schema<IGovernanceLock>(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true },
    acquiredAt: { type: Date, default: Date.now },
    lockedUntil: { type: Date, required: true },
  },
  {
    timestamps: false,
    _id: false,
  }
);

// MongoDB TTL index: purge expired locks after 60 seconds of expiration
GovernanceLockSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 60 });

const GovernanceLock: Model<IGovernanceLock> =
  mongoose.models.GovernanceLock ||
  mongoose.model<IGovernanceLock>('GovernanceLock', GovernanceLockSchema);

export default GovernanceLock;
