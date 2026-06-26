export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { unauthorizedApiResponse } from '@/lib/auth';
import { hasValidPortalSession } from '@/lib/portal-auth';
import { isValidLocalDateString, resolveRequestDate } from '@/lib/date';
import { api } from '../../../../convex/_generated/api';
import { demoWriteMetadata, getDemoCloseout, isDemoWriteMode, saveDemoCloseout } from '@/lib/demo-write-mode';

const VALID_ACTIONS = new Set(['save', 'complete', 'reopen']);

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getDate(req: NextRequest) {
  const date = resolveRequestDate(req.nextUrl.searchParams);
  return isValidLocalDateString(date) ? date : null;
}

function isMissingConvexFunction(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('FunctionPathNotFound') || message.includes('Could not find public function');
}

function emptyResponse(date: string) {
  return {
    date,
    generated_at: new Date().toISOString(),
    closeout: null,
    summary: {
      expected: 0,
      present: 0,
      late: 0,
      missing: 0,
      open_exceptions: 0,
      critical_exceptions: 0,
      missing_clock_outs: 0,
      recognition_reviews: 0,
      kiosk_warnings: 0,
      attendance_corrections: 0,
    },
    checklist: [],
    blockers: [],
    can_complete: false,
    suggested_note: '',
    action_links: [],
    backend_unavailable: true,
    warning: 'Shift closeout is waiting for the Convex functions to deploy.',
  };
}

function withDemoCloseout(payload: any, date: string) {
  if (!isDemoWriteMode()) return payload;
  const demoCloseout = getDemoCloseout(date);
  if (!demoCloseout) return payload;
  return {
    ...payload,
    closeout: demoCloseout,
    ...demoWriteMetadata(),
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
    const payload = await convex.query((api as any).shiftCloseouts.get, { date });
    return NextResponse.json(withDemoCloseout(payload, date));
  } catch (error) {
    if (isMissingConvexFunction(error)) {
      return NextResponse.json(withDemoCloseout(emptyResponse(date), date));
    }
    console.error('Shift closeout GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch shift closeout' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await hasValidPortalSession(req, ['admin', 'enrollment']))) {
    return unauthorizedApiResponse();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const date = optionalString(body.date);
    const action = optionalString(body.action) || 'save';

    if (!date) {
      return NextResponse.json({ error: 'date required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must use YYYY-MM-DD format' }, { status: 400 });
    }
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json({ error: 'action must be save, complete, or reopen' }, { status: 400 });
    }

    if (isDemoWriteMode()) {
      const result = saveDemoCloseout({
        date,
        action: action as 'save' | 'complete' | 'reopen',
        supervisorName: optionalString(body.supervisor_name) || optionalString(body.supervisorName),
        notes: optionalString(body.notes),
        acknowledgedBlockers: Boolean(body.acknowledged_blockers ?? body.acknowledgedBlockers),
      });
      return NextResponse.json({ ok: true, closeout: result, ...demoWriteMetadata() });
    }

    const result = await convex.mutation((api as any).shiftCloseouts.save, {
      date,
      action,
      supervisorName: optionalString(body.supervisor_name) || optionalString(body.supervisorName),
      notes: optionalString(body.notes),
      acknowledgedBlockers: Boolean(body.acknowledged_blockers ?? body.acknowledgedBlockers),
    });

    return NextResponse.json(result || { ok: true });
  } catch (error) {
    console.error('Shift closeout PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update shift closeout' },
      { status: 500 },
    );
  }
}
