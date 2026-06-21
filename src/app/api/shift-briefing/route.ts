export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { unauthorizedApiResponse } from '@/lib/auth';
import { hasValidPortalSession } from '@/lib/portal-auth';
import { api } from '../../../../convex/_generated/api';

function getDate(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function isMissingConvexFunction(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('FunctionPathNotFound') || message.includes('Could not find public function');
}

function emptyResponse(date: string) {
  return {
    date,
    generated_at: new Date().toISOString(),
    summary: {
      expected: 0,
      present: 0,
      late: 0,
      missing: 0,
      clocked_out: 0,
      departments: 0,
      open_exceptions: 0,
      critical_actions: 0,
      kiosk_warnings: 0,
    },
    departments: [],
    workers: [],
    action_items: [],
    kiosks: {
      total: 0,
      counts: { online: 0, stale: 0, offline: 0, never_synced: 0 },
      rows: [],
    },
    schedules: { active_today: 0, total_active: 0 },
    backend_unavailable: true,
    warning: 'Shift briefing is waiting for the Convex functions to deploy.',
  };
}

export async function GET(req: NextRequest) {
  if (!(await hasValidPortalSession(req, ['admin', 'enrollment', 'viewer']))) {
    return unauthorizedApiResponse();
  }

  const date = getDate(req);
  if (!date) {
    return NextResponse.json({ error: 'date must use YYYY-MM-DD format' }, { status: 400 });
  }

  try {
    const payload = await convex.query((api as any).shiftBriefing.summary, { date });
    return NextResponse.json(payload);
  } catch (error) {
    if (isMissingConvexFunction(error)) {
      return NextResponse.json(emptyResponse(date));
    }
    console.error('Shift briefing GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch shift briefing' }, { status: 500 });
  }
}
