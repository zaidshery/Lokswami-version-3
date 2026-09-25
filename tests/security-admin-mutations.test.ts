import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAdminSessionMock,
  getAdminSessionFromReqMock,
  logAdminMutationRequestMock,
} = vi.hoisted(() => ({
  getAdminSessionMock: vi.fn(),
  getAdminSessionFromReqMock: vi.fn(),
  logAdminMutationRequestMock: vi.fn(),
}));

vi.mock('@/lib/auth/admin', () => ({
  getAdminSession: getAdminSessionMock,
  getAdminSessionFromReq: getAdminSessionFromReqMock,
}));

vi.mock('@/lib/security/auditLogger', () => ({
  logAdminMutationRequest: logAdminMutationRequestMock,
}));

import { withAdminMutation } from '@/lib/api/adminRoute';
import { registerAdminMutationActor } from '@/lib/security/adminMutationContext';

const admin = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin' as const,
};

function mutationRequest(
  headers: Record<string, string> = {},
  url = 'https://cms.example.test/api/admin/example'
) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'cms.example.test',
      'x-forwarded-proto': 'https',
      ...headers,
    },
    body: JSON.stringify({ title: 'Safe title', password: 'never-store-this' }),
  });
}

describe('admin mutation same-origin and audit wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminSessionMock.mockResolvedValue(admin);
    getAdminSessionFromReqMock.mockResolvedValue(admin);
    logAdminMutationRequestMock.mockResolvedValue(undefined);
  });

  it('blocks authenticated cross-site requests before the handler and audits the rejection', async () => {
    const sideEffect = vi.fn();
    const handler = vi.fn(async () => {
      if (!registerAdminMutationActor(admin)) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
      sideEffect();
      return NextResponse.json({ success: true });
    });
    const route = withAdminMutation(handler);

    const response = await route(
      mutationRequest({ 'sec-fetch-site': 'cross-site' })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.code).toBe('CSRF_BLOCKED');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(sideEffect).not.toHaveBeenCalled();
    expect(logAdminMutationRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: admin.id,
        userRole: admin.role,
        statusCode: 403,
        responseStatus: 'rejected',
      })
    );
  });

  it('preserves the route-owned 401 response for an unauthenticated request', async () => {
    getAdminSessionFromReqMock.mockResolvedValue(null);
    const handler = vi.fn(async () =>
      NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    );
    const route = withAdminMutation(handler);

    const response = await route(
      mutationRequest({ 'sec-fetch-site': 'cross-site' })
    );

    expect(response.status).toBe(401);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(logAdminMutationRequestMock).not.toHaveBeenCalled();
  });

  it('allows a same-origin browser mutation and records its result', async () => {
    const handler = vi.fn(async () => {
      registerAdminMutationActor(admin);
      return NextResponse.json({ success: true }, { status: 201 });
    });
    const route = withAdminMutation(handler);

    const response = await route(
      mutationRequest({ origin: 'https://cms.example.test' })
    );

    expect(response.status).toBe(201);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(logAdminMutationRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 201,
        responseStatus: 'success',
        requestData: expect.objectContaining({ title: 'Safe title' }),
      })
    );
  });

  it('rejects a mismatched Origin even without a cross-site fetch hint', async () => {
    const sideEffect = vi.fn();
    const handler = vi.fn(async () => {
      if (!registerAdminMutationActor(admin)) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
      sideEffect();
      return NextResponse.json({ success: true });
    });
    const route = withAdminMutation(handler);

    const response = await route(
      mutationRequest({ origin: 'https://attacker.example.test' })
    );

    expect(response.status).toBe(403);
    expect(sideEffect).not.toHaveBeenCalled();
  });

  it('audits the established actor while preserving a route-owned RBAC rejection', async () => {
    const handler = vi.fn(async () => {
      registerAdminMutationActor(admin);
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    });
    const route = withAdminMutation(handler);

    const response = await route(
      mutationRequest({ origin: 'https://cms.example.test' })
    );

    expect(response.status).toBe(403);
    expect(logAdminMutationRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: admin.id,
        statusCode: 403,
        responseStatus: 'rejected',
      })
    );
  });

  it('preserves a validated machine-secret flow without applying browser CSRF rules', async () => {
    const handler = vi.fn(async () => NextResponse.json({ success: true }));
    const route = withAdminMutation(handler, {
      machineRequest: (request) =>
        request.headers.get('x-cron-secret') === 'valid-test-secret',
    });

    const response = await route(
      mutationRequest({
        'sec-fetch-site': 'cross-site',
        'x-cron-secret': 'valid-test-secret',
      })
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(logAdminMutationRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'system',
        userRole: 'machine_secret',
      })
    );
  });

  it('does not let an invalid machine secret bypass browser same-origin enforcement', async () => {
    const sideEffect = vi.fn();
    const handler = vi.fn(async () => {
      if (!registerAdminMutationActor(admin)) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
      sideEffect();
      return NextResponse.json({ success: true });
    });
    const route = withAdminMutation(handler, {
      machineRequest: (request) =>
        request.headers.get('x-cron-secret') === 'valid-test-secret',
    });

    const response = await route(
      mutationRequest({
        'sec-fetch-site': 'cross-site',
        'x-cron-secret': 'invalid-test-secret',
      })
    );

    expect(response.status).toBe(403);
    expect(sideEffect).not.toHaveBeenCalled();
    expect(logAdminMutationRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: admin.id,
        statusCode: 403,
        responseStatus: 'rejected',
      })
    );
  });

  it('does not fail a successful mutation when audit persistence throws', async () => {
    logAdminMutationRequestMock.mockRejectedValueOnce(new Error('audit unavailable'));
    const handler = vi.fn(async () => {
      registerAdminMutationActor(admin);
      return NextResponse.json({ success: true }, { status: 201 });
    });
    const route = withAdminMutation(handler);

    const response = await route(
      mutationRequest({ origin: 'https://cms.example.test' })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true });
  });
});

function findRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findRouteFiles(fullPath);
    return entry.name === 'route.ts' ? [fullPath] : [];
  });
}

describe('app/api/admin mutation inventory', () => {
  it('keeps every unsafe-method handler classified and hardened', () => {
    const adminApiRoot = path.resolve('app/api/admin');
    const routeFiles = findRouteFiles(adminApiRoot);
    const unsafeExportPattern =
      /^export\s+(?:async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/gm;
    const stubRoutes = new Set([
      path.normalize('tts/prewarm/route.ts'),
      path.normalize('tts/retry/route.ts'),
    ]);
    const machineSecretRoutes = new Set([
      path.normalize('epapers/jobs/run-due/route.ts'),
      path.normalize('workflow-notifications/jobs/run-due/route.ts'),
    ]);
    const dualModeRoutes = new Set([
      path.normalize('analytics/briefing-schedules/run-due/route.ts'),
      path.normalize('tts/jobs/run-due/route.ts'),
    ]);

    let handlerCount = 0;
    let browserMutationCount = 0;
    let machineSecretCount = 0;
    let dualModeCount = 0;
    let stubCount = 0;
    let wrappedMutationCount = 0;

    for (const file of routeFiles) {
      const relative = path.normalize(path.relative(adminApiRoot, file));
      const source = readFileSync(file, 'utf8');
      const methods = [...source.matchAll(unsafeExportPattern)];
      if (methods.length === 0) continue;

      handlerCount += methods.length;
      if (stubRoutes.has(relative)) {
        stubCount += methods.length;
        expect(source).toMatch(/removed|no longer supported/i);
        continue;
      }

      if (dualModeRoutes.has(relative)) {
        expect(source).not.toMatch(/^export\s+(?:async\s+function|const)\s+GET\b/m);
      }

      if (machineSecretRoutes.has(relative)) {
        machineSecretCount += methods.length;
        expect(source).toContain('machineRequest:');
      } else if (dualModeRoutes.has(relative)) {
        dualModeCount += methods.length;
        expect(source).toContain('machineRequest:');
      } else {
        browserMutationCount += methods.length;
      }

      const mutationWrappers = source.match(/withAdminMutation\(/g)?.length ?? 0;
      const protectedAdminApiExports = [
        ...source.matchAll(
          /^export const (POST|PUT|PATCH|DELETE) = withAdminApi/gm
        ),
      ].length;
      wrappedMutationCount += mutationWrappers + protectedAdminApiExports;

      if (protectedAdminApiExports > 0) {
        expect(source.match(/mutation:\s*true/g)?.length ?? 0).toBeGreaterThanOrEqual(
          protectedAdminApiExports
        );
      }
    }

    expect({
      handlerCount,
      browserMutationCount,
      machineSecretCount,
      dualModeCount,
      stubCount,
      wrappedMutationCount,
    }).toEqual({
      handlerCount: 95,
      browserMutationCount: 89,
      machineSecretCount: 2,
      dualModeCount: 2,
      stubCount: 2,
      wrappedMutationCount: 93,
    });
  });
});
