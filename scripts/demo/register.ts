/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * Script Runtime Bootstrap & Server-Only Shim
 * 
 * Allows server-only domain repositories (Content, Video, E-Paper)
 * to be safely loaded in standalone Node / ts-node scripts.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string, ...rest: unknown[]) {
  if (id === 'server-only') {
    return {};
  }
  return originalRequire.apply(this, [id, ...rest]);
};
