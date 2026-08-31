'use client';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export type PortalRole = 'admin' | 'enrollment' | 'viewer';

// Resolves the signed-in member's portal role straight from Convex,
// replacing the old /api passthrough route. undefined while loading.
export function usePortalRole(): PortalRole | undefined {
  const member = useQuery(api.portalMembers.current, {});
  return (member?.role as PortalRole) ?? undefined;
}
