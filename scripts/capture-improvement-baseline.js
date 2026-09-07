const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, '.hostinger', 'improvement-baselines', stamp);
fs.mkdirSync(output, { recursive: true });
const files = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard')
  .toString().split('\0').filter(Boolean))];
const group = (file) => /swipe|shorts|video/i.test(file) ? 'swipe-video'
  : /epaper|emagazine|pdf/i.test(file) ? 'publications-pdf'
  : /storage|lock|redis/i.test(file) ? 'storage-locking'
  : /auth|account|user|profile/i.test(file) ? 'accounts'
  : /admin|forms|workflow/i.test(file) ? 'cms' : 'reader-platform';
const records = files.map((file) => {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) return { path: file, deleted: true, group: group(file) };
  const buffer = fs.readFileSync(source);
  const target = path.join(output, 'checkout', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  return { path: file, group: group(file), sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
});
fs.writeFileSync(path.join(output, 'working-tree.patch'), git('diff', '--binary', 'HEAD'));
fs.writeFileSync(path.join(output, 'index.patch'), git('diff', '--cached', '--binary'));
const manifest = {
  capturedAt: new Date().toISOString(), branch: git('branch', '--show-current').toString().trim(),
  head: git('rev-parse', 'HEAD').toString().trim(), node: process.version,
  remoteMain: process.env.BASELINE_REMOTE_MAIN || 'not verified by this capture',
  status: git('status', '--porcelain=v1', '-uall').toString(),
  note: 'Private local recovery artifact. May contain runtime data. Never upload as a release package.',
  files: records,
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
const routes = records.filter(({ path: file }) => /^app\/.*\/(page\.tsx|route\.tsx?)$/.test(file));
fs.writeFileSync(path.join(output, 'acceptance-matrix.json'), JSON.stringify(routes.map((entry) => ({
  path: entry.path, group: entry.group,
  audience: entry.path.includes('(admin)') || entry.path.includes('/api/admin/') ? 'permitted newsroom roles' : 'reader/API consumer',
  read: 'pending', write: 'pending applicability review', permissions: 'pending', responsive: 'pending applicability review',
  evidence: [], defects: [],
})), null, 2));
console.log(JSON.stringify({ output, files: records.length, routes: routes.length }));
