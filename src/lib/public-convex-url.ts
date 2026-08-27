const LOCAL_DEMO_CONVEX_URL = 'https://demo-fw-gatekeeper.convex.cloud';

export function isPublicDemoWriteMode() {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_FW_DEMO_WRITE_MODE === '1';
}

export function getPublicConvexUrl() {
  if (isPublicDemoWriteMode()) return LOCAL_DEMO_CONVEX_URL;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl) return convexUrl;
  throw new Error('NEXT_PUBLIC_CONVEX_URL is required');
}
