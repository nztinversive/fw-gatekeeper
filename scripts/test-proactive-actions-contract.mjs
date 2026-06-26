#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = new URL('../src/lib/proactive-actions.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const executableSource = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

const module = { exports: {} };
new Script(executableSource, { filename: 'src/lib/proactive-actions.ts' }).runInNewContext({
  exports: module.exports,
  module,
  require,
  console,
});

const { buildProactiveActions, PROACTIVE_ACTION_PRIORITY_RANK } = module.exports;

const actionKeys = (actions) => JSON.parse(JSON.stringify(actions.map((action) => action.key)));
const plain = (value) => JSON.parse(JSON.stringify(value));
const findAction = (actions, key) => actions.find((action) => action.key === key);

function assertCurrentSignalFailure(action, sourceKeys, message) {
  assert.deepEqual(
    plain(action.freshness),
    {
      lastSuccessAt: '2026-06-26T13:50:00.000Z',
      failed: true,
      current: true,
      message,
      status: 'stale',
      reason: 'current-signal-failure',
      unavailable: true,
      sourceKeys,
    },
    `${action.key} should expose stale freshness for the failed current signal.`,
  );
}

assert.deepEqual(JSON.parse(JSON.stringify(PROACTIVE_ACTION_PRIORITY_RANK)), {
  critical: 0,
  warning: 1,
  closeout: 2,
  info: 3,
}, 'Proactive action priorities must make the ranking contract explicit.');

const mixedRiskPayload = {
  signalFailures: [
    {
      key: 'stats',
      label: 'Dashboard stats',
      href: '/reports',
      message: 'Dashboard stats could not refresh: upstream timeout',
    },
  ],
  workers: [
    { id: 'w1', name: 'Ava', department: 'Dock', encoding_status: 'valid', has_face_encoding: true, status: 'in' },
    { id: 'w2', name: 'Ben', department: 'Dock', encoding_status: 'invalid', has_face_encoding: true, status: 'absent' },
    { id: 'w3', name: 'Cam', department: 'Pack', encoding_status: 'missing', has_face_encoding: false, status: 'absent' },
  ],
  systemHealth: {
    checked_at: '2026-06-26T14:00:00.000Z',
    kiosks: {
      total: 2,
      counts: { online: 1, stale: 0, offline: 1, never_synced: 0 },
    },
    warnings: ['Main Entry kiosk is offline', 'Face service latency is elevated'],
  },
  stats: {
    totalWorkers: 3,
    notArrived: 2,
    scheduleWarning: 'No active schedule covers today.',
  },
  shiftExceptions: {
    date: '2026-06-26',
    summary: { total: 4, open: 3, critical: 1, warning: 2, info: 0 },
  },
  shiftCloseout: {
    date: '2026-06-26',
    closeout: null,
    blockers: [{ id: 'critical-exceptions', label: 'Critical exceptions' }],
    can_complete: false,
    summary: { open_exceptions: 3, critical_exceptions: 1, kiosk_warnings: 1 },
  },
};

const rankedActions = buildProactiveActions(mixedRiskPayload);

assert.deepEqual(actionKeys(rankedActions), [
  'system-health-0',
  'invalid-face',
  'shift-exceptions',
  'system-health-1',
  'missing-face',
  'schedule-warning',
  'signal-failure-stats',
  'shift-closeout-pending',
  'not-arrived',
], 'Critical kiosk/enrollment/exceptions must rank before warnings, closeout, and informational actions.');

const offlineKiosk = rankedActions[0];
assert.equal(offlineKiosk.priority, 'critical', 'Offline kiosk warnings must be critical.');
assert.equal(offlineKiosk.severity, 'critical', 'Offline kiosk warnings must expose critical severity.');
assert.equal(offlineKiosk.blocksReadiness, true, 'Offline kiosks block readiness.');
assert.equal(offlineKiosk.blocksCloseout, true, 'Kiosk warnings should block closeout until acknowledged.');
assert.deepEqual(plain(offlineKiosk.actionability), { access: 'operate', canOperate: true, role: null }, 'Missing currentRole should preserve the legacy operate contract.');
assert.deepEqual(offlineKiosk.evidence.kioskCounts, { online: 1, stale: 0, offline: 1, never_synced: 0 }, 'Kiosk evidence must include fleet counts.');
assert.deepEqual(plain(offlineKiosk.freshness), {
  status: 'unknown',
  reason: 'not-provided',
  sourceKeys: ['system-health', 'kiosk'],
}, 'Missing signal freshness should preserve existing behavior while marking evidence freshness unknown.');

const statsSignalFailure = findAction(rankedActions, 'signal-failure-stats');
assert.deepEqual(plain(statsSignalFailure.freshness), {
  status: 'stale',
  reason: 'current-signal-failure',
  sourceKeys: ['stats', 'signal'],
  failed: true,
  current: true,
  unavailable: true,
  message: 'Dashboard stats could not refresh: upstream timeout',
}, 'Signal failure actions must be stale and unavailable even when freshness metadata is absent.');

const invalidEnrollment = findAction(rankedActions, 'invalid-face');
assert.equal(invalidEnrollment.description, '1 worker needs re-enrollment because their face data is not kiosk-valid.');
assert.equal(invalidEnrollment.blocksReadiness, true, 'Invalid enrollment blocks readiness.');
assert.deepEqual(invalidEnrollment.evidence.workerIds, ['w2'], 'Invalid enrollment evidence should name affected workers.');

const missingEnrollment = findAction(rankedActions, 'missing-face');
assert.equal(missingEnrollment.description, '1 worker is missing face data for kiosk recognition.');
assert.equal(missingEnrollment.priority, 'warning', 'Missing enrollment remains a warning action.');

const exceptions = findAction(rankedActions, 'shift-exceptions');
assert.equal(exceptions.description, '3 exceptions need supervisor review, including 1 critical.');
assert.equal(exceptions.blocksCloseout, true, 'Open exceptions block closeout.');
assert.equal(exceptions.blocksReadiness, true, 'Critical exceptions block readiness.');
assert.equal(exceptions.href, '/exceptions?date=2026-06-26&status=open&severity=critical', 'Open exception actions should deep-link to the dated critical exception queue.');

const closeout = findAction(rankedActions, 'shift-closeout-pending');
assert.equal(closeout.priority, 'closeout', 'Closeout should rank after warning actions.');
assert.equal(closeout.severity, 'warning', 'Closeout with blockers should still show warning severity.');
assert.equal(closeout.description, '1 closeout checklist item needs acknowledgement.');
assert.equal(closeout.cta, 'Close shift', 'Legacy closeout CTA should remain operational when no role is supplied.');
assert.equal(closeout.href, '/closeout?date=2026-06-26', 'Closeout actions should preserve the selected date.');

const notArrived = findAction(rankedActions, 'not-arrived');
assert.equal(notArrived.priority, 'info', 'Not-arrived attendance is informational after closeout work.');
assert.equal(notArrived.description, '2 active workers have no clock-in scans today.');
assert.equal(notArrived.href, '/log?date=2026-06-26', 'Attendance actions should deep-link to the dated activity log.');

const focusedExceptionActions = buildProactiveActions({
  date: '2026-06-26',
  shiftExceptions: {
    date: '2026-06-26',
    exceptions: [
      { type: 'missing_clock_out', status: 'open' },
      { type: 'missing_clock_out', status: 'open' },
      { type: 'recognition_review', status: 'open' },
      { type: 'recognition_review', status: 'resolved' },
    ],
    summary: {
      total: 4,
      open: 3,
      critical: 0,
      warning: 3,
      info: 0,
      by_type: { missing_clock_out: 2, recognition_review: 2 },
      by_status: { open: 3, resolved: 1 },
    },
  },
});

assert.deepEqual(actionKeys(focusedExceptionActions), [
  'missing-clock-outs',
  'recognition-review',
  'shift-exceptions',
], 'Open exception type rows should create focused action cards before the generic exception action.');
const clockOutAction = findAction(focusedExceptionActions, 'missing-clock-outs');
assert.equal(clockOutAction.description, '2 workers are still clocked in after the scheduled shift end.');
assert.equal(clockOutAction.href, '/exceptions?date=2026-06-26&status=open&type=missing_clock_out', 'Missing clock-out actions should deep-link to the filtered exception queue.');
assert.equal(clockOutAction.blocksCloseout, true, 'Missing clock-outs should keep closeout attention visible.');
assert.equal(clockOutAction.blocksReadiness, false, 'Missing clock-outs should not block start-of-shift readiness.');
assert.deepEqual(plain(clockOutAction.evidence), {
  type: 'missing_clock_out',
  count: 2,
  byType: { missing_clock_out: 2, recognition_review: 2 },
}, 'Missing clock-out evidence should preserve the exception type mix.');
const recognitionReviewAction = findAction(focusedExceptionActions, 'recognition-review');
assert.equal(recognitionReviewAction.description, '1 recognition exception needs supervisor review before closeout.');
assert.equal(recognitionReviewAction.href, '/exceptions?date=2026-06-26&status=open&type=recognition_review', 'Recognition review actions should deep-link to the filtered open exception queue.');
assert.equal(recognitionReviewAction.cta, 'Review recognition');
assert.equal(recognitionReviewAction.blocksCloseout, true, 'Recognition review should remain closeout work.');

const focusedViewerActions = buildProactiveActions({
  date: '2026-06-26',
  shiftExceptions: {
    date: '2026-06-26',
    exceptions: [
      { type: 'missing_clock_out', status: 'open' },
      { type: 'recognition_review', status: 'open' },
    ],
    summary: {
      total: 2,
      open: 2,
      critical: 0,
      warning: 2,
      info: 0,
      by_type: { missing_clock_out: 1, recognition_review: 1 },
      by_status: { open: 2 },
    },
  },
  currentRole: 'viewer',
});
assert.equal(findAction(focusedViewerActions, 'missing-clock-outs').cta, 'Review clock-outs', 'Viewer clock-out actions should keep the focused CTA.');
assert.equal(findAction(focusedViewerActions, 'recognition-review').cta, 'Review recognition', 'Viewer recognition actions should keep the focused CTA.');
assert.equal(findAction(focusedViewerActions, 'recognition-review').href, '/exceptions?date=2026-06-26&status=open&type=recognition_review', 'Viewer recognition actions should keep the precise recognition queue filter.');

const resolvedTypeOnlyActions = buildProactiveActions({
  date: '2026-06-26',
  shiftExceptions: {
    date: '2026-06-26',
    exceptions: [
      { type: 'missing_clock_out', status: 'resolved' },
      { type: 'recognition_review', status: 'ignored' },
      { type: 'scan_sequence', status: 'open' },
    ],
    summary: {
      total: 3,
      open: 1,
      critical: 0,
      warning: 1,
      info: 0,
      by_type: { missing_clock_out: 1, recognition_review: 1, scan_sequence: 1 },
      by_status: { open: 1, resolved: 1, ignored: 1 },
    },
  },
});

assert.deepEqual(actionKeys(resolvedTypeOnlyActions), [
  'shift-exceptions',
], 'Resolved or ignored exception types must not keep focused proactive actions alive.');

const allOpenTypeSummaryActions = buildProactiveActions({
  date: '2026-06-26',
  shiftExceptions: {
    date: '2026-06-26',
    summary: {
      total: 2,
      open: 2,
      critical: 0,
      warning: 2,
      info: 0,
      by_type: { missing_clock_out: 1, recognition_review: 1 },
      by_status: { open: 2 },
    },
  },
});

assert.deepEqual(actionKeys(allOpenTypeSummaryActions), [
  'missing-clock-outs',
  'recognition-review',
  'shift-exceptions',
], 'When every summarized exception is open, by_type should be safe to use as the fallback focused action source.');

const staleFreshnessPayload = {
  stats: {
    lastSuccessAt: '2026-06-26T13:50:00.000Z',
    failed: true,
    current: true,
    message: 'Stats signal failed now',
  },
  workers: {
    lastSuccessAt: '2026-06-26T13:50:00.000Z',
    failed: true,
    current: true,
    message: 'Worker roster signal failed now',
  },
  attendance: {
    lastSuccessAt: '2026-06-26T13:50:00.000Z',
    failed: true,
    current: true,
    message: 'Attendance signal failed now',
  },
  'system-health': {
    lastSuccessAt: '2026-06-26T13:50:00.000Z',
    failed: true,
    current: true,
    message: 'System health signal failed now',
  },
  'shift-exceptions': {
    lastSuccessAt: '2026-06-26T13:50:00.000Z',
    failed: true,
    current: true,
    message: 'Shift exceptions signal failed now',
  },
  'shift-closeout': {
    lastSuccessAt: '2026-06-26T13:50:00.000Z',
    failed: true,
    current: true,
    message: 'Shift closeout signal failed now',
  },
};

const staleFreshnessActions = buildProactiveActions({
  ...mixedRiskPayload,
  signalFreshness: staleFreshnessPayload,
});

assert.deepEqual(actionKeys(staleFreshnessActions), actionKeys(rankedActions), 'Freshness metadata must not change proactive action ranking.');
assertCurrentSignalFailure(findAction(staleFreshnessActions, 'system-health-0'), ['system-health', 'kiosk'], 'System health signal failed now');
assertCurrentSignalFailure(findAction(staleFreshnessActions, 'shift-exceptions'), ['shift-exceptions', 'exceptions'], 'Shift exceptions signal failed now');
assertCurrentSignalFailure(findAction(staleFreshnessActions, 'shift-closeout-pending'), ['shift-closeout', 'closeout'], 'Shift closeout signal failed now');
assertCurrentSignalFailure(findAction(staleFreshnessActions, 'invalid-face'), ['workers', 'enrollment'], 'Worker roster signal failed now');
assertCurrentSignalFailure(findAction(staleFreshnessActions, 'not-arrived'), ['attendance'], 'Attendance signal failed now');
assertCurrentSignalFailure(findAction(staleFreshnessActions, 'schedule-warning'), ['stats', 'schedule'], 'Stats signal failed now');

const adminActions = buildProactiveActions({ ...mixedRiskPayload, currentRole: 'admin' });
assert.deepEqual(actionKeys(adminActions), actionKeys(rankedActions), 'Admin role must not change proactive action ranking.');
assert.equal(findAction(adminActions, 'shift-closeout-pending').cta, 'Review closeout', 'Admins should review closeout until the shift can complete.');
assert.deepEqual(
  plain(findAction(adminActions, 'system-health-0').actionability),
  { access: 'operate', canOperate: true, role: 'admin' },
  'Admin actionability should allow operations across proactive sources.',
);

const enrollmentActions = buildProactiveActions({ ...mixedRiskPayload, currentRole: 'enrollment' });
assert.deepEqual(actionKeys(enrollmentActions), actionKeys(rankedActions), 'Enrollment role must not change proactive action ranking.');
assert.equal(findAction(enrollmentActions, 'shift-closeout-pending').cta, 'Review closeout', 'Enrollment users should review closeout until the shift can complete.');
assert.deepEqual(
  plain(findAction(enrollmentActions, 'shift-exceptions').actionability),
  { access: 'operate', canOperate: true, role: 'enrollment' },
  'Enrollment users should retain exception-review actionability.',
);
assert.deepEqual(
  plain(findAction(enrollmentActions, 'invalid-face').actionability),
  { access: 'operate', canOperate: true, role: 'enrollment' },
  'Enrollment users should retain face-enrollment actionability.',
);
assert.equal(findAction(enrollmentActions, 'invalid-face').cta, 'Enroll face', 'Enrollment users should be sent to the enrollment workflow.');
assert.equal(findAction(enrollmentActions, 'invalid-face').href, '/enroll', 'Enrollment users should not be sent to the admin-heavy workers page.');
assert.equal(findAction(enrollmentActions, 'system-health-0').cta, 'Inspect readiness', 'Enrollment users should inspect admin-only kiosk readiness instead of being sent to operate it.');
assert.equal(findAction(enrollmentActions, 'system-health-0').href, '/', 'Enrollment users should not be sent to the admin-only kiosk page.');
assert.deepEqual(
  plain(findAction(enrollmentActions, 'system-health-0').actionability),
  { access: 'review', canOperate: false, role: 'enrollment' },
  'Enrollment actionability should mark kiosk actions as review-only.',
);

const viewerActions = buildProactiveActions({ ...mixedRiskPayload, currentRole: 'viewer' });
assert.deepEqual(actionKeys(viewerActions), actionKeys(rankedActions), 'Viewer role must not change proactive action ranking.');
assert.equal(findAction(viewerActions, 'shift-closeout-pending').cta, 'Review closeout', 'Viewers should review closeout state instead of being told to close the shift.');
assert.equal(findAction(viewerActions, 'shift-closeout-pending').href, '/closeout?date=2026-06-26', 'Viewers can inspect closeout state on the dated read route.');
assert.equal(findAction(viewerActions, 'shift-exceptions').cta, 'Review exceptions', 'Viewers should review exceptions instead of operating them.');
assert.equal(findAction(viewerActions, 'shift-exceptions').href, '/exceptions?date=2026-06-26&status=open&severity=critical', 'Viewers should keep the exact exception filter context.');
assert.equal(findAction(viewerActions, 'invalid-face').cta, 'Inspect briefing', 'Viewers should inspect enrollment issues from a read-oriented surface.');
assert.equal(findAction(viewerActions, 'invalid-face').href, '/briefing', 'Viewers should not be sent to worker operations for enrollment issues.');
assert.equal(findAction(viewerActions, 'system-health-0').cta, 'Inspect readiness', 'Viewers should inspect kiosk readiness instead of operating it.');
assert.equal(findAction(viewerActions, 'system-health-0').href, '/', 'Viewers should not be sent to the admin-only kiosk page.');
assert.deepEqual(
  plain(findAction(viewerActions, 'shift-closeout-pending').actionability),
  { access: 'review', canOperate: false, role: 'viewer' },
  'Viewer actionability should mark write workflows as review-only.',
);

const dashboardSource = read('src/app/page.tsx');
const portalRoleRoute = read('src/app/api/portal-role/route.ts');
const middlewareSource = read('src/middleware.ts');
assert.match(dashboardSource, /\/api\/portal-role/, 'Dashboard should resolve role through the lightweight portal role API.');
assert.doesNotMatch(dashboardSource, /from 'convex\/react'/, 'Dashboard should not add a Convex client query just to resolve action roles.');
assert.match(portalRoleRoute, /hasValidAdminSession/, 'Portal role API should treat legacy admin-cookie sessions as admin.');
assert.match(portalRoleRoute, /getPortalMemberForToken/, 'Portal role API should resolve Convex portal member roles.');
assert.match(middlewareSource, /pathname === '\/api\/portal-role' && method === 'GET'[\s\S]*\['admin', 'enrollment', 'viewer'\]/, 'Middleware should allow all active portal roles to resolve dashboard actionability.');

const backendUnavailableActions = buildProactiveActions({
  shiftExceptions: {
    date: '2026-06-26',
    backend_unavailable: true,
    warning: 'Shift exception storage is waiting for the Convex functions to deploy.',
    summary: { total: 0, open: 0, critical: 0, warning: 0, info: 0 },
  },
  shiftCloseout: {
    date: '2026-06-26',
    backend_unavailable: true,
    warning: 'Shift closeout is waiting for the Convex functions to deploy.',
    closeout: null,
    blockers: [],
    can_complete: false,
  },
});

assert.deepEqual(actionKeys(backendUnavailableActions), [
  'shift-exceptions-unavailable',
  'shift-closeout-unavailable',
  'shift-closeout-pending',
], 'Deployment-pending shift storage must be visible instead of looking all clear.');
assert.equal(backendUnavailableActions[0].blocksCloseout, true, 'Unavailable exception storage blocks closeout trust.');
assert.equal(backendUnavailableActions[0].href, '/exceptions?date=2026-06-26&status=open', 'Unavailable exception storage should still link to the dated exception view.');
assert.equal(backendUnavailableActions[1].description, 'Shift closeout is waiting for the Convex functions to deploy.');
assert.equal(backendUnavailableActions[1].href, '/closeout?date=2026-06-26', 'Unavailable closeout storage should still link to the dated closeout view.');

const completedCloseout = buildProactiveActions({
  workers: [],
  stats: { notArrived: 0 },
  shiftExceptions: { summary: { open: 0, critical: 0, warning: 0, info: 0 } },
  shiftCloseout: {
    closeout: {
      status: 'completed',
      completed_at: '2026-06-26T20:30:00.000Z',
    },
  },
});

assert.deepEqual(actionKeys(completedCloseout), ['shift-closeout-complete'], 'Completed closeout should be the only informational action in a clean closeout payload.');
assert.match(completedCloseout[0].description, /^Today's supervisor closeout was completed at /, 'Completed closeout description should include a display time.');
assert.equal(completedCloseout[0].blocksCloseout, false, 'Completed closeout must not block closeout.');

const noActions = buildProactiveActions({
  signalFailures: [],
  workers: [
    { id: 'w1', name: 'Ava', department: 'Dock', encoding_status: 'valid', has_face_encoding: true, status: 'in' },
  ],
  systemHealth: {
    checked_at: '2026-06-26T14:00:00.000Z',
    kiosks: { total: 1, counts: { online: 1, stale: 0, offline: 0, never_synced: 0 } },
    warnings: [],
  },
  stats: { totalWorkers: 1, notArrived: 0 },
  shiftExceptions: { summary: { open: 0, critical: 0, warning: 0, info: 0 } },
});

assert.deepEqual(JSON.parse(JSON.stringify(noActions)), [], 'Clean payloads without closeout work should return no proactive actions.');

console.log('Proactive actions contract passed');
