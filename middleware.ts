import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { LOKSWAMI_SESSION_COOKIE } from '@/lib/auth/cookies';
import { getJwtSecretOrNull } from '@/lib/auth/jwtSecret';
import { resolveRouteGuardDecision } from '@/lib/auth/routeGuards';
import { checkRateLimit } from '@/lib/security/getRateLimiter';
import type { RateLimitCheckResult } from '@/lib/security/getRateLimiter';
import {
  getClientIp,
  getIpRateLimitKey,
  getUserRateLimitKey,
} from '@/lib/security/ipUtils';
import {
  getRouteScopedApiLimiterPrefix,
  isCacheablePublicReadApiRoute,
} from '@/lib/security/publicApiRateLimitPolicy';
import { logApiRequestFromMiddleware } from '@/lib/security/requestLogger';
import { buildArticleRedirectPath } from '@/lib/seo/articleSeo';
import { resolvePublicArticleToken } from '@/lib/server/publicArticles';

async function getSessionToken(request: NextRequest) {
  const secret = getJwtSecretOrNull();
  if (!secret) {
    return null;
  }

  // Next.js 15 fix: construct a minimal request object for getToken
  // to avoid disturbing the actual request body stream.
  const minimalReq = {
    headers: Object.fromEntries(request.headers.entries()),
    cookies: Object.fromEntries(
      request.cookies.getAll().map((c) => [c.name, c.value])
    ),
  } as unknown as Parameters<typeof getToken>[0]['req'];

  return getToken({
    req: minimalReq,
    secret,
    cookieName: LOKSWAMI_SESSION_COOKIE,
  });
}

const HEAVY_RATE_LIMIT_ROUTES = [
  { pattern: /^\/api\/v1\/public\/search(?:\/|$)/, scope: 'public-search' },
  { pattern: /^\/api\/ai\/actions(?:\/|$)/, scope: 'ai-actions' },
  { pattern: /^\/api\/ai\/search(?:\/|$)/, scope: 'ai-search' },
  { pattern: /^\/api\/ai\/suggestions(?:\/|$)/, scope: 'ai-suggestions' },
  { pattern: /^\/api\/ai\/summary(?:\/|$)/, scope: 'ai-summary' },
  { pattern: /^\/api\/admin\/epapers\/assist(?:\/|$)/, scope: 'epaper-assist' },
  {
    pattern: /^\/api\/admin\/epapers\/[^/]+\/crop-hotspot(?:\/|$)/,
    scope: 'epaper-crop-hotspot',
  },
  {
    pattern: /^\/api\/admin\/epapers\/[^/]+\/generate-page-images(?:\/|$)/,
    scope: 'epaper-generate-page-images',
  },
  { pattern: /^\/api\/admin\/epapers\/[^/]+\/ocr(?:\/|$)/, scope: 'epaper-ocr' },
  { pattern: /^\/api\/admin\/epapers\/[^/]+\/tts(?:\/|$)/, scope: 'epaper-tts' },
  {
    pattern: /^\/api\/admin\/epapers\/[^/]+\/articles\/[^/]+\/tts(?:\/|$)/,
    scope: 'epaper-article-tts',
  },
  {
    pattern: /^\/api\/admin\/articles\/[^/]+\/breaking-tts(?:\/|$)/,
    scope: 'article-breaking-tts',
  },
  {
    pattern: /^\/api\/admin\/analytics\/briefing-schedules\/[^/]+\/run(?:\/|$)/,
    scope: 'analytics-briefing-run',
  },
  {
    pattern: /^\/api\/admin\/social-posts\/generate(?:\/|$)/,
    scope: 'social-post-generate',
  },
];

type SessionToken = Awaited<ReturnType<typeof getSessionToken>>;

function getHeavyRateLimitPrefix(pathname: string) {
  const route = HEAVY_RATE_LIMIT_ROUTES.find(({ pattern }) => pattern.test(pathname));
  return route ? `heavy:${route.scope}` : null;
}

function isHeavyStrictRoute(pathname: string): boolean {
  return (
    /^\/api\/admin\/epapers\/[^/]+\/ocr(?:\/|$)/.test(pathname) ||
    /^\/api\/epaper(?:s)?\/[^/]+\/render(?:\/|$)/.test(pathname)
  );
}

function isPublicWriteRoute(pathname: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD') return false;
  return (
    pathname === '/api/comments' ||
    pathname.startsWith('/api/comments/') ||
    pathname === '/api/contact' ||
    pathname.startsWith('/api/contact/')
  );
}

function shouldRateLimitAuthWrite(pathname: string, method: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;

  return pathname === '/api/auth/register' || pathname === '/api/auth/staff-setup';
}

function createRateLimitResponse(
  error: string,
  message: string,
  rateLimitInfo: number | Partial<RateLimitCheckResult>
) {
  const retryAfter =
    typeof rateLimitInfo === 'number'
      ? rateLimitInfo
      : rateLimitInfo.retryAfter || 60;
  const limit =
    typeof rateLimitInfo === 'object' && rateLimitInfo.limit
      ? rateLimitInfo.limit
      : 100;
  const remaining =
    typeof rateLimitInfo === 'object' && rateLimitInfo.remaining !== undefined
      ? rateLimitInfo.remaining
      : 0;
  const reset =
    typeof rateLimitInfo === 'object' && rateLimitInfo.reset
      ? rateLimitInfo.reset
      : Math.ceil((Date.now() + retryAfter * 1000) / 1000);

  return new NextResponse(
    JSON.stringify({
      error,
      message,
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(Math.max(0, remaining)),
        'X-RateLimit-Reset': String(reset),
      },
    }
  );
}

function getSessionAwareRateLimitKey(
  request: NextRequest,
  session: SessionToken,
  prefix: string
) {
  const email = typeof session?.email === 'string' ? session.email.trim() : '';
  const userId = typeof session?.userId === 'string' ? session.userId.trim() : '';
  const accountKey = userId || email;
  return accountKey ? getUserRateLimitKey(accountKey, prefix) : getIpRateLimitKey(request, prefix);
}

/** Protects admin and signed-in reader routes with the active NextAuth session. */
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (/^\/main\/article\/[^/]+\/+$/u.test(pathname)) {
    const requestToken = pathname.replace(/\/+$/, '').split('/').pop() || '';
    const resolution = await resolvePublicArticleToken(requestToken);
    if (
      resolution.kind === 'current' ||
      resolution.kind === 'previous' ||
      resolution.kind === 'legacyId'
    ) {
      const targetPath = buildArticleRedirectPath(
        resolution.article,
        request.nextUrl.searchParams
      );
      return NextResponse.redirect(new URL(targetPath, request.url), 308);
    }
    return NextResponse.next();
  }
  if (/^\/main\/article\/[^/]+$/u.test(pathname)) {
    return NextResponse.next();
  }
  const isApiRequest = pathname.startsWith('/api/');
  const contentType = request.headers.get('content-type') || '';
  
  // CRITICAL: Skip middleware processing for large file upload routes IMMEDIATELY.
  // Any property access or function call on 'request' before this point (like getSessionToken)
  // may disturb the request body stream, causing failures in Next.js 15.
  const isLargeUploadRoute =
    pathname === '/api/admin/epapers/upload' ||
    pathname === '/api/admin/upload' ||
    (pathname.includes('/api/admin/epapers/') && pathname.includes('/pages')) ||
    (isApiRequest && contentType.includes('multipart/form-data'));

  if (isLargeUploadRoute) {
    return NextResponse.next();
  }

  const startedAt = Date.now();

  try {
    const isApiRequest = pathname.startsWith('/api/');
    
    let session: Awaited<ReturnType<typeof getSessionToken>> = null;

    function scheduleRequestLog(response: NextResponse) {
      if (isApiRequest) {
        event.waitUntil(
          logApiRequestFromMiddleware({
            request,
            responseStatus: response.status,
            startedAt,
            session,
          })
        );
      }

      return response;
    }

    const isAdminArea = pathname.startsWith('/admin') || pathname.startsWith('/api/admin/');
    const isAuthApiRoute = pathname.startsWith('/api/auth/');
    const heavyRateLimitPrefix = getHeavyRateLimitPrefix(pathname);
    const isHeavyRoute = Boolean(heavyRateLimitPrefix);
    const isPublicReadRoute = isCacheablePublicReadApiRoute(request.method, pathname);
    const clientIp = getClientIp(request);

    // Limit account-creation/setup writes only. Auth.js session, providers and
    // CSRF requests are part of one normal sign-in flow and must not consume a
    // shared attempt bucket. Credential failures keep their stricter per-login
    // limiter inside lib/auth.ts.
    if (shouldRateLimitAuthWrite(pathname, request.method)) {
      const authResult = await checkRateLimit({
        scope: 'auth',
        identifier: clientIp,
      });

      if (!authResult.allowed) {
        const retryAfter = authResult.retryAfter || 60;
        return scheduleRequestLog(
          createRateLimitResponse(
            'Too many authentication attempts',
            `Please try again in ${retryAfter} seconds`,
            authResult
          )
        );
      }
    }

    if (isApiRequest && !isAdminArea && !isAuthApiRoute) {
      if (heavyRateLimitPrefix) {
        const isStrict = isHeavyStrictRoute(pathname);
        const heavyScope = isStrict ? 'heavy_strict' : 'heavy';
        const heavyKey = getIpRateLimitKey(request, heavyRateLimitPrefix);
        const heavyResult = await checkRateLimit({
          scope: heavyScope,
          identifier: heavyKey,
        });

        if (!heavyResult.allowed) {
          const retryAfter = heavyResult.retryAfter || 600;
          return scheduleRequestLog(
            createRateLimitResponse(
              'Too many expensive requests',
              `Please try again in ${retryAfter} seconds`,
              heavyResult
            )
          );
        }
      }

      // Public writes (e.g. /api/comments, /api/contact): 20 req / 60s
      if (isPublicWriteRoute(pathname, request.method)) {
        const writeResult = await checkRateLimit({
          scope: 'public_write',
          identifier: clientIp,
        });

        if (!writeResult.allowed) {
          const retryAfter = writeResult.retryAfter || 60;
          return scheduleRequestLog(
            createRateLimitResponse(
              'Too many submission requests',
              `Please try again in ${retryAfter} seconds`,
              writeResult
            )
          );
        }
      }

      // Reader pages fan out across several cacheable GET APIs at once. Keep
      // the app limiter focused on writes and non-cacheable public APIs; use
      // CDN/WAF rules for bulk public read traffic.
      if (!isPublicReadRoute && !isHeavyRoute && !isPublicWriteRoute(pathname, request.method)) {
        const apiKey = getIpRateLimitKey(
          request,
          getRouteScopedApiLimiterPrefix(pathname)
        );
        const apiResult = await checkRateLimit({
          scope: 'api',
          identifier: apiKey,
        });

        if (!apiResult.allowed) {
          const retryAfter = apiResult.retryAfter || 300;
          return scheduleRequestLog(
            createRateLimitResponse(
              'Too many API requests',
              `Please try again in ${retryAfter} seconds`,
              apiResult
            )
          );
        }
      }
    }

    session = await getSessionToken(request);
    const email = typeof session?.email === 'string' ? session.email.trim() : '';
    const userId = typeof session?.userId === 'string' ? session.userId.trim() : '';

    if (heavyRateLimitPrefix && isAdminArea) {
      const isStrict = isHeavyStrictRoute(pathname);
      const heavyScope = isStrict ? 'heavy_strict' : 'heavy';
      const heavyKey = getSessionAwareRateLimitKey(request, session, heavyRateLimitPrefix);
      const heavyResult = await checkRateLimit({
        scope: heavyScope,
        identifier: heavyKey,
      });

      if (!heavyResult.allowed) {
        const retryAfter = heavyResult.retryAfter || 600;
        return scheduleRequestLog(
          createRateLimitResponse(
            'Too many expensive requests',
            `Please try again in ${retryAfter} seconds`,
            heavyResult
          )
        );
      }
    }

    if (isAdminArea) {
      const adminKey = getSessionAwareRateLimitKey(request, session, 'admin');
      const adminResult = await checkRateLimit({
        scope: 'admin',
        identifier: adminKey,
      });

      if (!adminResult.allowed) {
        const retryAfter = adminResult.retryAfter || 600;
        return scheduleRequestLog(
          createRateLimitResponse(
            'Too many admin requests',
            `Please try again in ${retryAfter} seconds`,
            adminResult
          )
        );
      }
    }

    const decision = resolveRouteGuardDecision({
      pathname,
      searchParams: request.nextUrl.searchParams,
      isAuthenticated: Boolean(email || userId),
      role: session?.role,
      isActive: session?.isActive !== false,
    });

    if (decision.action === 'redirect') {
      return scheduleRequestLog(NextResponse.redirect(
        new URL(decision.location, request.url),
        decision.status ?? 302
      ));
    }

    return scheduleRequestLog(NextResponse.next());
  } catch (error) {
    console.error('Middleware auth check failed:', error);
    return NextResponse.next();
  }
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/:path*',
    '/login',
    '/signin',
    '/main/account/:path*',
    '/main/saved/:path*',
    '/main/preferences/:path*',
    '/main/article/:path*',
  ],
};
