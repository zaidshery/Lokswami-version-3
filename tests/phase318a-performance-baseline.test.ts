import { spawn } from 'node:child_process';
import { createServer, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const script = path.join(process.cwd(), 'scripts/phase3/phase318a-performance-baseline.cjs');
let server: Server;
let baseUrl: string;
let publicationRefetch = false;
let publicationPageError = false;
let unrelatedPublicationPathRequest = false;
type PublicationResponseMode = 'complete' | 'failed' | 'pending' | 'redirect';
let publicationResponseMode: PublicationResponseMode = 'complete';
let pendingPublicationResponse: ServerResponse | null = null;

function runBaseline(routes?: string, extraEnv: Record<string, string> = {}, assertPublication = false) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...(routes ? [routes] : []), ...(assertPublication ? ['--assert-publication-initial'] : [])], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PERF_BASE_URL: baseUrl,
        PERF_SETTLE_MS: '0',
        PERF_ARTICLE_PATH: '',
        PERF_SHORTS_PATH: '',
        ...extraEnv,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function runPublicationBaseline(mode: PublicationResponseMode = 'complete') {
  publicationRefetch = true;
  publicationResponseMode = mode;
  try {
    return await runBaseline('/main/epaper', { PERF_SETTLE_MS: '500' }, true);
  } finally {
    publicationRefetch = false;
    publicationResponseMode = 'complete';
    pendingPublicationResponse?.destroy();
    pendingPublicationResponse = null;
  }
}

function measurements(stdout: string): Array<{
  status: number;
  errors: string[];
  bytes: number;
  requests: number;
  publicationFeedRequests: number;
}> {
  return stdout.trim().split(/\r?\n/).map((line) => JSON.parse(line));
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const route = request.url?.split('?')[0] || '/';
    if (route === '/missing') {
      response.writeHead(404, { 'Content-Type': 'text/html' }).end('Missing');
      return;
    }
    if (route === '/pageerror') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end(
        '<html><body><script>throw new Error("phase318a-test-pageerror")</script></body></html>'
      );
      return;
    }
    if (route === '/api/v1/public/epapers/latest') {
      if (publicationResponseMode === 'failed') {
        response.destroy();
        return;
      }
      if (publicationResponseMode === 'pending') {
        pendingPublicationResponse = response;
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.flushHeaders();
        return;
      }
      if (publicationResponseMode === 'redirect' && !request.url?.includes('redirected=1')) {
        response.writeHead(302, { Location: '/api/v1/public/epapers/latest?redirected=1' }).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"items":[]}');
      return;
    }
    const refetch = route === '/main/epaper' && publicationRefetch;
    const pageError = route === '/main/epaper' && publicationPageError;
    const unrelated = route === '/main/epaper' && unrelatedPublicationPathRequest;
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(
      `<html><body>OK${refetch ? '<script>fetch("/api/v1/public/epapers/latest")</script>' : ''}${pageError ? '<script>throw new Error("phase318a-test-pageerror")</script>' : ''}${unrelated ? '<script>fetch("/unrelated?next=/api/v1/public/epapers/latest")</script>' : ''}</body></html>`
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local HTTP server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('Phase 3.18A baseline process status', () => {
  it('exits zero after a valid explicit route measurement', async () => {
    const result = await runBaseline('/main');
    expect(result.code).toBe(0);
    expect(result.stdout.match(/"status":200/g)).toHaveLength(2);
    expect(measurements(result.stdout).map(({ errors }) => errors)).toEqual([[], []]);
  }, 30_000);

  it('fails an HTTP 200 route with an unhandled runtime page error', async () => {
    const result = await runBaseline('/pageerror');
    const samples = measurements(result.stdout);
    expect(samples.map(({ status }) => status)).toEqual([200, 200]);
    expect(samples.every(({ errors }) => errors.some((error) => error.includes('phase318a-test-pageerror')))).toBe(true);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('/pageerror (mobile): runtime page error');
    expect(result.stderr).toContain('/pageerror (desktop): runtime page error');
  }, 30_000);

  it('fails the publication assertion when an HTTP 200 page throws before a feed request', async () => {
    publicationPageError = true;
    try {
      const result = await runBaseline('/main/epaper', {}, true);
      const samples = measurements(result.stdout);
      expect(samples.map(({ status }) => status)).toEqual([200, 200]);
      expect(samples.map(({ publicationFeedRequests }) => publicationFeedRequests)).toEqual([0, 0]);
      expect(samples.every(({ errors }) => errors.some((error) => error.includes('phase318a-test-pageerror')))).toBe(true);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('/main/epaper (mobile): runtime page error');
    } finally {
      publicationPageError = false;
    }
  }, 30_000);

  it('exits non-zero after navigation to an unreachable server', async () => {
    const result = await runBaseline('/main', { PERF_BASE_URL: 'http://127.0.0.1:1' });
    expect(result.code).toBe(1);
    expect(result.stdout.match(/"error":/g)).toHaveLength(2);
  }, 30_000);

  it('exits non-zero for an explicitly requested HTTP failure', async () => {
    const result = await runBaseline('/missing');
    expect(result.code).toBe(1);
    expect(result.stdout.match(/"status":404/g)).toHaveLength(2);
  }, 30_000);

  it('counts one completed publication request without counting it again at loadingFinished', async () => {
    const result = await runPublicationBaseline();
    expect(result.code).toBe(1);
    expect(measurements(result.stdout).map(({ publicationFeedRequests }) => publicationFeedRequests)).toEqual([1, 1]);
    expect(result.stderr).toContain('Initial publication feed was refetched');
  }, 30_000);

  it('fails the publication assertion for a request that fails before loadingFinished', async () => {
    const result = await runPublicationBaseline('failed');
    expect(result.code).toBe(1);
    expect(measurements(result.stdout).map(({ publicationFeedRequests }) => publicationFeedRequests)).toEqual([1, 1]);
    expect(result.stderr).toContain('Initial publication feed was refetched');
  }, 30_000);

  it('fails the publication assertion for a request still pending beyond the settle window', async () => {
    const result = await runPublicationBaseline('pending');
    expect(result.code).toBe(1);
    expect(measurements(result.stdout).map(({ publicationFeedRequests }) => publicationFeedRequests)).toEqual([1, 1]);
    expect(result.stderr).toContain('Initial publication feed was refetched');
  }, 30_000);

  it('allows a publication page with no matching archive request', async () => {
    unrelatedPublicationPathRequest = true;
    try {
      const result = await runBaseline('/main/epaper', { PERF_SETTLE_MS: '500' }, true);
      expect(result.code).toBe(0);
      expect(measurements(result.stdout).map(({ publicationFeedRequests }) => publicationFeedRequests)).toEqual([0, 0]);
    } finally {
      unrelatedPublicationPathRequest = false;
    }
  }, 30_000);

  it('keeps completed-transfer bytes separate from failed and pending requests', async () => {
    const completed = measurements((await runPublicationBaseline('complete')).stdout);
    const failed = measurements((await runPublicationBaseline('failed')).stdout);
    const pending = measurements((await runPublicationBaseline('pending')).stdout);
    for (const index of [0, 1]) {
      expect(completed[index].publicationFeedRequests).toBe(1);
      expect(failed[index].publicationFeedRequests).toBe(1);
      expect(pending[index].publicationFeedRequests).toBe(1);
      expect(completed[index].requests).toBeGreaterThan(failed[index].requests);
      expect(completed[index].requests).toBeGreaterThan(pending[index].requests);
      expect(completed[index].bytes).toBeGreaterThan(failed[index].bytes);
      expect(completed[index].bytes).toBeGreaterThan(pending[index].bytes);
    }
  }, 60_000);

  it('deduplicates redirect events for one publication request ID', async () => {
    const result = await runPublicationBaseline('redirect');
    expect(result.code).toBe(1);
    expect(measurements(result.stdout).map(({ publicationFeedRequests }) => publicationFeedRequests)).toEqual([1, 1]);
  }, 30_000);

  it('allows an unrequested data-dependent detail route to be unavailable', async () => {
    const result = await runBaseline(undefined, { PERF_ARTICLE_PATH: '/missing' });
    expect(result.code).toBe(0);
    expect(result.stdout.match(/"status":404/g)).toHaveLength(2);
  }, 60_000);

  it('fails an available default detail route that throws a runtime page error', async () => {
    const result = await runBaseline(undefined, { PERF_ARTICLE_PATH: '/pageerror' });
    const pageErrorSamples = measurements(result.stdout).filter(({ errors }) => errors.length > 0);
    expect(pageErrorSamples.map(({ status }) => status)).toEqual([200, 200]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('/pageerror (mobile): runtime page error');
  }, 60_000);
});
