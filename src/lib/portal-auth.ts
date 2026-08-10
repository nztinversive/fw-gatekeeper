import 'server-only';

import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { NextRequest } from 'next/server';
import { isDemoWriteMode } from './demo-write-mode';
import { hasPortalMemberAccess, type PortalMemberRole } from './portal-member';

export async function hasValidPortalSession(
  _req: NextRequest,
  allowedRoles: PortalMemberRole[] = ['admin', 'enrollment', 'viewer'],
): Promise<boolean> {
  if (isDemoWriteMode()) {
    return true;
  }

  return hasPortalMemberAccess(await convexAuthNextjsToken(), allowedRoles);
}
