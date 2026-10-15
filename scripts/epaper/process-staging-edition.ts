#!/usr/bin/env ts-node

const PRESERVED_QA_EPAPER_ID = '6ab0da70c6aab6a2a6cab44e';
const DEFAULT_MAX_RUNTIME_MS = 15 * 60 * 1000;

type WorkerResult = {
  claimed: number;
  status: string;
  jobId?: string;
  jobStatus?: string;
  nextAttemptAt?: string | null;
  result?: {
    status: string;
    processed: number;
    failed: number;
  };
};

export function assertSafeStagingEpaperTarget(epaperId: string) {
  if (!/^[a-f\d]{24}$/i.test(epaperId)) {
    throw new Error('--epaper-id must be a valid 24-character MongoDB ObjectId.');
  }
  if (epaperId.toLowerCase() === PRESERVED_QA_EPAPER_ID) {
    throw new Error('The preserved QA e-paper is blocked from targeted processing.');
  }
}

function readArguments(argv: string[]) {
  const idArgument = argv.find((argument) => argument.startsWith('--epaper-id='));
  const epaperId = String(idArgument?.slice('--epaper-id='.length) || '').trim();
  const untilTerminal = argv.includes('--until-terminal');
  assertSafeStagingEpaperTarget(epaperId);
  return { epaperId, untilTerminal };
}

function isTerminal(result: WorkerResult) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(
    result.result?.status || result.jobStatus || result.status
  );
}

function safeSummary(epaperId: string, result: WorkerResult) {
  return {
    epaperId,
    claimed: result.claimed,
    status: result.status,
    jobId: result.jobId || null,
    jobStatus: result.result?.status || result.jobStatus || null,
    processed: result.result?.processed ?? null,
    failed: result.result?.failed ?? null,
    nextAttemptAt: result.nextAttemptAt || null,
  };
}

async function main() {
  const { epaperId, untilTerminal } = readArguments(process.argv.slice(2));
  const {
    loadStagingEnvFiles,
    validateStagingEnv,
  } = require('../validate-staging-env') as {
    loadStagingEnvFiles: () => void;
    validateStagingEnv: (env: NodeJS.ProcessEnv) => {
      ok: boolean;
      errors: string[];
    };
  };

  loadStagingEnvFiles();
  const validation = validateStagingEnv(process.env);
  if (!validation.ok) {
    throw new Error(`Staging safety validation failed: ${validation.errors.join('; ')}`);
  }
  if (String(process.env.VERCEL_ENV || '').trim().toLowerCase() === 'production') {
    throw new Error('Production deployment environments cannot run this command.');
  }

  // `server-only` is a Next.js build marker, not runtime logic. This command is
  // itself server-only and loads the worker only after staging validation.
  const nodeModule = require('node:module') as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = nodeModule._load;
  nodeModule._load = function loadServerModule(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === 'server-only') return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  let importedModules;
  try {
    importedModules = await Promise.all([
      import('../../lib/db/mongoose'),
      import('../../lib/server/epaperProcessingJobs'),
      import('mongoose'),
    ]);
  } finally {
    nodeModule._load = originalLoad;
  }
  const [{ default: connectDB }, workerModule, mongooseModule] = importedModules;

  await connectDB();
  const startedAt = Date.now();
  try {
    while (true) {
      const result = (await workerModule.processEpaperJobForEdition({
        epaperId,
      })) as WorkerResult;
      console.log(JSON.stringify(safeSummary(epaperId, result)));

      if (isTerminal(result) || result.status === 'paused') {
        process.exitCode = result.status === 'paused' ? 2 : 0;
        return;
      }
      if (!untilTerminal) {
        process.exitCode = result.status === 'no_active_job' ? 0 : 2;
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed >= DEFAULT_MAX_RUNTIME_MS) {
        throw new Error('Targeted worker reached its 15-minute runtime limit.');
      }
      const nextAttemptAt = result.nextAttemptAt
        ? new Date(result.nextAttemptAt).getTime()
        : Date.now() + 1000;
      const waitMs = Math.max(250, nextAttemptAt - Date.now());
      if (elapsed + waitMs > DEFAULT_MAX_RUNTIME_MS) {
        throw new Error('Next retry falls outside the 15-minute runtime limit.');
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  } finally {
    await mongooseModule.default.disconnect().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    console.error(message.replace(/https?:\/\/\S+/gi, '[REDACTED_URL]').slice(0, 1200));
    process.exitCode = 1;
  });
}
