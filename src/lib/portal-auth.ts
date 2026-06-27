import 'server-only';

import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { NextRequest } from 'next/server';
import { hasValidAdminSession } from './auth';
import { isDemoWriteMode } from './demo-write-mode';
import { hasPortalMemberAccess, type PortalMemberRole } from './portal-member';

export async function hasValidPortalSession(
  req: NextRequest,
  allowedRoles: PortalMemberRole[] = ['admin', 'enrollment', 'viewer'],
): Promise<boolean> {
  if (isDemoWriteMode()) {
    return true;
  }

  if (await hasValidAdminSession(req)) {
    return true;
  }

  return hasPortalMemberAccess(await convexAuthNextjsToken(), allowedRoles);
}
