const fs = require('fs');
const path = require('path');

// Read source and configuration metadata only. Runtime data, uploads and secret
// environment files are intentionally outside this inventory.
const root = path.resolve(__dirname, '..');
const sourceRoots = ['app', 'components', 'hooks', 'lib', 'scripts', 'tests', 'types', '.github/workflows'];
const files = [];
function walk(relative) {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) walk(name);
    else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|css|ya?ml)$/.test(entry.name)) {
      const content = fs.readFileSync(path.join(root, name), 'utf8');
      files.push({ path: name, lines: content.split(/\r?\n/).length });
    }
  }
}
sourceRoots.forEach(walk);
for (const name of [
  'middleware.ts', 'next.config.js', 'vitest.config.ts', 'playwright.config.mjs',
  'setupTests.ts', 'tailwind.config.js', 'postcss.config.js', 'eslint.config.mjs',
  'tsconfig.json', 'package.json', 'package-lock.json',
]) {
  if (fs.existsSync(path.join(root, name))) {
    const content = fs.readFileSync(path.join(root, name), 'utf8');
    files.push({ path: name, lines: content.split(/\r?\n/).length });
  }
}
files.sort((a, b) => a.path.localeCompare(b.path));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const missingScriptTargets = [];
for (const [name, command] of Object.entries(pkg.scripts)) {
  for (const match of command.matchAll(/\b(scripts\/[^\s"]+\.(?:js|ts))\b/g)) {
    if (!fs.existsSync(path.join(root, match[1]))) {
      missingScriptTargets.push({ script: name, target: match[1] });
    }
  }
}
const matching = (pattern) => files.filter((file) => pattern.test(file.path)).map((file) => file.path);
const result = {
  generatedAt: new Date().toISOString(),
  scope: 'Structural inventory; file inclusion is not a claim of line-by-line review.',
  sourceFileCount: files.length,
  sourceLineCount: files.reduce((sum, file) => sum + file.lines, 0),
  apiRoutes: matching(/^app\/api\/.*\/route\.ts$/),
  cmsPages: matching(/^app\/\(admin\)\/.*\/page\.tsx$/),
  readerPages: matching(/^app\/\(reader\)\/.*\/page\.tsx$/),
  models: matching(/^lib\/models\//),
  largeFiles: files.filter((file) => file.lines >= 600).sort((a, b) => b.lines - a.lines),
  missingScriptTargets,
  files,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (missingScriptTargets.length) process.exitCode = 1;
