'use strict';

/**
 * Test-only network egress guard for Phase 3 browser QA.
 *
 * Loaded with NODE_OPTIONS only by phase310-offline-qa-launcher.cjs. It allows
 * loopback and local IPC while rejecting external Node HTTP, HTTPS, TCP, and TLS
 * connections before a socket is opened. Log messages intentionally omit URLs,
 * headers, query strings, and credentials.
 */

const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const originalFetch = globalThis.fetch;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function normalizeHost(value) {
  return String(value || 'localhost')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/^::ffff:/, '');
}

function isLoopback(host) {
  return LOOPBACK_HOSTS.has(normalizeHost(host));
}

function socketTarget(args) {
  const first = args[0];
  if (first && typeof first === 'object') {
    if (first.path && !first.host && !first.hostname) return { localIpc: true };
    return { host: first.host || first.hostname || 'localhost' };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { localIpc: true };
  return { host: typeof args[1] === 'string' ? args[1] : 'localhost' };
}

function requestTarget(input, options) {
  let candidate = input;
  if (candidate instanceof URL) return { host: candidate.hostname };
  if (typeof candidate === 'string') {
    try {
      return { host: new URL(candidate).hostname };
    } catch {
      return { host: 'localhost' };
    }
  }
  candidate = candidate && typeof candidate === 'object' ? candidate : options;
  return {
    host: candidate?.hostname || candidate?.host || 'localhost',
    localIpc: Boolean(candidate?.socketPath),
  };
}

function checkTarget(target, protocol) {
  if (target.localIpc) return;
  if (isLoopback(target.host)) {
    process.stderr.write(`OFFLINE_QA_LOOPBACK protocol=${protocol}\n`);
    return;
  }
  process.stderr.write(`BLOCKED_OFFLINE_QA_EGRESS protocol=${protocol} host=${normalizeHost(target.host)}\n`);
  const error = new Error('OFFLINE_QA_EGRESS_BLOCKED');
  error.code = 'OFFLINE_QA_EGRESS_BLOCKED';
  throw error;
}

function wrapSocket(original, protocol) {
  return function guardedSocket(...args) {
    checkTarget(socketTarget(args), protocol);
    return original.apply(this, args);
  };
}

function wrapRequest(original, protocol) {
  return function guardedRequest(input, options, callback) {
    checkTarget(requestTarget(input, options), protocol);
    return original.call(this, input, options, callback);
  };
}

net.connect = wrapSocket(net.connect, 'tcp');
net.createConnection = wrapSocket(net.createConnection, 'tcp');
tls.connect = wrapSocket(tls.connect, 'tls');
http.request = wrapRequest(http.request, 'http');
https.request = wrapRequest(https.request, 'https');
http.get = function guardedHttpGet(...args) {
  checkTarget(requestTarget(args[0], args[1]), 'http');
  return http.request(...args).end();
};
https.get = function guardedHttpsGet(...args) {
  checkTarget(requestTarget(args[0], args[1]), 'https');
  return https.request(...args).end();
};

if (typeof originalFetch === 'function') {
  globalThis.fetch = function guardedFetch(input, init) {
    const rawUrl = input instanceof URL
      ? input.toString()
      : typeof input === 'string'
        ? input
        : input?.url;
    const parsed = new URL(rawUrl, 'http://localhost');
    if (
      parsed.hostname === 'registry.npmjs.org' &&
      parsed.pathname === '/-/package/next/dist-tags'
    ) {
      const installed = require('next/package.json').version;
      process.stderr.write('OFFLINE_QA_LOCAL_STUB service=next-version-check\n');
      return Promise.resolve(
        new Response(JSON.stringify({ latest: installed, canary: installed }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    checkTarget({ host: parsed.hostname }, parsed.protocol.replace(':', '') || 'fetch');
    return originalFetch.call(this, input, init);
  };
}
