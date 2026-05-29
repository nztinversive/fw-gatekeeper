import { convexAuthNextjsMiddleware } from '@convex-dev/auth/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { hasValidAdminSession, hasValidKioskKey, isKioskRequestAllowed, unauthorizedApiResponse } from '@/lib/auth';
import { hasPortalMemberAccess } from '@/lib/portal-member';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/convex-auth', '/api/health'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function legacyAccessMiddleware(req: NextRequest, hasConvexPortalMember: boolean, hasConvexPortalAdmin: boolean) {
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

  if (pathname.startsWith('/api/')) {
    if (hasAdminSession || hasConvexPortalAdmin) {
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

  return NextResponse.next();
}

export const middleware = convexAuthNextjsMiddleware(async (req, { convexAuth }) => {
  const token = await convexAuth.getToken();
  const hasConvexPortalMember = await hasPortalMemberAccess(token);
  const hasConvexPortalAdmin = await hasPortalMemberAccess(token, ['admin']);
  return legacyAccessMiddleware(req, hasConvexPortalMember, hasConvexPortalAdmin);
}, {
  apiRoute: '/api/convex-auth',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
