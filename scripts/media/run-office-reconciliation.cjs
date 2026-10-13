'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

function assertOfficeEnvironment(env) {
  const url = new URL(env.MONGODB_URI || '');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (url.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(url.hostname)
    || url.port !== '27038' || !/^lokswami_phase318c_office_qa_\d{8}$/.test(database)
    || env.LOKSWAMI_CMS_QA !== 'true' || env.LOKSWAMI_CMS_QA_DB_NAME !== database
    || env.DIGITALOCEAN_SPACES_BUCKET !== 'lokswami-staging-media'
    || env.DIGITALOCEAN_SPACES_REGION !== 'sgp1'
    || !env.DIGITALOCEAN_SPACES_ACCESS_KEY || !env.DIGITALOCEAN_SPACES_SECRET_KEY
    || !env.LOKSWAMI_QA_SPACES_ACCESS_KEY_SHA256
    || crypto.createHash('sha256').update(env.DIGITALOCEAN_SPACES_ACCESS_KEY).digest('hex') !== env.LOKSWAMI_QA_SPACES_ACCESS_KEY_SHA256) {
    throw new Error('Office reconciliation requires the explicit owned loopback QA database and verified QA Spaces key.');
  }
  return { database, bucket: env.DIGITALOCEAN_SPACES_BUCKET, region: env.DIGITALOCEAN_SPACES_REGION };
}

function parseOptions(args) {
  const options = { cycles: 1, intervalMs: 15000, limit: 25, maxRuntimeMs: 120000 };
  const names = { '--cycles': 'cycles', '--interval-ms': 'intervalMs', '--limit': 'limit', '--max-runtime-ms': 'maxRuntimeMs' };
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]], value = Number(args[i + 1]);
    if (!key || !Number.isInteger(value)) throw new Error('Unknown or invalid worker argument.');
    options[key] = value;
  }
  if (options.cycles < 1 || options.cycles > 10 || options.limit < 1 || options.limit > 100
    || options.intervalMs < 1000 || options.intervalMs > 60000
    || options.maxRuntimeMs < 1000 || options.maxRuntimeMs > 600000) throw new Error('Worker bounds are invalid.');
  return options;
}

async function runBounded({ env, options, service, log, lockRoot = os.tmpdir(), signal }) {
  const scope = assertOfficeEnvironment(env);
  const lockPath = path.join(lockRoot, `lokswami-office-media-${scope.database}.lock`);
  const cursorPath = path.join(lockRoot, `lokswami-office-media-${scope.database}.cursor.json`);
  const owner = crypto.randomUUID();
  let fd;
  try { fd = fs.openSync(lockPath, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    log({ event: 'skipped', reason: 'worker_lock_exists', lockPath });
    return { skipped: true };
  }
  fs.writeFileSync(fd, JSON.stringify({ owner, pid: process.pid, createdAt: new Date().toISOString(), ...scope }));
  fs.closeSync(fd);
  log({ event: 'started', ...scope, options, lockPath });
  const deadline = Date.now() + options.maxRuntimeMs;
  let completed = 0;
  try {
    let cursor = null;
    try {
      const checkpoint = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
      if (checkpoint.version !== 1 || checkpoint.database !== scope.database
        || checkpoint.bucket !== scope.bucket || checkpoint.region !== scope.region) throw new Error('Cleanup checkpoint scope is invalid.');
      cursor = checkpoint.cursor;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    log({ event: 'resumed', cursor, cursorPath });
    for (let cycle = 0; cycle < options.cycles && !signal?.aborted && Date.now() < deadline; cycle += 1) {
      const before = new Date();
      const result = await service.reconcileCleanupDetailed(before, { limit: options.limit, cursor });
      if (!result.progress || result.progress.considered > options.limit) throw new Error('Cleanup service did not return bounded progression.');
      cursor = result.progress.nextCursor;
      const temporary = cursorPath + '.' + owner + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, ...scope, cursor }), { flag: 'wx' });
      fs.renameSync(temporary, cursorPath);
      completed += 1;
      log({ event: 'cycle', cycle: completed, cutoff: before.toISOString(), ...result });
      if (cycle + 1 < options.cycles && !signal?.aborted) {
        await new Promise(resolve => {
          const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
          const timer = setTimeout(finish, Math.min(options.intervalMs, Math.max(0, deadline - Date.now())));
          signal?.addEventListener('abort', finish, { once: true });
        });
      }
    }
    return { skipped: false, completed };
  } finally {
    // Do not reclaim another process's lock or a stale lock automatically.
    const record = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (record.owner === owner) fs.unlinkSync(lockPath);
    log({ event: 'stopped', completed });
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  assertOfficeEnvironment(process.env);
  const log = value => console.log(JSON.stringify({ at: new Date().toISOString(), ...value }));
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  // A hung provider operation must not turn a bounded QA worker into a daemon.
  // Forced exit retains the lock, requiring inspection before a later run.
  const hardStop = setTimeout(() => {
    log({ event: 'deadline_exceeded', lockRetained: true });
    process.exit(1);
  }, options.maxRuntimeMs);
  try {
    process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: 'CommonJS', moduleResolution: 'node', baseUrl: '.' });
    require('ts-node/register/transpile-only');
    require('tsconfig-paths/register');
    const Module = require('node:module'), originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'server-only') return {};
      return originalLoad.call(this, request, parent, isMain);
    };
    const { mediaService } = require(path.resolve(__dirname, '../../lib/server/media/mediaService.ts'));
    await runBounded({ env: process.env, options, service: mediaService, log, signal: controller.signal });
  } finally {
    clearTimeout(hardStop);
    await require('mongoose').disconnect();
  }
}

module.exports = { assertOfficeEnvironment, parseOptions, runBounded };
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ event: 'failed', message: error.message })); process.exitCode = 1; });
