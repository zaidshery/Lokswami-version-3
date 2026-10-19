// Export only a clean committed snapshot; never walk local credentials/data.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createSourceRelease(root = path.resolve(__dirname, '..')) {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const commit = git(['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error('A committed Git checkout is required.');
  if (git(['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Commit or isolate changes before packaging a source release.');
  const output = path.join(root, 'lokswami-upload.zip');
  const attributes = git(['show', `${commit}:.gitattributes`]);
  for (const rule of ['/.env* export-ignore', '/data export-ignore', '/artifacts export-ignore']) {
    if (!attributes.split(/\r?\n/).includes(rule)) throw new Error('Release archive exclusions are missing from the committed snapshot.');
  }
  git(['archive', '--format=zip', '--output', output, commit]);
  const evidence = {
    sourceCommit: commit,
    sourceArchiveSha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
    nodeVersion: process.versions.node,
    ciRunId: /^\d+$/.test(process.env.RELEASE_CI_RUN_ID || '') ? process.env.RELEASE_CI_RUN_ID : null,
    createdAt: new Date().toISOString(),
    artifactType: 'source-archive-requires-host-build',
  };
  fs.writeFileSync(path.join(root, 'release-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (require.main === module) {
  try { console.log(JSON.stringify(createSourceRelease(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createSourceRelease };
