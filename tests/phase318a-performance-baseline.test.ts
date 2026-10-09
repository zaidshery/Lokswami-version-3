import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const script = path.join(process.cwd(), 'scripts/phase3/phase318a-performance-baseline.cjs');
let server: Server;
let baseUrl: string;
let publicationRefetch = false;

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

beforeAll(async () => {
  server = createServer((request, response) => {
    const route = request.url?.split('?')[0] || '/';
    if (route === '/missing') {
      response.writeHead(404, { 'Content-Type': 'text/html' }).end('Missing');
      return;
    }
    if (route === '/api/v1/public/epapers/latest') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"items":[]}');
      return;
    }
    const refetch = route === '/main/epaper' && publicationRefetch;
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(
      `<html><body>OK${refetch ? '<script>fetch("/api/v1/public/epapers/latest")</script>' : ''}</body></html>`
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

  it('keeps the publication assertion failure exit status', async () => {
    publicationRefetch = true;
    try {
      const result = await runBaseline('/main/epaper', { PERF_SETTLE_MS: '750' }, true);
      expect(result.code).toBe(1);
      expect(result.stdout).toMatch(/"publicationFeedRequests":1/);
      expect(result.stderr).toContain('Initial publication feed was refetched');
    } finally {
      publicationRefetch = false;
    }
  }, 30_000);

  it('allows an unrequested data-dependent detail route to be unavailable', async () => {
    const result = await runBaseline(undefined, { PERF_ARTICLE_PATH: '/missing' });
    expect(result.code).toBe(0);
    expect(result.stdout.match(/"status":404/g)).toHaveLength(2);
  }, 60_000);
});
