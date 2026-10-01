const path = require('node:path');
const { spawn } = require('node:child_process');
const { assertSafeWorkerEnvironment } = require('./run-automation-worker');

// One child per application owner; Mongo job leases remain the cross-process
// correctness boundary. A crashed child restarts with bounded, non-busy backoff.
function superviseAutomationWorker({ projectRoot, env = process.env, spawnChild = spawn }) {
  assertSafeWorkerEnvironment(env);
  let child;
  let restartTimer;
  let stopped = false;
  let failures = 0;
  const launch = () => {
    if (stopped) return;
    const startedAt = Date.now();
    child = spawnChild(process.execPath,
      [path.join(projectRoot, 'scripts', 'epaper', 'run-automation-worker.js')],
      { cwd: projectRoot, env, stdio: 'inherit' });
    let settled = false;
    const recover = () => {
      if (settled || stopped) return;
      settled = true;
      failures = Date.now() - startedAt > 60_000 ? 1 : failures + 1;
      const delay = Math.min(60_000, 5_000 * 2 ** Math.min(failures - 1, 4));
      console.error('[epaper-automation] worker exited; restarting in ' + delay + 'ms');
      restartTimer = setTimeout(launch, delay);
    };
    child.once('error', recover);
    child.once('exit', recover);
  };
  launch();
  return {
    get killed() { return stopped; },
    get exitCode() { return stopped ? child?.exitCode ?? 0 : null; },
    kill(signal = 'SIGTERM') {
      stopped = true;
      clearTimeout(restartTimer);
      if (child && child.exitCode === null && !child.killed) child.kill(signal);
    },
  };
}

module.exports = { superviseAutomationWorker };
