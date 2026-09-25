import mongoose from 'mongoose';

export interface IStoryLock {
  _id?: string;
  storyId: string;
  userId: string;
  userName: string;
  userRole: string;
  lockedAt: Date;
  expiresAt: Date;
}

const StoryLockSchema = new mongoose.Schema<IStoryLock>(
  {
    storyId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    lockedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: false,
  }
);

// MongoDB TTL index: documents are automatically purged when expiresAt <= current time
StoryLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const StoryLock =
  mongoose.models.StoryLock ||
  mongoose.model<IStoryLock>('StoryLock', StoryLockSchema);

export default StoryLock;
