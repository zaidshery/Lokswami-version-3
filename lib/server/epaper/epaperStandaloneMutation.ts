import 'server-only';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/db/mongoose';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import { PROTECTED_EPAPER_AUTOMATION_IDS } from '@/lib/server/epaperAutomationPolicy';
import { mutationSnapshotFilter } from './epaperMutationCompensation';
import { asObject } from './epaperMapper';
import { EpaperConflictError, type EpaperRecord } from './epaperTypes';

const LEASE_MS = 10 * 60_000;
const WRITE_TIMEOUT_MS = 2_000;
type Undo = { token: string; kind: 'create' | 'update' | 'delete'; model: 'article' | 'suggestion'; childId: unknown; version: number; before?: EpaperRecord };
type Journal = { id: string; phase: 'running' | 'rollback' | 'committed'; startedAt: Date; leaseUntil: Date; expectedVersion: number; parentUpdates: EpaperRecord; undo: Undo[]; result?: unknown };

function conflict() { return new EpaperConflictError('Edition changed during content mutation. Reload before retrying.'); }
function childModel(undo: Undo) { return undo.model === 'article' ? EPaperArticle : EPaperOcrSuggestion; }
function ownedChild(undo: Undo) { return { _id: undo.childId, readinessMutationToken: undo.token, readinessContentVersion: undo.version }; }

// The parent contains the write-ahead journal and the database-visible owner.
// Every undo intent is durable before its corresponding child command starts.
// Model query fences block ordinary parent writes until commit/repair finishes.
export class StandaloneEpaperMutation {
  readonly journal: Journal;
  constructor(readonly id: string, readonly expectedVersion: number, readonly before: EpaperRecord) {
    this.journal = {
      id: randomUUID(), phase: 'running', startedAt: new Date(), leaseUntil: new Date(Date.now() + LEASE_MS), expectedVersion,
      parentUpdates: { qaCompletedAt: null, ...(before.productionStatus === 'ready_to_publish' ? { productionStatus: 'hotspot_mapping' } : {}) }, undo: [],
    };
  }

  private runningFilter() {
    return { _id: this.id, status: 'draft', version: this.expectedVersion + 1, 'contentMutation.id': this.journal.id,
      'contentMutation.phase': 'running', 'contentMutation.leaseUntil': { $gt: new Date() } };
  }

  private async intent(undo: Undo) {
    const saved = await EPaper.updateOne(this.runningFilter(), { $push: { 'contentMutation.undo': undo } }, { timestamps: false });
    if (!saved.matchedCount) throw conflict();
    this.journal.undo.push(undo);
  }

  async execute<T>(mutate: () => Promise<T>): Promise<T> {
    let value: T | undefined;
    try {
      if (PROTECTED_EPAPER_AUTOMATION_IDS.has(this.id.toLowerCase())) throw new EpaperConflictError('This preserved QA edition cannot be mutated.');
      const acquired = await EPaper.updateOne({
        _id: this.id, status: 'draft', productionStatus: this.before.productionStatus,
        version: this.before.version == null ? { $exists: false } : this.expectedVersion,
        'contentMutation.id': { $exists: false }, revisionInitializationStatus: { $nin: ['initializing', 'failed'] },
      }, { $set: { contentMutation: this.journal, version: this.expectedVersion + 1 } });
      if (!acquired.matchedCount) throw conflict();
      value = await mutate();
      const committed = await EPaper.updateOne(this.runningFilter(), {
        $set: { ...this.journal.parentUpdates, 'contentMutation.phase': 'committed', 'contentMutation.result': value },
      });
      if (!committed.matchedCount) throw conflict();
      // Commit is already coherent. Cleanup errors retain the committed journal
      // for another worker; they must not turn the save into an API failure.
      try { await recoverEditionContentMutation(this.id); } catch (error) { console.error('[epaper] committed content cleanup pending', { epaperId: this.id, error }); }
      return value;
    } catch (error) {
      try {
        const current = await EPaper.findById(this.id).lean();
        const stored = asObject(current?.contentMutation) as unknown as Journal;
        if (stored.id !== this.journal.id) throw error;
        if (stored.phase === 'committed') {
          try { await recoverEditionContentMutation(this.id); } catch (cleanupError) { console.error('[epaper] committed content cleanup pending', { epaperId: this.id, cleanupError }); }
          return stored.result as T;
        }
        await EPaper.updateOne({ _id: this.id, 'contentMutation.id': this.journal.id, 'contentMutation.phase': 'running' }, {
          $set: { 'contentMutation.phase': 'rollback' },
        }, { timestamps: false });
        await recoverEditionContentMutation(this.id);
      } catch (repairError) {
        if (repairError === error) throw error;
        const failure = new AggregateError([error, repairError], 'Standalone content compensation incomplete; durable recovery is pending.');
        console.error('[epaper] standalone compensation pending', { epaperId: this.id, failure });
        throw failure;
      }
      throw error;
    }
  }

  async stageParent(updates: EpaperRecord) {
    if (Object.keys(updates).some((key) => key !== '$set')) throw new EpaperConflictError('Unsupported content parent mutation.');
    const next = { ...this.journal.parentUpdates, ...asObject(updates.$set) };
    const staged = await EPaper.updateOne(this.runningFilter(), { $set: { 'contentMutation.parentUpdates': next } }, { timestamps: false });
    if (!staged.matchedCount) throw conflict();
    this.journal.parentUpdates = next;
    return staged;
  }

  private async reserve(model: 'article' | 'suggestion', kind: 'update' | 'delete', before: EpaperRecord) {
    if (String(before.epaperId) !== this.id) throw new EpaperConflictError('Child belongs to another edition.');
    const undo: Undo = { token: randomUUID(), kind, model, childId: before._id, version: Number(before.readinessContentVersion || 0) + 1, before };
    await this.intent(undo);
    const reserved = await childModel(undo).collection.updateOne(mutationSnapshotFilter(before, childModel(undo).schema.paths) as never, {
      $set: { readinessMutationToken: undo.token, readinessContentVersion: undo.version },
    }, { maxTimeMS: WRITE_TIMEOUT_MS });
    if (!reserved.matchedCount) throw new EpaperConflictError('Child changed during content mutation. Reload before retrying.');
    return undo;
  }

  private writeFilter(undo: Undo) {
    // Recovery advances the child version even when undo restores its original
    // content. Late commands cannot reuse the restored pre-operation snapshot.
    return { ...ownedChild(undo), $expr: { $lt: ['$$NOW', this.journal.leaseUntil] } };
  }

  async createArticle(data: EpaperRecord) {
    const childId = new Types.ObjectId();
    const undo: Undo = { token: randomUUID(), kind: 'create', model: 'article', childId, version: 1 };
    const now = new Date();
    const desired = new EPaperArticle({ ...data, _id: childId, readinessMutationToken: undo.token, readinessContentVersion: 1,
      readinessMutationHidden: false, createdAt: now, updatedAt: now, __v: 0 });
    await desired.validate();
    await this.intent(undo);
    // Reserve a hidden ID before the real insert. Recovery retains an aborted
    // hidden reservation, preventing delayed inserts from resurrecting content.
    await EPaperArticle.collection.insertOne({ _id: childId, epaperId: new Types.ObjectId(this.id), slug: `__reserved_${childId}`,
      readinessMutationToken: undo.token, readinessContentVersion: 1, readinessMutationHidden: true,
      readinessDiscardAfter: new Date(this.journal.leaseUntil.getTime() + 24 * 60 * 60_000) } as never);
    const created = await EPaperArticle.findOneAndReplace(this.writeFilter(undo), desired.toObject(), {
      new: true, runValidators: true, timestamps: false, maxTimeMS: WRITE_TIMEOUT_MS,
    }).lean();
    if (!created) throw conflict();
    return asObject(created);
  }

  async updateArticle(id: string, updates: EpaperRecord) {
    const before = await EPaperArticle.findById(id).lean();
    if (!before) return null;
    const undo = await this.reserve('article', 'update', asObject(before));
    const saved = await EPaperArticle.findOneAndUpdate(this.writeFilter(undo), updates, { new: true, runValidators: true, maxTimeMS: WRITE_TIMEOUT_MS }).lean();
    if (!saved) throw conflict();
    return asObject(saved);
  }

  async deleteArticle(query: EpaperRecord) {
    const before = await EPaperArticle.findOne(query).lean();
    if (!before) return { deletedCount: 0 };
    const undo = await this.reserve('article', 'delete', asObject(before));
    const hidden = await EPaperArticle.collection.updateOne(this.writeFilter(undo) as never, { $set: { readinessMutationHidden: true } }, { maxTimeMS: WRITE_TIMEOUT_MS });
    if (!hidden.matchedCount) throw conflict();
    return { deletedCount: 1 };
  }

  async updateSuggestion(id: string, updates: EpaperRecord) {
    const before = await EPaperOcrSuggestion.findById(id).lean();
    if (!before) throw new EpaperConflictError('OCR suggestion no longer exists.');
    const undo = await this.reserve('suggestion', 'update', asObject(before));
    const saved = await EPaperOcrSuggestion.findOneAndUpdate(this.writeFilter(undo), updates, { new: true, runValidators: true, maxTimeMS: WRITE_TIMEOUT_MS }).lean();
    if (!saved) throw conflict();
    return saved;
  }
}

async function undoChild(editionId: string, undo: Undo) {
  const model = childModel(undo);
  const row = await model.collection.findOne({ _id: undo.childId } as never);
  if (undo.kind === 'create') {
    if (row && row.readinessMutationToken !== undo.token) {
      if (row.readinessMutationHidden && Number(row.readinessContentVersion) > undo.version) return;
      throw new EpaperConflictError('Created child has a newer owner; durable repair retained it.');
    }
    const tombstone = { _id: undo.childId, epaperId: new Types.ObjectId(editionId), slug: `__aborted_${String(undo.childId)}`,
      readinessMutationHidden: true, readinessContentVersion: undo.version + 1, readinessDiscardAfter: new Date(Date.now() + 24 * 60 * 60_000) };
    if (!row) {
      try { await model.collection.insertOne(tombstone as never); } catch (error) {
        const current = await model.collection.findOne({ _id: undo.childId } as never);
        if (current?.readinessMutationHidden && Number(current.readinessContentVersion) > undo.version) return;
        throw error;
      }
    } else {
      const restored = await model.collection.replaceOne(ownedChild(undo) as never, tombstone as never);
      if (!restored.matchedCount) return undoChild(editionId, undo);
    }
    return;
  }
  const before = undo.before!;
  if (row && row.readinessMutationToken !== undo.token) {
    if (Number(row.readinessContentVersion || 0) > undo.version) return;
    if (row.readinessMutationToken) throw new EpaperConflictError('Child has another mutation owner; durable repair retained it.');
    // Reservation did not own this child. Preserve an independently edited
    // record and advance only its metadata fence, preventing a delayed old CAS.
    const untouched = await model.collection.updateOne(mutationSnapshotFilter(asObject(row), model.schema.paths) as never, { $set: { readinessContentVersion: undo.version + 1 } });
    if (untouched.matchedCount) return;
    throw new EpaperConflictError('Child changed during repair; durable retry retained it.');
  }
  const restored: EpaperRecord = { ...before, readinessContentVersion: undo.version + 1 };
  delete restored.readinessMutationToken;
  if (!row) {
    await model.collection.insertOne(restored as never);
  } else {
    const result = await model.collection.replaceOne(ownedChild(undo) as never, restored as never);
    if (!result.matchedCount) return undoChild(editionId, undo);
  }
}

export async function recoverEditionContentMutation(id: string) {
  if (PROTECTED_EPAPER_AUTOMATION_IDS.has(id.toLowerCase())) return false;
  const parent = await EPaper.findById(id).lean();
  const journal = asObject(parent?.contentMutation) as unknown as Journal;
  if (!journal.id) return true;
  if (journal.phase === 'running') {
    if (new Date(journal.leaseUntil).getTime() > Date.now()) return false;
    const claimed = await EPaper.updateOne({ _id: id, 'contentMutation.id': journal.id, 'contentMutation.phase': 'running',
      'contentMutation.leaseUntil': { $lte: new Date() } }, { $set: { 'contentMutation.phase': 'rollback' } }, { timestamps: false });
    if (!claimed.matchedCount) return false;
    journal.phase = 'rollback';
  }
  if (journal.phase === 'committed') {
    for (const undo of journal.undo) {
      const collection = childModel(undo).collection;
      if (undo.kind === 'delete') await collection.deleteOne(ownedChild(undo) as never);
      else await collection.updateOne(ownedChild(undo) as never, { $unset: { readinessMutationToken: '' } });
      const remaining = await collection.findOne({ _id: undo.childId } as never);
      if (remaining?.readinessMutationToken === undo.token) throw new EpaperConflictError('Committed child cleanup incomplete; durable recovery retained.');
    }
  } else {
    const failures: unknown[] = [];
    for (const undo of [...journal.undo].reverse()) {
      try { await undoChild(id, undo); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Durable content compensation incomplete.');
  }
  const released = await EPaper.updateOne({ _id: id, 'contentMutation.id': journal.id, 'contentMutation.phase': journal.phase }, {
    $unset: { contentMutation: '' }, ...(journal.phase === 'rollback' ? { $inc: { version: 1 } } : {}),
  }, { timestamps: false });
  if (!released.matchedCount) {
    const current = await EPaper.findById(id).lean();
    if (asObject(current?.contentMutation).id === journal.id) throw new EpaperConflictError('Content recovery unlock incomplete; durable retry retained.');
  }
  return true;
}

export async function recoverPendingEditionContentMutations(limit = 20) {
  await connectDB();
  const rows = await EPaper.find({ status: 'draft', _id: { $nin: [...PROTECTED_EPAPER_AUTOMATION_IDS] }, $or: [
    { 'contentMutation.phase': { $in: ['rollback', 'committed'] } },
    { 'contentMutation.phase': 'running', 'contentMutation.leaseUntil': { $lte: new Date() } },
  ] }).sort({ 'contentMutation.startedAt': 1 }).limit(limit).select('_id').lean();
  let recovered = 0;
  for (const row of rows) {
    try { if (await recoverEditionContentMutation(String(row._id))) recovered += 1; }
    catch (error) { console.error('[epaper] durable content recovery pending', { epaperId: String(row._id), error }); }
  }
  return { inspected: rows.length, recovered };
}
