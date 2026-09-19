const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { cleanNextArtifacts } = require('./clean-next-artifacts');
const {
  claimDevServerState,
  releaseDevServerState,
  updateDevServerChildPid,
} = require('./dev-server-state');
const { loadStagingEnvFiles } = require('./validate-staging-env');

loadStagingEnvFiles();

const projectRoot = process.cwd();
let claimedState;
let child;

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

function releaseClaim() {
  if (claimedState) {
    releaseDevServerState(projectRoot, claimedState.token);
  }
}

function forwardSignal(signal) {
  if (child && child.exitCode === null && !child.killed) {
    child.kill(signal);
    return;
  }

  releaseClaim();
  process.exit(1);
}

try {
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
  updateDevServerChildPid(projectRoot, claimedState.token, child.pid);

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  child.once('error', (error) => {
    releaseClaim();
    console.error(error);
    process.exit(1);
  });

  child.once('exit', (code, signal) => {
    releaseClaim();
    process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
  });
} catch (error) {
  releaseClaim();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
