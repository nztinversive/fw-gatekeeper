'use client';

import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs';
import { ConvexReactClient } from 'convex/react';
import { ReactNode, useMemo } from 'react';

export default function ConvexAuthProvider({ children }: { children: ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is required');
  }

  const convex = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl]);

  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
