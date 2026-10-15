const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const lockfilePath = path.join(projectRoot, 'package-lock.json');

function parseVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return null;

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }

  return 0;
}

function isBelow(version, minimum) {
  return compareVersions(version, minimum) === -1;
}

function packageNameFromPath(packagePath) {
  return packagePath.split('node_modules/').pop() || '';
}

const unsafeRules = {
  next: (version) => isBelow(version, '15.5.28'),
  '@tiptap/core': (version) => isBelow(version, '3.30.5'),
  'prosemirror-view': (version) => isBelow(version, '1.42.3'),
  'postcss-selector-parser': (version) => isBelow(version, '7.1.6'),
  'source-map-js': (version) => isBelow(version, '1.2.2'),
  vitest: (version) => isBelow(version, '4.1.11'),
  '@vitest/mocker': (version) => isBelow(version, '4.1.11'),
  'next-auth': (version) => {
    const betaMatch = String(version || '').match(/^5\.0\.0-beta\.(\d+)$/);
    return Boolean(betaMatch && Number.parseInt(betaMatch[1], 10) <= 31);
  },
  '@auth/core': (version) => isBelow(version, '0.41.3'),
  '@auth/mongodb-adapter': (version) => isBelow(version, '3.11.3'),
  mongoose: (version) => {
    const parsed = parseVersion(version);
    return Boolean(parsed && parsed[0] === 8 && isBelow(version, '8.24.1'));
  },
  postcss: (version) => isBelow(version, '8.5.18'),
  sharp: (version) => isBelow(version, '0.35.5'),
  picomatch: (version) => {
    const parsed = parseVersion(version);
    if (!parsed) return true;
    if (parsed[0] === 2) return isBelow(version, '2.3.2');
    if (parsed[0] === 4) return isBelow(version, '4.0.4');
    return false;
  },
  undici: (version) => {
    const parsed = parseVersion(version);
    return Boolean(parsed && parsed[0] === 7 && isBelow(version, '7.29.1'));
  },
  vite: (version) => {
    const parsed = parseVersion(version);
    return Boolean(parsed && parsed[0] === 8 && isBelow(version, '8.0.16'));
  },
  flatted: (version) => isBelow(version, '3.4.1'),
  'js-yaml': (version) => {
    const parsed = parseVersion(version);
    if (!parsed) return true;
    if (parsed[0] === 3) return true;
    if (parsed[0] === 4) return isBelow(version, '4.3.2');
    return false;
  },
  'brace-expansion': (version) => {
    const parsed = parseVersion(version);
    if (!parsed) return true;
    if (parsed[0] === 1) return isBelow(version, '1.1.21');
    if (parsed[0] === 2) return isBelow(version, '2.1.3');
    if (parsed[0] === 3) return isBelow(version, '3.0.3');
    if (parsed[0] === 4) return true;
    if (parsed[0] === 5) return isBelow(version, '5.0.12');
    return true;
  },
  nanoid: (version) => {
    const parsed = parseVersion(version);
    if (!parsed) return true;
    if (parsed[0] <= 2) return true;
    if (parsed[0] === 3) return isBelow(version, '3.3.18');
    return false;
  },
};

function findUnsafeDependencies(lockfile) {
  const violations = [];
  for (const [packagePath, metadata] of Object.entries(lockfile.packages || {})) {
    const packageName = packageNameFromPath(packagePath);
    const rule = unsafeRules[packageName];
    if (!rule || !metadata || typeof metadata.version !== 'string') continue;

    if (rule(metadata.version)) {
      violations.push(`${packagePath || packageName}@${metadata.version}`);
    }
  }
  return violations;
}

function main() {
  if (!fs.existsSync(lockfilePath)) {
    console.error('Dependency security check failed: package-lock.json is missing.');
    process.exit(1);
  }
  const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  const violations = findUnsafeDependencies(lockfile);
  if (violations.length > 0) {
    console.error('Dependency security check failed. Unsafe locked versions:');
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }
  console.log('Dependency security check passed for all tracked advisory ranges.');
}

if (require.main === module) main();
module.exports = { findUnsafeDependencies };
