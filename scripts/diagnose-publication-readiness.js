#!/usr/bin/env node

// Counts and timestamps only; never updates articles, jobs or release snapshots.
const { MongoClient, ObjectId } = require('mongodb');
const { loadStagingEnvFiles } = require('./validate-staging-env');

async function main() {
  loadStagingEnvFiles();
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, timeoutMS: 20000 });
  try {
    await client.connect();
    const db = client.db();
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const recent = await db.collection('articles').find({ $or: [{ publishedAt: { $gte: cutoff } }, { 'workflow.publishedAt': { $gte: cutoff } }] }, {
      projection: { _id: 0, publishedAt: 1, 'workflow.status': 1, 'workflow.publishedAt': 1, 'seo.includeInNewsSitemap': 1 },
    }).limit(1001).toArray();
    const paperId = process.argv[2];
    let paper = null;
    if (paperId) {
      if (!/^[a-f0-9]{24}$/i.test(paperId)) throw new Error('Invalid E-paper ID');
      const _id = new ObjectId(paperId);
      const record = await db.collection('epapers').findOne({ _id }, { projection: { status: 1, productionStatus: 1, pageCount: 1, 'processingJob.status': 1 } });
      paper = record ? { status: record.status, productionStatus: record.productionStatus, pageCount: record.pageCount,
        storedStories: await db.collection('epaperarticles').countDocuments({ epaperId: _id }),
        releasedStories: await db.collection('epaperarticles').countDocuments({ epaperId: _id, releasedSnapshot: { $ne: null } }),
      } : { found: false };
    }
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), cutoff, recentTimestampCandidates: recent.length, truncated: recent.length > 1000, recent, paper }, null, 2));
  } finally { await client.close(); }
}

main().catch(() => { console.error('Read-only publication diagnostic failed. Check connection and permissions locally.'); process.exitCode = 1; });
