export const dynamic = 'force-dynamic';

import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { hasValidAdminSession } from '@/lib/auth';
import { getPortalMemberForToken } from '@/lib/portal-member';

export async function GET(req: NextRequest) {
  if (await hasValidAdminSession(req)) {
    return NextResponse.json({ role: 'admin', source: 'legacy-admin' });
  }

  const member = await getPortalMemberForToken(await convexAuthNextjsToken());
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ role: member.role, source: 'portal-member' });
}
