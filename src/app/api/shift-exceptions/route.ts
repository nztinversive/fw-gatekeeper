export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import convex from '@/lib/convex';
import { unauthorizedApiResponse } from '@/lib/auth';
import { hasValidPortalSession } from '@/lib/portal-auth';
import { api } from '../../../../convex/_generated/api';

const VALID_STATUSES = new Set(['open', 'reviewed', 'ignored', 'resolved']);

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getDate(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function emptyResponse(date: string, extra?: Record<string, unknown>) {
  return {
    date,
    generated_at: new Date().toISOString(),
    exceptions: [],
    summary: {
      total: 0,
      open: 0,
      critical: 0,
      warning: 0,
      info: 0,
      by_severity: { critical: 0, warning: 0, info: 0 },
      by_type: {},
      by_status: { open: 0, reviewed: 0, ignored: 0, resolved: 0 },
    },
    ...extra,
  };
}

function isMissingConvexFunction(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('FunctionPathNotFound') || message.includes('Could not find public function');
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
    const payload = await convex.query((api as any).shiftExceptions.summary, { date });
    return NextResponse.json(payload);
  } catch (error) {
    if (isMissingConvexFunction(error)) {
      return NextResponse.json(emptyResponse(date, {
        backend_unavailable: true,
        warning: 'Shift exception storage is waiting for the Convex functions to deploy.',
      }));
    }
    console.error('Shift exceptions GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch shift exceptions' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await hasValidPortalSession(req, ['admin', 'enrollment']))) {
    return unauthorizedApiResponse();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const exceptionKey = optionalString(body.exception_key) || optionalString(body.exceptionKey);
    const date = optionalString(body.date);
    const type = optionalString(body.type);
    const status = optionalString(body.status) || 'reviewed';

    if (!exceptionKey || !date || !type) {
      return NextResponse.json({ error: 'exception_key, date, and type required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'date must use YYYY-MM-DD format' }, { status: 400 });
    }
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'status must be open, reviewed, ignored, or resolved' }, { status: 400 });
    }

    const result = await convex.mutation((api as any).shiftExceptions.review, {
      exceptionKey,
      date,
      type,
      status,
      note: optionalString(body.note),
    });

    return NextResponse.json(result || { ok: true });
  } catch (error) {
    console.error('Shift exceptions PATCH error:', error);
    return NextResponse.json({ error: 'Failed to review shift exception' }, { status: 500 });
  }
}
