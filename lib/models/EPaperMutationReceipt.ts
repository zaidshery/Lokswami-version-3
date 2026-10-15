import mongoose from 'mongoose';

// Cleanup persists the operation result before releasing the parent journal.
// Receipts outlive later edition mutations and expire independently of content.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  epaperId: { type: mongoose.Schema.Types.ObjectId, required: true },
  result: mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.EPaperMutationReceipt || mongoose.model('EPaperMutationReceipt', schema);
