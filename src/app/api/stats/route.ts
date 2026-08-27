export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { api } from '../../../../convex/_generated/api';
import { isValidLocalDateString, resolveRequestDate } from '@/lib/date';

export async function GET(req: NextRequest) {
  try {
    const date = resolveRequestDate(req.nextUrl.searchParams);
    if (!isValidLocalDateString(date)) {
      return NextResponse.json({ error: 'date must use YYYY-MM-DD format' }, { status: 400 });
    }
    const stats = await convex.query(api.stats.get, { date });
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
