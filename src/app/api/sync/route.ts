export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { hasValidKioskKey, unauthorizedApiResponse } from '@/lib/auth';
import { fetchWorkersForSync, updateKioskLastSync } from '@/lib/convex-ingest';
import { hasValidPortalSession } from '@/lib/portal-auth';

export async function GET(req: NextRequest) {
  const isAuthorized = (await hasValidPortalSession(req, ['admin'])) || hasValidKioskKey(req);
  if (!isAuthorized) return unauthorizedApiResponse();

  const kioskId = req.nextUrl.searchParams.get('kiosk_id');
  const since = req.nextUrl.searchParams.get('since') || '1970-01-01T00:00:00.000Z';

  if (!kioskId) return NextResponse.json({ error: 'kiosk_id required' }, { status: 400 });

  const lastSync = new Date().toISOString();
  try {
    const result = await updateKioskLastSync(kioskId, lastSync);
    if (!result.updated) {
      console.warn('next_secured_ingest_kiosk_sync_not_found', { kioskId });
    }
  } catch (error) {
    console.error('next_secured_ingest_kiosk_sync_failed', {
      kioskId,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  const { workers } = await fetchWorkersForSync(since);
  return NextResponse.json({ workers, synced_at: lastSync });
}
