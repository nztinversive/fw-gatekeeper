import { convexAuthNextjsMiddleware } from '@convex-dev/auth/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { hasValidAdminSession, hasValidKioskKey, isKioskRequestAllowed, unauthorizedApiResponse } from '@/lib/auth';
import { hasPortalMemberAccess, type PortalMemberRole } from '@/lib/portal-member';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/convex-auth', '/api/health'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function getApiAllowedRoles(req: NextRequest): PortalMemberRole[] {
  const { pathname, searchParams } = req.nextUrl;
  const method = req.method.toUpperCase();

  if (pathname === '/api/enroll') {
    return ['admin', 'enrollment'];
  }

  if (pathname === '/api/workers' && method === 'GET' && searchParams.has('id')) {
    return ['admin', 'enrollment'];
  }

  return ['admin'];
}

function isAdminOnlyPage(pathname: string): boolean {
  return pathname === '/kiosks';
}

async function legacyAccessMiddleware(
  req: NextRequest,
  hasConvexPortalMember: boolean,
  hasConvexPortalApiAccess: boolean,
  hasConvexPortalAdmin: boolean,
) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  const hasAdminSession = await hasValidAdminSession(req);
  const hasHumanSession = hasAdminSession || hasConvexPortalMember;
  const hasHumanAdminSession = hasAdminSession || hasConvexPortalAdmin;

  if (pathname.startsWith('/api/')) {
    if (hasAdminSession || hasConvexPortalApiAccess) {
      return NextResponse.next();
    }

    if (isKioskRequestAllowed(req) && hasValidKioskKey(req)) {
      return NextResponse.next();
    }

    return unauthorizedApiResponse();
  }

  if (!hasHumanSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isAdminOnlyPage(pathname) && !hasHumanAdminSession) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const middleware = convexAuthNextjsMiddleware(async (req, { convexAuth }) => {
  const token = await convexAuth.getToken();
  const apiAllowedRoles = getApiAllowedRoles(req);
  const hasConvexPortalMember = await hasPortalMemberAccess(token);
  const hasConvexPortalAdmin = await hasPortalMemberAccess(token, ['admin']);
  const hasConvexPortalApiAccess = apiAllowedRoles.join(',') === 'admin'
    ? hasConvexPortalAdmin
    : await hasPortalMemberAccess(token, apiAllowedRoles);
  return legacyAccessMiddleware(req, hasConvexPortalMember, hasConvexPortalApiAccess, hasConvexPortalAdmin);
}, {
  apiRoute: '/api/convex-auth',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
