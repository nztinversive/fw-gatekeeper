export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';
import { hasValidAdminSession, hasValidKioskKey, unauthorizedApiResponse } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const isAuthorized = (await hasValidAdminSession(req)) || hasValidKioskKey(req);
  if (!isAuthorized) return unauthorizedApiResponse();

  const kioskId = req.nextUrl.searchParams.get('kiosk_id');
  const since = req.nextUrl.searchParams.get('since') || '1970-01-01T00:00:00.000Z';

  if (!kioskId) return NextResponse.json({ error: 'kiosk_id required' }, { status: 400 });

  // Update kiosk last_sync
  try {
    const kiosk = await convex.query(api.kiosks.findByKioskId, {
      kioskId,
    });
    if (kiosk?.id) {
      await convex.mutation(api.kiosks.updateLastSync, {
        id: kiosk.id as any,
        lastSync: new Date().toISOString(),
      });
    }
  } catch {
    // Kiosk might not exist yet
  }

  const workers = await convex.query(api.workers.listForSync, { since });
  return NextResponse.json({ workers, synced_at: new Date().toISOString() });
}
