import { Types, type Query, type Schema } from 'mongoose';
import { EpaperConflictError } from '@/lib/server/epaper/epaperTypes';

type WriteResult = { matchedCount?: number; deletedCount?: number } | null;
const writes = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const;

// All application writes use these models. Maintenance scripts using native
// collections must run while application writers are stopped.
export function addEpaperMutationFence(schema: Schema, ownerPath: string, child = false) {
  schema.pre([...writes], function (this: Query<unknown, unknown>) {
    if (typeof this.getFilter()[ownerPath] === 'string') return;
    this.where({ [ownerPath]: child ? { $in: [null, ''] } : { $exists: false } });
    if (child) this.where({ readinessMutationHidden: { $ne: true } });
  });
  schema.post([...writes], async function (this: Query<unknown, unknown>, result: unknown) {
    if (typeof this.getFilter()[ownerPath] === 'string') return;
    const writeResult = result as WriteResult;
    const noMatch = writeResult === null || writeResult?.matchedCount === 0 || writeResult?.deletedCount === 0;
    const id = this.getFilter()._id;
    if (!noMatch || !(typeof id === 'string' || id instanceof Types.ObjectId)) return;
    const locked = await this.model.collection.findOne({ _id: id, [ownerPath]: { $exists: true, $nin: [null, ''] } } as never);
    if (locked) throw new EpaperConflictError('A content change is being saved or recovered. Retry once it finishes.');
  });
  if (child) {
    schema.pre(['find', 'findOne', 'countDocuments', 'distinct'], function (this: Query<unknown, unknown>) {
      this.where({ readinessMutationHidden: { $ne: true } });
    });
    schema.pre('aggregate', function () {
      this.pipeline().unshift({ $match: { readinessMutationHidden: { $ne: true } } });
    });
  }
}
