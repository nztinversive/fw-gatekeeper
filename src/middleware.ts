import { NextRequest, NextResponse } from 'next/server';
import { hasValidAdminSession, hasValidKioskKey, isKioskRequestAllowed, unauthorizedApiResponse } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/', '/api/health'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  const hasAdminSession = await hasValidAdminSession(req);

  if (pathname.startsWith('/api/')) {
    if (hasAdminSession) {
      return NextResponse.next();
    }

    if (isKioskRequestAllowed(req) && hasValidKioskKey(req)) {
      return NextResponse.next();
    }

    return unauthorizedApiResponse();
  }

  if (!hasAdminSession) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
