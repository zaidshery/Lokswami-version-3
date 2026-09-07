import mongoose from 'mongoose';

export interface IArticleLock {
  _id?: string;
  articleId: string;
  userId: string;
  userName: string;
  userRole: string;
  lockedAt: Date;
  expiresAt: Date;
}

const ArticleLockSchema = new mongoose.Schema<IArticleLock>(
  {
    articleId: { type: String, required: true, unique: true, index: true },
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
ArticleLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ArticleLock =
  mongoose.models.ArticleLock ||
  mongoose.model<IArticleLock>('ArticleLock', ArticleLockSchema);

export default ArticleLock;
