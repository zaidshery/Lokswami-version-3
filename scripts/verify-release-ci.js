const { execFileSync } = require('child_process');

function validateReleaseCi(run, { repository, sha }) {
  return Boolean(run && run.status === 'completed' && run.conclusion === 'success'
    && run.path === '.github/workflows/ci.yml' && run.event === 'push'
    && run.head_branch === 'main' && run.head_sha === sha
    && run.repository?.full_name === repository && run.head_repository?.full_name === repository);
}

function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.RELEASE_SOURCE_SHA;
  const runId = process.env.RELEASE_CI_RUN_ID;
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository || '') || !/^[a-f0-9]{40}$/i.test(sha || '') || !/^\d+$/.test(runId || '')) {
    throw new Error('Repository, full release SHA and CI run ID are required.');
  }
  const run = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/actions/runs/${runId}`], { encoding: 'utf8', windowsHide: true }));
  if (!validateReleaseCi(run, { repository, sha })) throw new Error('Release requires successful main push CI for the exact source SHA.');
  console.log(`Verified CI run ${runId} for ${sha}.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateReleaseCi };
