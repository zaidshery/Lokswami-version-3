import mongoose from 'mongoose';

const MediaSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  size: { type: Number, required: true },
  type: { type: String, required: true },
  uploadedBy: { type: String, default: 'system' },
  createdById: { type: String, default: '', trim: true },
  provider: { type: String, enum: ['do-spaces', 'legacy'], default: 'legacy' },
  objectKey: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['pending', 'verified', 'attached', 'cleanup_pending', 'deleted', 'failed'],
    default: 'verified',
  },
  mediaKind: { type: String, enum: ['image', 'video', 'document'], default: 'image' },
  ownerType: {
    type: String,
    enum: ['library', 'article', 'story', 'video', 'epaper'],
    default: 'library',
  },
  ownerId: { type: String, default: '', trim: true },
  expectedSize: { type: Number, default: 0, min: 0 },
  referenceTrackingComplete: { type: Boolean, default: false },
  references: {
    type: [{ ownerType: String, ownerId: String, field: String, attachedAt: Date }],
    default: [],
  },
  variants: { type: mongoose.Schema.Types.Mixed, default: {} },
  cleanupError: { type: String, default: '' },
  verifiedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

MediaSchema.index({ uploadedBy: 1, createdAt: -1 });
MediaSchema.index(
  { provider: 1, objectKey: 1 },
  { unique: true, partialFilterExpression: { provider: 'do-spaces', objectKey: { $type: 'string', $gt: '' } } }
);
MediaSchema.index({ status: 1, updatedAt: 1 });

const Media = mongoose.models.Media || mongoose.model('Media', MediaSchema);
export default Media;
