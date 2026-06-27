'use client';

import { ConvexAuthNextjsProvider } from '@convex-dev/auth/nextjs';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ReactNode, useMemo } from 'react';
import { getPublicConvexUrl, isPublicDemoWriteMode } from '@/lib/public-convex-url';

export default function ConvexAuthProvider({ children }: { children: ReactNode }) {
  const convexUrl = getPublicConvexUrl();
  const convex = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl]);

  if (isPublicDemoWriteMode() && !process.env.NEXT_PUBLIC_CONVEX_URL) {
    return <ConvexProvider client={convex}>{children}</ConvexProvider>;
  }

  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
