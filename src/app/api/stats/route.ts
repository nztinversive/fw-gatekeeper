export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';
import { isValidLocalDateString, resolveRequestDate } from '@/lib/date';
import { isDemoWriteMode, listDemoWorkers } from '@/lib/demo-write-mode';

export async function GET(req: NextRequest) {
  try {
    const date = resolveRequestDate(req.nextUrl.searchParams);
    if (!isValidLocalDateString(date)) {
      return NextResponse.json({ error: 'date must use YYYY-MM-DD format' }, { status: 400 });
    }
    if (isDemoWriteMode()) {
      return NextResponse.json({ totalWorkers: listDemoWorkers().length, clockedIn: 0, clockedOut: 0, notArrived: listDemoWorkers().length });
    }
    const stats = await convex.query(api.stats.get, { date });
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
