export const dynamic = 'force-dynamic';

import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { NextResponse } from 'next/server';
import { isDemoWriteMode } from '@/lib/demo-write-mode';
import { getPortalMemberForToken } from '@/lib/portal-member';

export async function GET() {
  if (isDemoWriteMode()) {
    return NextResponse.json({ role: 'admin', source: 'local-demo' });
  }

  const member = await getPortalMemberForToken(await convexAuthNextjsToken());
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ role: member.role, source: 'portal-member' });
}
