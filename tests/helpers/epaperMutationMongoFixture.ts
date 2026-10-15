import { isDeepStrictEqual } from 'node:util';
import { BSON } from 'mongodb';
import { vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperArticle from '@/lib/models/EPaperArticle';
import EPaperOcrSuggestion from '@/lib/models/EPaperOcrSuggestion';
import EPaperMutationReceipt from '@/lib/models/EPaperMutationReceipt';

export type Row = Record<string, unknown>;
export const editionId = '507f1f77bcf86cd799439011';
export const articleId = '507f1f77bcf86cd799439012';
export const suggestionId = '507f1f77bcf86cd799439013';
export const standaloneError = Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20, codeName: 'IllegalOperation' });
export const clone = <T>(value: T): T => BSON.EJSON.deserialize(BSON.EJSON.serialize(value, { relaxed: false })) as T;
export function get(row: Row, key: string): unknown { return key.split('.').reduce<unknown>((value, part) => (value as Row | null)?.[part], row); }
function set(row: Row, key: string, value: unknown) {
  const parts = key.split('.'); let target = row;
  for (const part of parts.slice(0, -1)) { if (!target[part] || typeof target[part] !== 'object') target[part] = {}; target = target[part] as Row; }
  target[parts.at(-1)!] = clone(value);
}
function equal(left: unknown, right: unknown) {
  if (left && typeof left === 'object' && '_bsontype' in left || right && typeof right === 'object' && '_bsontype' in right) return String(left) === String(right);
  return isDeepStrictEqual(left, right);
}
export function matches(row: Row | undefined, filter: Row): boolean {
  if (!row) return false;
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$and') return (value as Row[]).every((entry) => matches(row, entry));
    if (key === '$or') return (value as Row[]).some((entry) => matches(row, entry));
    if (key === '$expr') return Date.now() < new Date(((value as Row).$lt as unknown[])[1] as Date).getTime();
    const actual = get(row, key);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const op = value as Row;
      if ('$exists' in op && (actual !== undefined) !== op.$exists) return false;
      if ('$nin' in op && (op.$nin as unknown[]).some((candidate) => equal(actual, candidate))) return false;
      if ('$in' in op && !(op.$in as unknown[]).some((candidate) => equal(actual, candidate) || candidate === null && actual === undefined)) return false;
      if ('$ne' in op && equal(actual, op.$ne)) return false;
      if ('$eq' in op && !equal(actual, op.$eq)) return false;
      if ('$gt' in op && !(actual! > op.$gt!)) return false;
      if ('$lte' in op && !(actual! <= op.$lte!)) return false;
      if (Object.keys(op).some((part) => part.startsWith('$'))) return true;
    }
    return equal(actual, value);
  });
}
export function change(row: Row, updates: Row) {
  for (const [key, value] of Object.entries(updates.$set as Row || {})) set(row, key, value);
  for (const [key, value] of Object.entries(updates.$inc as Row || {})) set(row, key, Number(get(row, key) || 0) + Number(value));
  for (const [key, value] of Object.entries(updates.$push as Row || {})) { const list = get(row, key) as unknown[] || []; list.push(clone(value)); set(row, key, list); }
  for (const key of Object.keys(updates.$unset as Row || {})) { const parts = key.split('.'); const target = parts.slice(0, -1).reduce<Row>((value, part) => value[part] as Row, row); if (target) delete target[parts.at(-1)!]; }
}
export type WriteEvent = { collection: 'edition' | 'article' | 'suggestion'; operation: string; filter: Row; payload: Row; phase: 'before' | 'after' };

export function arrangeMutationMongo(mode: 'standalone' | 'transaction' = 'standalone', publicationType = 'epaper') {
  const parent = new EPaper({ _id: editionId, publicationType, citySlug: 'indore', cityName: 'Indore', title: 'Issue', publishDate: new Date('2026-09-29'),
    pageCount: 1, status: 'draft', productionStatus: 'hotspot_mapping', version: 4, pages: [{ pageNumber: 1, imagePath: '/before.jpg', reviewStatus: 'ready' }] }).toObject() as unknown as Row;
  const parents = new Map([[editionId, parent]]);
  const articles = new Map<string, Row>();
  const suggestion = new EPaperOcrSuggestion({ _id: suggestionId, epaperId: editionId, pageNumber: 1, runId: 'run', fingerprint: 'fingerprint', title: 'OCR Story',
    contentHtml: '<p>OCR text</p>', hotspot: { x: 0, y: 0, w: 0.5, h: 0.5 }, confidence: 99, status: 'pending' }).toObject() as unknown as Row;
  const suggestions = new Map([[suggestionId, suggestion]]);
  const events: WriteEvent[] = [];
  const receipts = new Map<string, Row>();
  vi.spyOn(EPaperMutationReceipt, 'findById').mockImplementation(((id: unknown) => ({ lean: async () => clone(receipts.get(String(id)) || null) })) as never);
  vi.spyOn(EPaperMutationReceipt, 'updateOne').mockImplementation((async (filter: Row, updates: Row) => {
    if (!receipts.has(String(filter._id))) receipts.set(String(filter._id), clone(updates.$setOnInsert as Row));
    return { matchedCount: 1, acknowledged: true };
  }) as never);
  let hook: ((event: WriteEvent) => Promise<void> | void) | undefined;
  async function event(collection: WriteEvent['collection'], operation: string, filter: Row, payload: Row, phase: WriteEvent['phase']) {
    const entry = { collection, operation, filter: clone(filter), payload: clone(payload), phase }; events.push(entry); await hook?.(entry);
  }
  function query(read: () => unknown) {
    const result = { select: vi.fn(() => result), sort: () => result, limit: () => result,
      session: () => ({ lean: async () => { if (mode === 'standalone') throw standaloneError; return clone(read()); } }), lean: async () => clone(read()) };
    return result;
  }
  const session = { withTransaction: vi.fn(async (work: () => Promise<void>) => {
    const savedParent = clone(parent); const savedArticles = clone([...articles]); const savedSuggestions = clone([...suggestions]);
    try { return await work(); } catch (error) {
      if (mode === 'transaction') { Object.assign(parent, savedParent); articles.clear(); for (const [key, row] of savedArticles) articles.set(key, row); suggestions.clear(); for (const [key, row] of savedSuggestions) suggestions.set(key, row); }
      throw error;
    }
  }), endSession: vi.fn() };
  vi.spyOn(EPaper.db, 'startSession').mockResolvedValue(session as never);
  vi.spyOn(EPaper, 'findById').mockImplementation(((id: unknown) => query(() => parents.get(String(id)) || null)) as never);
  vi.spyOn(EPaper, 'find').mockImplementation(((filter: Row) => query(() => [...parents.values()].filter((row) => matches(row, filter)))) as never);
  const editionWrite = vi.spyOn(EPaper, 'updateOne').mockImplementation((async (filter: Row, updates: Row) => {
    await event('edition', 'updateOne', filter, updates, 'before'); const row = parents.get(String(filter._id));
    if (!matches(row, filter)) return { matchedCount: 0 };
    if (get(row!, 'contentMutation.id') && typeof filter['contentMutation.id'] !== 'string') throw new Error('A content change is being saved or recovered.');
    change(row!, updates); await event('edition', 'updateOne', filter, updates, 'after'); return { matchedCount: 1 };
  }) as never);
  for (const [model, rows, collection] of [[EPaperArticle, articles, 'article'], [EPaperOcrSuggestion, suggestions, 'suggestion']] as const) {
    function readable(filter: Row) { return [...rows.values()].find((row) => !row.readinessMutationHidden && matches(row, filter)) || null; }
    vi.spyOn(model, 'findById').mockImplementation(((id: unknown) => query(() => readable({ _id: id }))) as never);
    vi.spyOn(model, 'findOne').mockImplementation(((filter: Row) => query(() => readable(filter))) as never);
    vi.spyOn(model, 'find').mockImplementation(((filter: Row) => query(() => [...rows.values()].filter((row) => !row.readinessMutationHidden && matches(row, filter)))) as never);
    vi.spyOn(model, 'exists').mockImplementation((async (filter: Row) => readable(filter) ? { _id: readable(filter)!._id } : null) as never);
    vi.spyOn(model, 'countDocuments').mockImplementation((async (filter: Row) => [...rows.values()].filter((row) => !row.readinessMutationHidden && matches(row, filter)).length) as never);
    vi.spyOn(model.collection, 'findOne').mockImplementation((async (filter: Row) => clone([...rows.values()].find((row) => matches(row, filter)) || null)) as never);
    vi.spyOn(model.collection, 'insertOne').mockImplementation((async (data: Row) => {
      await event(collection, 'insertOne', { _id: data._id }, data, 'before');
      if (rows.has(String(data._id)) || [...rows.values()].some((row) => equal(row.epaperId, data.epaperId) && row.slug === data.slug)) throw new Error('duplicate successor');
      rows.set(String(data._id), clone(data)); await event(collection, 'insertOne', { _id: data._id }, data, 'after'); return { acknowledged: true };
    }) as never);
    vi.spyOn(model.collection, 'updateOne').mockImplementation((async (filter: Row, updates: Row) => {
      await event(collection, 'updateOne', filter, updates, 'before'); const row = rows.get(String(filter._id));
      if (!matches(row, filter)) return { matchedCount: 0 }; change(row!, updates);
      await event(collection, 'updateOne', filter, updates, 'after'); return { matchedCount: 1 };
    }) as never);
    vi.spyOn(model.collection, 'replaceOne').mockImplementation((async (filter: Row, replacement: Row) => {
      await event(collection, 'replaceOne', filter, replacement, 'before'); const key = String(filter._id);
      if (!matches(rows.get(key), filter)) return { matchedCount: 0 };
      if ([...rows.values()].some((row) => String(row._id) !== key && equal(row.epaperId, replacement.epaperId) && row.slug === replacement.slug)) throw new Error('duplicate successor');
      rows.set(key, clone(replacement)); await event(collection, 'replaceOne', filter, replacement, 'after'); return { matchedCount: 1 };
    }) as never);
    vi.spyOn(model.collection, 'deleteOne').mockImplementation((async (filter: Row) => {
      await event(collection, 'deleteOne', filter, {}, 'before'); const key = String(filter._id);
      if (!matches(rows.get(key), filter)) return { deletedCount: 0 }; rows.delete(key); await event(collection, 'deleteOne', filter, {}, 'after'); return { deletedCount: 1 };
    }) as never);
    vi.spyOn(model, 'findOneAndUpdate').mockImplementation(((filter: Row, updates: Row) => ({ lean: async () => {
      await event(collection, 'findOneAndUpdate', filter, updates, 'before'); const row = rows.get(String(filter._id));
      if (!matches(row, filter)) return null; change(row!, { $set: updates }); await event(collection, 'findOneAndUpdate', filter, updates, 'after'); return clone(row);
    } })) as never);
    vi.spyOn(model, 'findByIdAndUpdate').mockImplementation(((id: unknown, updates: Row) => ({ lean: async () => {
      const row = rows.get(String(id)); if (!row) return null; change(row, { $set: updates }); return clone(row);
    } })) as never);
  }
  vi.spyOn(EPaperArticle, 'findOneAndReplace').mockImplementation(((filter: Row, replacement: Row) => ({ lean: async () => {
    await event('article', 'findOneAndReplace', filter, replacement, 'before'); const key = String(filter._id);
    if (!matches(articles.get(key), filter)) return null; articles.set(key, clone(replacement));
    await event('article', 'findOneAndReplace', filter, replacement, 'after'); return clone(replacement);
  } })) as never);
  vi.spyOn(EPaperArticle, 'create').mockImplementation((async (input: Row | Row[]) => {
    const data = Array.isArray(input) ? input[0] : input; const row = new EPaperArticle({ _id: articleId, ...data }).toObject() as unknown as Row;
    articles.set(String(row._id), clone(row)); const document = { toObject: () => clone(row) }; return Array.isArray(input) ? [document] : document;
  }) as never);
  vi.spyOn(EPaperArticle, 'deleteOne').mockImplementation((async (filter: Row) => {
    const row = articles.get(String(filter._id)); if (!matches(row, filter)) return { deletedCount: 0 }; articles.delete(String(filter._id)); return { deletedCount: 1 };
  }) as never);
  const seed = (overrides: Row = {}) => {
    const row = new EPaperArticle({ _id: articleId, epaperId: editionId, pageNumber: 1, title: 'Before', slug: 'before', contentHtml: '<p>Before</p>',
      hotspot: { x: 0, y: 0, w: 0.5, h: 0.5 }, createdAt: new Date('2026-09-28'), updatedAt: new Date('2026-09-28'), __v: 0, ...overrides }).toObject() as unknown as Row;
    articles.set(String(row._id), clone(row)); return clone(row);
  };
  return { parent, parents, articles, suggestions, receipts, events, session, editionWrite, seed,
    onWrite: (callback?: typeof hook) => { hook = callback; }, visible: () => [...articles.values()].filter((row) => !row.readinessMutationHidden),
    compete: () => { parent.version = Number(parent.version) + 1; parent.pages = [{ pageNumber: 1, imagePath: '/concurrent.jpg' }]; },
  };
}
