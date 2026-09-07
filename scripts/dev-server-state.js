const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const STATE_FILE_NAME = '.next-dev-server.json';

function getStatePath(projectRoot = process.cwd()) {
  return path.join(projectRoot, STATE_FILE_NAME);
}

function isProcessAlive(pid) {
  const processId = Number(pid);
  if (!Number.isInteger(processId) || processId <= 0) {
    return false;
  }

  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function readDevServerState(projectRoot = process.cwd()) {
  const statePath = getStatePath(projectRoot);

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      token: String(parsed.token || ''),
      launcherPid: Number(parsed.launcherPid) || 0,
      childPid: Number(parsed.childPid) || 0,
      startedAt: String(parsed.startedAt || ''),
    };
  } catch {
    return null;
  }
}

function getActiveDevServerState(projectRoot = process.cwd()) {
  const state = readDevServerState(projectRoot);
  if (!state) {
    return null;
  }

  // The launcher is the process that owns the development lifecycle.
  // If the launcher is dead, the claim is stale and should not block new runs.
  if (state.launcherPid && isProcessAlive(state.launcherPid)) {
    return state;
  }

  return null;
}

function removeStateFile(projectRoot = process.cwd()) {
  fs.rmSync(getStatePath(projectRoot), { force: true });
}

function claimDevServerState(projectRoot = process.cwd()) {
  const statePath = getStatePath(projectRoot);
  const state = {
    token: randomUUID(),
    launcherPid: process.pid,
    childPid: 0,
    startedAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      return state;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') {
        throw error;
      }

      const existing = getActiveDevServerState(projectRoot);
      if (existing) {
        const activePid = existing.childPid || existing.launcherPid;
        throw new Error(`A Lokswami development server is already running (PID ${activePid}).`);
      }

      if (attempt === 0) {
        removeStateFile(projectRoot);
        continue;
      }

      throw new Error('Another development server is starting. Try again after it finishes.');
    }
  }

  throw new Error('Unable to claim the development build directory.');
}

function updateDevServerChildPid(projectRoot, token, childPid) {
  const state = readDevServerState(projectRoot);
  if (!state || state.token !== token) {
    throw new Error('Development server ownership changed before startup completed.');
  }

  const nextState = {
    ...state,
    childPid: Number(childPid) || 0,
  };
  fs.writeFileSync(getStatePath(projectRoot), `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return nextState;
}

function releaseDevServerState(projectRoot, token) {
  const state = readDevServerState(projectRoot);
  if (state?.token === token) {
    removeStateFile(projectRoot);
  }
}

module.exports = {
  STATE_FILE_NAME,
  claimDevServerState,
  getActiveDevServerState,
  getStatePath,
  isProcessAlive,
  readDevServerState,
  releaseDevServerState,
  updateDevServerChildPid,
};
