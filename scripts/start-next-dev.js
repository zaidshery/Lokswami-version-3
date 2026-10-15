const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { cleanNextArtifacts } = require('./clean-next-artifacts');
const { superviseAutomationWorker } = require('./epaper/automation-worker-supervisor');
const {
  claimDevServerState,
  releaseDevServerState,
  updateDevServerChildPid,
} = require('./dev-server-state');
const {
  loadStagingEnvFiles,
  validateStagingEnv,
} = require('./validate-staging-env');

loadStagingEnvFiles();

const projectRoot = process.cwd();
let claimedState;
let child;
let automationWorker;

function runPreparationScript() {
  const scriptPath = path.join(projectRoot, 'scripts', 'sync-next-env-dist.js');
  const result = spawnSync(process.execPath, [scriptPath, '.next-dev'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Development preparation failed with exit code ${result.status}.`);
  }
}

function startAutomationWorker() {
  if (process.env.EPAPER_AUTOMATION_WORKER_ENABLED === '0') return null;
  return superviseAutomationWorker({ projectRoot });
}

function validateAutomationEnvironment() {
  if (process.env.EPAPER_AUTOMATION_WORKER_ENABLED === '0') return;
  const validation = validateStagingEnv(process.env);
  if (!validation.ok) {
    throw new Error(
      'Development automation requires a safe staging environment: ' +
        validation.errors.join(' ')
    );
  }
}

function releaseClaim() {
  if (claimedState) {
    releaseDevServerState(projectRoot, claimedState.token);
  }
}

function forwardSignal(signal) {
  if (automationWorker && automationWorker.exitCode === null && !automationWorker.killed) {
    automationWorker.kill(signal);
  }
  if (child && child.exitCode === null && !child.killed) {
    child.kill(signal);
    return;
  }

  releaseClaim();
  process.exit(1);
}

try {
  validateAutomationEnvironment();
  claimedState = claimDevServerState(projectRoot);
  runPreparationScript();
  cleanNextArtifacts({
    projectRoot,
    targets: ['.next-dev'],
    allowDevServerPid: process.pid,
  });

  const nextBin = require.resolve('next/dist/bin/next');
  child = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  automationWorker = startAutomationWorker();
  updateDevServerChildPid(projectRoot, claimedState.token, child.pid);

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  child.once('error', (error) => {
    releaseClaim();
    console.error(error);
    process.exit(1);
  });

  child.once('exit', (code, signal) => {
    if (automationWorker && automationWorker.exitCode === null && !automationWorker.killed) {
      automationWorker.kill('SIGTERM');
    }
    releaseClaim();
    process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
  });
} catch (error) {
  if (automationWorker) automationWorker.kill('SIGTERM');
  if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM');
  releaseClaim();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
