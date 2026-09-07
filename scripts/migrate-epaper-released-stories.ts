/** Dry-run inventory first. Write mode requires an explicitly approved, unchanged manifest. */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import EPaper from '../lib/models/EPaper';
import EPaperArticle from '../lib/models/EPaperArticle';
import { makeReleasedEpaperStory } from '../lib/content/epaperStoryPublication';

type Approval = { storyId: string; paperId: string; fingerprint: string; approved: boolean; title: string };
function fingerprint(story: unknown, paper: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify({ story, paper })).digest('hex');
}
async function main() {
  const write = process.argv.includes('--write');
  const file = process.argv[process.argv.indexOf('--manifest') + 1];
  if (!process.argv.includes('--manifest') || !file) throw new Error('Provide --manifest <private local JSON path>. Dry run creates it; --write applies approved entries only.');
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI explicitly for the intended database.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  const approved: { database: string; approvedBy: string; entries: Approval[] } | null = write ? JSON.parse(await fs.readFile(file, 'utf8')) : null;
  if (approved && (!approved.approvedBy?.trim() || approved.database !== mongoose.connection.name)) throw new Error('Manifest database and approvedBy must match the intended migration.');
  const entries: Approval[] = [];
  let applied = 0;
  for await (const paper of EPaper.find({ status: 'published', isCurrentRevision: { $ne: false } }).lean().cursor()) {
    for await (const story of EPaperArticle.find({ epaperId: paper._id, releasedSnapshot: null }).lean().cursor()) {
      const page = paper.pages.find((entry) => entry.pageNumber === story.pageNumber);
      if (!page?.imagePath) continue;
      const hash = fingerprint(story, { updatedAt: paper.updatedAt, page });
      const candidate = { storyId: String(story._id), paperId: String(paper._id), fingerprint: hash, approved: false, title: story.title };
      entries.push(candidate);
      if (!approved?.entries.some((entry) => entry.approved === true && entry.storyId === candidate.storyId && entry.paperId === candidate.paperId && entry.fingerprint === hash)) continue;
      const snapshot = makeReleasedEpaperStory({ ...story, pageImagePath: page.imagePath } as unknown as Record<string, unknown>, approved.approvedBy, 1);
      snapshot.legacy = true;
      const update = await EPaperArticle.updateOne({ _id: story._id, updatedAt: story.updatedAt, releasedSnapshot: null }, { $set: { releasedSnapshot: snapshot } });
      if (update.modifiedCount !== 1) throw new Error(`Concurrent edit prevented migration of ${story._id}. Re-inventory.`);
      applied += 1;
    }
  }
  if (!write) await fs.writeFile(file, JSON.stringify({ database: mongoose.connection.name, approvedBy: '', warning: 'Candidates are not approvals. Confirm each previously public mapping against the live inventory.', entries }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ mode: write ? 'write' : 'dry-run', candidates: entries.length, applied }));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Migration failed.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
