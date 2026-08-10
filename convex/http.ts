import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';

const http = httpRouter();
auth.addHttpRoutes(http);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'x-fw-ingest-path': 'secured-convex-v1',
    },
  });
}

function hasValidIngestCredential(request: Request) {
  const expected = process.env.CONVEX_INGEST_KEY?.trim();
  if (!expected) {
    console.error('secured_ingest_auth_unconfigured');
    return false;
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  return authorization.slice('Bearer '.length).trim() === expected;
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const attendanceBulkIngest = httpAction(async (ctx, request) => {
  if (!hasValidIngestCredential(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await readJsonBody(request);
  if (!body || !Array.isArray(body.events)) {
    return jsonResponse({ error: 'events array required' }, 400);
  }

  const result = await ctx.runMutation(internal.attendance.bulkCreateFromHttp, {
    events: body.events,
  });
  console.info('secured_ingest_attendance', { received: body.events.length, synced: result.synced });
  return jsonResponse(result);
});

const attendanceIngest = httpAction(async (ctx, request) => {
  if (!hasValidIngestCredential(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await readJsonBody(request);
  if (!body || typeof body.workerId !== 'string' || typeof body.eventType !== 'string') {
    return jsonResponse({ error: 'workerId and eventType required' }, 400);
  }

  const result = await ctx.runMutation(internal.attendance.createFromHttp, {
    workerId: body.workerId,
    eventType: body.eventType,
    kioskId: typeof body.kioskId === 'string' ? body.kioskId : undefined,
    timestamp: typeof body.timestamp === 'string' ? body.timestamp : undefined,
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
  });
  console.info('secured_ingest_attendance_single', { workerId: body.workerId });
  return jsonResponse(result, 201);
});

const recognitionAttemptsBulkIngest = httpAction(async (ctx, request) => {
  if (!hasValidIngestCredential(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await readJsonBody(request);
  if (!body || !Array.isArray(body.attempts)) {
    return jsonResponse({ error: 'attempts array required' }, 400);
  }

  const result = await ctx.runMutation(internal.recognitionAttempts.bulkIngestFromHttp, {
    attempts: body.attempts,
  });
  console.info('secured_ingest_recognition', {
    received: body.attempts.length,
    ingested: result.ingested,
    skipped: result.skipped,
  });
  return jsonResponse(result, 201);
});

const kioskLastSyncIngest = httpAction(async (ctx, request) => {
  if (!hasValidIngestCredential(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await readJsonBody(request);
  if (!body || typeof body.kioskId !== 'string' || typeof body.lastSync !== 'string') {
    return jsonResponse({ error: 'kioskId and lastSync required' }, 400);
  }

  const result = await ctx.runMutation(internal.kiosks.updateLastSyncFromHttp, {
    kioskId: body.kioskId,
    lastSync: body.lastSync,
  });
  console.info('secured_ingest_kiosk_sync', { kioskId: body.kioskId, updated: result.updated });
  return jsonResponse(result);
});

const workerSyncRead = httpAction(async (ctx, request) => {
  if (!hasValidIngestCredential(request)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await readJsonBody(request);
  const since = body && typeof body.since === 'string' ? body.since : undefined;
  const workers = await ctx.runQuery(internal.workers.listForSyncFromHttp, { since });
  console.info('secured_ingest_worker_sync', { returned: workers.length });
  return jsonResponse({ workers });
});

http.route({ path: '/api/ingest/attendance', method: 'POST', handler: attendanceIngest });
http.route({ path: '/api/ingest/attendance/bulk', method: 'POST', handler: attendanceBulkIngest });
http.route({ path: '/api/ingest/recognition-attempts/bulk', method: 'POST', handler: recognitionAttemptsBulkIngest });
http.route({ path: '/api/ingest/kiosks/last-sync', method: 'POST', handler: kioskLastSyncIngest });
http.route({ path: '/api/ingest/workers/sync', method: 'POST', handler: workerSyncRead });

export default http;
