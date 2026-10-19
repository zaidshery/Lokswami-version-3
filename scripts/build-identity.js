const { spawnSync } = require('child_process');

function readBuildIdentity(runGit = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}) {
  const sha = runGit(['rev-parse', 'HEAD']);
  const status = runGit(['status', '--porcelain', '--untracked-files=normal']);
  return {
    commit: /^[a-f0-9]{40}$/i.test(sha || '') ? sha.toLowerCase() : 'unknown',
    dirty: status === null ? 'unknown' : String(status.length > 0),
  };
}

module.exports = { readBuildIdentity };
