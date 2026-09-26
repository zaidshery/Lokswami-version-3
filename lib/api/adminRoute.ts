import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { AdminSessionIdentity } from '@/lib/auth/admin';
import type { AdminRole } from '@/lib/auth/roles';
import {
  getAdminMutationContext,
  runWithAdminMutationContext,
} from '@/lib/security/adminMutationContext';
import { logAdminMutationRequest } from '@/lib/security/auditLogger';

type AdminMutationAuditInput = Parameters<typeof logAdminMutationRequest>[0];

async function logAdminMutationSafely(input: AdminMutationAuditInput) {
  try {
    await logAdminMutationRequest(input);
  } catch {
    console.error('Admin mutation audit logging failed.');
  }
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'CSRF_BLOCKED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'LAST_ACTIVE_SUPER_ADMIN'
  | 'SELF_DEMOTION_BLOCKED'
  | 'RATE_LIMITED'
  | 'CONFLICT';

export type AdminApiContext = {
  admin: AdminSessionIdentity;
  requestId: string;
  startedAt: number;
};

type AdminApiOptions = {
  authorize?: (role: AdminRole, admin: AdminSessionIdentity) => boolean;
  mutation?: boolean;
};

type AdminMutationOptions = {
  machineRequest?: (request: NextRequest) => boolean;
  machineActor?: {
    id?: string;
    email?: string;
    role?: string;
  };
};

type AdminApiHandler<TContext> = (
  request: NextRequest,
  routeContext: TContext,
  context: AdminApiContext
) => Promise<Response> | Response;

const WRITE_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

function getRequestUrl(request: NextRequest) {
  try {
    return new URL(request.url);
  } catch {
    return new URL('http://localhost');
  }
}

function getRequestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();
  if (!host) return '';

  const forwardedProto = request.headers.get('x-forwarded-proto')?.trim();
  const requestUrl = getRequestUrl(request);
  const protocol = forwardedProto || requestUrl.protocol.replace(':', '') || 'http';
  return `${protocol}://${host}`;
}

function getPayloadForAudit(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return Promise.resolve(undefined);
  }

  return request
    .clone()
    .json()
    .then((payload) =>
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : undefined
    )
    .catch(() => undefined);
}

export function isSameOriginWrite(request: NextRequest) {
  const method = request.method.toUpperCase();
  if (!WRITE_METHODS.has(method)) return true;

  const secFetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (secFetchSite === 'cross-site') return false;

  const origin = request.headers.get('origin')?.trim();
  if (!origin) return true;

  const expectedOrigin = getRequestOrigin(request);
  if (!expectedOrigin) return true;

  try {
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

export function assertSameOriginWrite(request: NextRequest, requestId?: string) {
  if (isSameOriginWrite(request)) return null;

  return apiError(
    'Cross-site admin writes are not allowed',
    403,
    'CSRF_BLOCKED',
    requestId
  );
}

export function apiError(
  error: string,
  status: number,
  code: ApiErrorCode,
  requestId?: string,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    {
      success: false,
      error,
      code,
      ...(requestId ? { requestId } : {}),
    },
    { status, headers }
  );
}

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    init
  );
}

function toNextRequest(request: Request) {
  if (request instanceof NextRequest) return request;

  try {
    return new NextRequest(request);
  } catch {
    const url =
      typeof request?.url === 'string' && request.url
        ? request.url
        : 'http://localhost';
    const method =
      typeof request?.method === 'string' && request.method
        ? request.method
        : 'POST';
    const headers =
      request?.headers instanceof Headers ? request.headers : new Headers();
    return new NextRequest(url, { method, headers });
  }
}

/**
 * Adds same-origin enforcement and centralized mutation auditing around an
 * existing route without replacing its established 401/403/RBAC logic or
 * performing a second session/database lookup.
 *
 * The canonical session helpers register the authenticated actor in a
 * request-local context. For a cross-site mutation they withhold that session,
 * ensuring the route rejects before any side effect; this wrapper then returns
 * the stable CSRF_BLOCKED response and records the rejected attempt.
 */
export function withAdminMutation<
  TRequest extends Request,
  TArgs extends unknown[],
>(
  handler: (request: TRequest, ...args: TArgs) => Promise<Response> | Response,
  options: AdminMutationOptions = {}
) {
  return async function hardenedAdminMutation(request: TRequest, ...args: TArgs) {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const nextRequest = toNextRequest(request);
    const isMachineRequest = options.machineRequest?.(nextRequest) === true;
    const requestDataPromise = getPayloadForAudit(nextRequest);

    return runWithAdminMutationContext(
      {
        actor: isMachineRequest
          ? {
              id: options.machineActor?.id || 'system',
              email: options.machineActor?.email || 'system',
              role: options.machineActor?.role || 'machine_secret',
            }
          : null,
        csrfBlocked: !isMachineRequest && !isSameOriginWrite(nextRequest),
      },
      async () => {
        let response: Response | undefined;
        let handlerFailed = false;

        try {
          response = await handler(request, ...args);
          const context = getAdminMutationContext();
          if (context?.actor && context.csrfBlocked) {
            response = assertSameOriginWrite(nextRequest, requestId) || response;
          }
          response.headers.set('x-request-id', requestId);
          return response;
        } catch (error) {
          handlerFailed = true;
          throw error;
        } finally {
          const actor = getAdminMutationContext()?.actor;
          if (actor) {
            const statusCode = response?.status || 500;
            await logAdminMutationSafely({
              request: nextRequest,
              userId: actor.id,
              userEmail: actor.email,
              userRole: actor.role,
              statusCode,
              duration: Date.now() - startedAt,
              requestData: await requestDataPromise,
              responseStatus:
                statusCode >= 500
                  ? 'error'
                  : statusCode >= 400
                    ? 'rejected'
                    : 'success',
              errorMessage: handlerFailed
                ? 'Admin mutation handler failed'
                : contextErrorMessage(response),
            });
          }
        }
      }
    );
  };
}

function contextErrorMessage(response: Response | undefined) {
  const context = getAdminMutationContext();
  if (context?.actor && context.csrfBlocked) {
    return 'Cross-site admin mutation rejected';
  }
  return response && response.status >= 500 ? 'Admin mutation failed' : undefined;
}

export function withAdminApi<TContext = Record<string, never>>(
  handler: AdminApiHandler<TContext>,
  options: AdminApiOptions = {}
) {
  return async function adminApiRoute(request: NextRequest, routeContext?: TContext) {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const requestDataPromise = options.mutation ? getPayloadForAudit(request) : Promise.resolve(undefined);
    let admin: AdminSessionIdentity | null = null;
    let response: Response | undefined;
    let errorMessage: string | undefined;

    try {
      const { getAdminSession } = await import('@/lib/auth/admin');
      admin = await getAdminSession();
      if (!admin) {
        response = apiError('Unauthorized', 401, 'UNAUTHORIZED', requestId);
        return response;
      }

      if (options.authorize && !options.authorize(admin.role, admin)) {
        response = apiError('Forbidden', 403, 'FORBIDDEN', requestId);
        return response;
      }

      const csrfError = options.mutation
        ? assertSameOriginWrite(request, requestId)
        : null;
      if (csrfError) {
        response = csrfError;
        return response;
      }

      response = await handler(request, routeContext ?? ({} as TContext), {
        admin,
        requestId,
        startedAt,
      });
      return response;
    } catch (error) {
      errorMessage = 'Unexpected admin API failure';
      console.error(
        'Admin API route failed:',
        error instanceof Error ? error.name : 'Unknown error'
      );
      response = apiError('Internal server error', 500, 'INTERNAL_ERROR', requestId);
      return response;
    } finally {
      if (response) {
        response.headers.set('x-request-id', requestId);
        response.headers.set('server-timing', `app;dur=${Date.now() - startedAt}`);
      }

      if (options.mutation && admin) {
        const statusCode = response?.status || 500;
        await logAdminMutationSafely({
          request,
          userId: admin.id,
          userEmail: admin.email,
          userRole: admin.role,
          statusCode,
          duration: Date.now() - startedAt,
          requestData: await requestDataPromise,
          responseStatus:
            statusCode >= 500
              ? 'error'
              : statusCode >= 400
                ? 'rejected'
                : 'success',
          errorMessage,
        });
      }
    }
  };
}
