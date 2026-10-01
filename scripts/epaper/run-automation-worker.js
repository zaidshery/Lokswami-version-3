const path = require('node:path');
const { loadStagingEnvFiles, validateStagingEnv } = require('../validate-staging-env');

function assertSafeWorkerEnvironment(env = process.env) {
  const environment = String(env.LOKSWAMI_ENV || '').trim().toLowerCase();
  if (environment === 'staging') {
    const validation = validateStagingEnv(env);
    if (!validation.ok) {
      throw new Error('Unsafe staging worker environment: ' + validation.errors.join(' '));
    }
    return;
  }
  if (env.NODE_ENV === 'production' && env.EPAPER_AUTOMATION_WORKER_ENABLED === '1') return;
  throw new Error('Automation requires validated staging or explicit production enablement.');
}

function loadWorkerService() {
  process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
    module: 'CommonJS',
    moduleResolution: 'node',
    baseUrl: '.',
  });
  require('ts-node/register/transpile-only');
  require('tsconfig-paths/register');
  // This standalone server process validates its environment before loading
  // services. server-only is a Next build marker, not executable runtime logic.
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  return require(path.resolve(__dirname, '../../lib/server/epaper/epaperProcessingService.ts'))
    .epaperProcessingService;
}

function didWork(result) {
  return Boolean(
    Number(result?.processing?.claimed || 0) > 0 ||
    Number(result?.ocr?.processed || 0) > 0 ||
    result?.automation?.results?.some((entry) => entry?.changed)
  );
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

async function runEpaperAutomationWorker(signal, env = process.env, service) {
  assertSafeWorkerEnvironment(env);
  const worker = service || loadWorkerService();
  console.log('[epaper-automation] background worker started');
  try {
    while (!signal.aborted) {
      let active = false;
      try {
        active = didWork(await worker.processDue());
      } catch (error) {
        console.error('[epaper-automation] cycle failed:',
          error instanceof Error ? error.message : 'Unknown worker error');
      }
      await wait(active ? 2_000 : 15_000, signal);
    }
  } finally {
    await require('mongoose').disconnect();
    console.log('[epaper-automation] background worker stopped');
  }
}

async function main() {
  if (process.env.NODE_ENV !== 'production' || process.env.LOKSWAMI_ENV === 'staging') {
    loadStagingEnvFiles();
  }
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());
  process.once('SIGTERM', () => controller.abort());
  await runEpaperAutomationWorker(controller.signal);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[epaper-automation] startup failed:',
      error instanceof Error ? error.message : 'Unknown startup error');
    process.exitCode = 1;
  });
}

module.exports = { assertSafeWorkerEnvironment, didWork, runEpaperAutomationWorker };
