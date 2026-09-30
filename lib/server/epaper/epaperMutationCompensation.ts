import 'server-only';
import type { EpaperRecord } from './epaperTypes';

// Include absent schema fields as well as stored fields. Equality is against
// the complete written snapshot, not just a timestamp (which can collide).
export function mutationSnapshotFilter(snapshot: EpaperRecord, paths: Record<string, unknown>) {
  const fields = new Set([...Object.keys(snapshot), ...Object.keys(paths).map((path) => path.split('.')[0])]);
  return {
    _id: snapshot._id,
    $and: [...fields].filter((field) => field !== '_id').map((field) => ({
      [field]: snapshot[field] === undefined ? { $exists: false } : { $eq: snapshot[field] },
    })),
  };
}

// The database mutation has already committed. A follow-up audit/reconcile
// failure must be observable without turning a committed save into HTTP 500.
export async function afterEpaperMutationCommit(id: string, effects: () => Promise<unknown>) {
  try {
    await effects();
  } catch (error) {
    console.error('[epaper] post-commit effects failed', { epaperId: id, error });
  }
}
