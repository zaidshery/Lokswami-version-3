import { normalizeRedirectPath } from './redirect';
import { isAdminRole, type UserRole } from './roles';

const READER_PROTECTED_PREFIXES = [
  '/main/account',
  '/main/saved',
  '/main/preferences',
];
const POST_AUTH_QUERY_PARAM = 'postAuth';
const NO_ADMIN_ACCESS_ERROR = 'no_admin_access';

type RouteGuardInput = {
  pathname: string;
  searchParams: URLSearchParams;
  isAuthenticated: boolean;
  role: UserRole | undefined;
  isActive: boolean;
};

type RouteGuardDecision =
  | { action: 'next' }
  | { action: 'redirect'; location: string; status?: 301 | 302 };

export function isReaderProtectedPath(pathname: string) {
  return READER_PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isSigninNoticeRoute(pathname: string, searchParams: URLSearchParams) {
  if (pathname !== '/signin') return false;

  return (
    searchParams.get(POST_AUTH_QUERY_PARAM) === '1' ||
    searchParams.get('error') === NO_ADMIN_ACCESS_ERROR ||
    searchParams.get('error') === 'inactive'
  );
}

function formatLocation(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Resolves middleware auth guard redirects in a pure, testable way. */
export function resolveRouteGuardDecision(
  input: RouteGuardInput
): RouteGuardDecision {
  const { pathname, searchParams, isAuthenticated, role, isActive } = input;
  const hasAdminRole = isAdminRole(role);
  const hasAdminAccess = hasAdminRole && isActive;
  const originalTarget = formatLocation(pathname, searchParams);

  if (pathname === '/login') {
    const signinParams = new URLSearchParams(searchParams.toString());
    return {
      action: 'redirect',
      location: formatLocation('/signin', signinParams),
      status: 301,
    };
  }

  if (pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      const params = new URLSearchParams();
      params.set('redirect', normalizeRedirectPath(originalTarget, '/admin'));
      return {
        action: 'redirect',
        location: formatLocation('/signin', params),
      };
    }

    if (hasAdminRole && !isActive) {
      return {
        action: 'redirect',
        location: '/signin?error=inactive',
      };
    }

    if (!hasAdminAccess) {
      return {
        action: 'redirect',
        location: `/signin?error=${NO_ADMIN_ACCESS_ERROR}`,
      };
    }

    return { action: 'next' };
  }

  if (pathname === '/signin') {
    if (isAuthenticated && !isSigninNoticeRoute(pathname, searchParams)) {
      return {
        action: 'redirect',
        location: '/main',
      };
    }

    return { action: 'next' };
  }

  if (isReaderProtectedPath(pathname) && !isAuthenticated) {
    const params = new URLSearchParams();
    params.set('redirect', originalTarget);
    return {
      action: 'redirect',
      location: formatLocation('/signin', params),
    };
  }

  return { action: 'next' };
}
