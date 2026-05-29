import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

export type PortalMemberRole = 'admin' | 'enrollment' | 'viewer';

type PortalMember = {
  userId: string;
  role: PortalMemberRole;
  active: boolean;
};

export async function getPortalMemberForToken(token?: string): Promise<PortalMember | null> {
  if (!token) {
    return null;
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return null;
  }

  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);

  try {
    return await client.query((api as any).portalMembers.current, {});
  } catch {
    return null;
  }
}

export async function hasPortalMemberAccess(
  token?: string,
  allowedRoles: PortalMemberRole[] = ['admin', 'enrollment', 'viewer'],
): Promise<boolean> {
  const member = await getPortalMemberForToken(token);
  return Boolean(member && allowedRoles.includes(member.role));
}
