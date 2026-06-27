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

const {
  buildProactiveActions,
  buildProactiveShiftTrustPlan,
  getProactiveActionOutcomeChips,
  getProactiveActionProofLink,
  PROACTIVE_ACTION_PRIORITY_RANK,
} = module.exports;

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
    blockers: [{
      id: 'critical-exceptions',
      label: 'Critical exceptions',
      proof: {
        label: 'open critical exceptions',
        count: 1,
        href: '/exceptions?date=2026-06-26&status=open&severity=critical&exception_key=2026-06-26%3Acritical%3Aw2',
        exact: true,
      },
    }],
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

const trustPlan = buildProactiveShiftTrustPlan(rankedActions);
assert.deepEqual(
  plain(trustPlan),
  {
    actionKey: 'system-health-0',
    label: 'Do this first: Kiosk sync warning',
    description: 'Main Entry kiosk is offline.',
    href: '/kiosks',
    cta: 'Open kiosks',
    proofLink: null,
    tone: 'red',
    access: 'operate',
    stale: false,
    staleLabel: null,
    unlocks: ['Shift readiness', 'Closeout trust'],
  },
  'Shift trust plan should summarize the already-ranked top action without creating a second ranking system.',
);

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
assert.equal(invalidEnrollment.href, '/enroll?worker_id=w2', 'Invalid enrollment actions should deep-link to the first affected worker enrollment flow.');
assert.equal(invalidEnrollment.cta, 'Enroll face', 'Invalid enrollment actions should send operators directly to face enrollment.');
assert.equal(invalidEnrollment.blocksReadiness, true, 'Invalid enrollment blocks readiness.');
assert.deepEqual(plain(invalidEnrollment.evidence), {
  count: 1,
  firstWorkerId: 'w2',
  workerIds: ['w2'],
}, 'Invalid enrollment evidence should name affected workers and the exact first handoff target.');

const missingEnrollment = findAction(rankedActions, 'missing-face');
assert.equal(missingEnrollment.description, '1 worker is missing face data for kiosk recognition.');
assert.equal(missingEnrollment.href, '/enroll?worker_id=w3', 'Missing enrollment actions should deep-link to the first affected worker enrollment flow.');
assert.equal(missingEnrollment.cta, 'Enroll face', 'Missing enrollment actions should send operators directly to face enrollment.');
assert.equal(missingEnrollment.priority, 'warning', 'Missing enrollment remains a warning action.');
assert.deepEqual(plain(missingEnrollment.evidence), {
  count: 1,
  firstWorkerId: 'w3',
  workerIds: ['w3'],
}, 'Missing enrollment evidence should name affected workers and the exact first handoff target.');

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
assert.equal(closeout.evidence.firstBlockerLabel, 'Critical exceptions', 'Closeout evidence should preserve the first blocker label.');
assert.deepEqual(plain(closeout.evidence.firstBlockerProof), {
  label: 'open critical exceptions',
  count: 1,
  href: '/exceptions?date=2026-06-26&status=open&severity=critical&exception_key=2026-06-26%3Acritical%3Aw2',
  exact: true,
}, 'Closeout evidence should preserve first blocker proof without rerouting the action away from closeout.');
const correctionProofAction = {
  source: 'closeout',
  evidence: {
    firstBlockerProof: {
      href: '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2&intent=correct',
      exact: true,
    },
  },
  actionability: { access: 'operate', canOperate: true, role: 'admin' },
};
assert.deepEqual(plain(getProactiveActionProofLink(correctionProofAction)), {
  href: '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2&intent=correct',
  label: 'Open exact source',
}, 'Operating roles should keep exact closeout proof links intact.');
assert.deepEqual(plain(getProactiveActionProofLink({
  ...correctionProofAction,
  actionability: { access: 'review', canOperate: false, role: 'viewer' },
})), {
  href: '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2',
  label: 'Review exact source',
}, 'Review-only roles should preserve exact proof row context while stripping correction intent.');
assert.deepEqual(plain(getProactiveActionProofLink({
  ...correctionProofAction,
  actionability: { access: 'operate', canOperate: true, role: null },
})), {
  href: '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2',
  label: 'Review exact source',
}, 'Unknown roles should use review-safe closeout proof links until portal role resolution completes.');
const closeoutProofPlan = buildProactiveShiftTrustPlan(buildProactiveActions({
  date: '2026-06-26',
  shiftCloseout: {
    date: '2026-06-26',
    closeout: null,
    blockers: [{
      id: 'missing-clock-outs',
      label: 'Missing clock-outs',
      proof: {
        label: 'missing clock-out exceptions',
        count: 1,
        href: '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2&intent=correct',
        exact: true,
      },
    }],
    can_complete: false,
  },
  currentRole: 'admin',
}));
assert.equal(closeoutProofPlan.actionKey, 'shift-closeout-pending', 'Blocked closeout can be the next best action when higher-risk blockers are absent.');
assert.deepEqual(plain(closeoutProofPlan.proofLink), {
  href: '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2&intent=correct',
  label: 'Open exact source',
}, 'Shift trust plan should expose exact closeout proof links for operating roles.');
const viewerCloseoutProofPlan = buildProactiveShiftTrustPlan(buildProactiveActions({
  date: '2026-06-26',
  shiftCloseout: {
    date: '2026-06-26',
    closeout: null,
    blockers: [{
      id: 'missing-clock-outs',
      label: 'Missing clock-outs',
      proof: {
        label: 'missing clock-out exceptions',
        count: 1,
        href: '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2&intent=correct',
        exact: true,
      },
    }],
    can_complete: false,
  },
  currentRole: 'viewer',
}));
assert.deepEqual(plain(viewerCloseoutProofPlan.proofLink), {
  href: '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2',
  label: 'Review exact source',
}, 'Shift trust plan should strip correction intent from exact closeout proof links for review-only roles.');

const notArrived = findAction(rankedActions, 'not-arrived');
assert.equal(notArrived.priority, 'info', 'Not-arrived attendance is informational after closeout work.');
assert.equal(notArrived.description, '2 active workers have no clock-in scans today.');
assert.equal(notArrived.href, '/briefing?date=2026-06-26&status=missing', 'Attendance actions should deep-link to the dated missing-worker briefing filter.');
assert.equal(notArrived.cta, 'Review missing', 'Not-arrived actions should point supervisors at the missing-worker review.');

const focusedExceptionActions = buildProactiveActions({
  date: '2026-06-26',
  shiftExceptions: {
    date: '2026-06-26',
    exceptions: [
      { key: '2026-06-26:missing_clock_out:w2', type: 'missing_clock_out', status: 'open' },
      { key: '2026-06-26:missing_clock_out:w3', type: 'missing_clock_out', status: 'open' },
      { key: '2026-06-26:recognition_review:a1', type: 'recognition_review', status: 'open' },
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
assert.equal(clockOutAction.href, '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2&intent=correct', 'Missing clock-out actions should deep-link to the first filtered correction target.');
assert.equal(clockOutAction.blocksCloseout, true, 'Missing clock-outs should keep closeout attention visible.');
assert.equal(clockOutAction.blocksReadiness, false, 'Missing clock-outs should not block start-of-shift readiness.');
assert.deepEqual(plain(clockOutAction.evidence), {
  type: 'missing_clock_out',
  count: 2,
  firstExceptionKey: '2026-06-26:missing_clock_out:w2',
  byType: { missing_clock_out: 2, recognition_review: 2 },
}, 'Missing clock-out evidence should preserve the exception type mix.');
const recognitionReviewAction = findAction(focusedExceptionActions, 'recognition-review');
assert.equal(recognitionReviewAction.description, '1 recognition exception needs supervisor review before closeout.');
assert.equal(recognitionReviewAction.href, '/exceptions?date=2026-06-26&status=open&type=recognition_review&exception_key=2026-06-26%3Arecognition_review%3Aa1', 'Recognition review actions should deep-link to the first filtered source exception.');
assert.equal(recognitionReviewAction.cta, 'Review recognition');
assert.equal(recognitionReviewAction.blocksCloseout, true, 'Recognition review should remain closeout work.');
assert.deepEqual(plain(recognitionReviewAction.evidence), {
  type: 'recognition_review',
  count: 1,
  firstExceptionKey: '2026-06-26:recognition_review:a1',
  byType: { missing_clock_out: 2, recognition_review: 2 },
}, 'Recognition review evidence should preserve the exact source exception key when available.');

const focusedViewerActions = buildProactiveActions({
  date: '2026-06-26',
  shiftExceptions: {
    date: '2026-06-26',
    exceptions: [
      { key: '2026-06-26:missing_clock_out:w2', type: 'missing_clock_out', status: 'open' },
      { key: '2026-06-26:recognition_review:a1', type: 'recognition_review', status: 'open' },
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
assert.equal(findAction(focusedViewerActions, 'missing-clock-outs').href, '/exceptions?date=2026-06-26&status=open&type=missing_clock_out&exception_key=2026-06-26%3Amissing_clock_out%3Aw2', 'Viewer clock-out actions should keep exact row context without write intent.');
assert.equal(findAction(focusedViewerActions, 'recognition-review').cta, 'Review recognition', 'Viewer recognition actions should keep the focused CTA.');
assert.equal(findAction(focusedViewerActions, 'recognition-review').href, '/exceptions?date=2026-06-26&status=open&type=recognition_review&exception_key=2026-06-26%3Arecognition_review%3Aa1', 'Viewer recognition actions should keep exact source exception context.');

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
const fallbackRecognitionReviewAction = findAction(allOpenTypeSummaryActions, 'recognition-review');
assert.equal(fallbackRecognitionReviewAction.href, '/exceptions?date=2026-06-26&status=open&type=recognition_review', 'Summary-only recognition actions should not invent an exact exception key.');
assert.equal(fallbackRecognitionReviewAction.evidence.firstExceptionKey, null, 'Summary-only recognition evidence should keep exact source absence explicit.');

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
assert.equal(
  buildProactiveShiftTrustPlan(staleFreshnessActions).description,
  'Main Entry kiosk is offline. Cached evidence.',
  'Shift trust plan should disclose when its recommendation is based on stale action evidence.',
);
assert.equal(buildProactiveShiftTrustPlan(staleFreshnessActions).staleLabel, 'Cached evidence', 'Shift trust plan should distinguish stale cached evidence from source-unavailable evidence.');

const unavailableTrustPlan = buildProactiveShiftTrustPlan(buildProactiveActions({
  signalFailures: [
    {
      key: 'system-health',
      label: 'Kiosk and system health',
      href: '/kiosks',
      message: 'Kiosk and system health could not refresh: 503 Service Unavailable',
    },
  ],
}));
assert.equal(unavailableTrustPlan.description, 'Kiosk and system health could not refresh: 503 Service Unavailable. Source unavailable.', 'Shift trust plan should avoid claiming cached evidence when no last success exists.');
assert.equal(unavailableTrustPlan.staleLabel, 'Source unavailable', 'Shift trust plan should label no-cache failures as source unavailable.');

const adminActions = buildProactiveActions({ ...mixedRiskPayload, currentRole: 'admin' });
assert.deepEqual(actionKeys(adminActions), actionKeys(rankedActions), 'Admin role must not change proactive action ranking.');
assert.equal(findAction(adminActions, 'shift-closeout-pending').cta, 'Review closeout', 'Admins should review closeout until the shift can complete.');
assert.deepEqual(
  plain(findAction(adminActions, 'system-health-0').actionability),
  { access: 'operate', canOperate: true, role: 'admin' },
  'Admin actionability should allow operations across proactive sources.',
);
assert.equal(findAction(adminActions, 'invalid-face').href, '/enroll?worker_id=w2', 'Admins should land on the exact invalid-face worker enrollment flow.');

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
assert.equal(findAction(enrollmentActions, 'invalid-face').href, '/enroll?worker_id=w2', 'Enrollment users should not be sent to the admin-heavy workers page or a generic enrollment flow when exact worker evidence exists.');
assert.equal(findAction(enrollmentActions, 'missing-face').href, '/enroll?worker_id=w3', 'Enrollment users should land on the exact missing-face worker enrollment flow.');
assert.equal(findAction(enrollmentActions, 'system-health-0').cta, 'Inspect readiness', 'Enrollment users should inspect admin-only kiosk readiness instead of being sent to operate it.');
assert.equal(findAction(enrollmentActions, 'system-health-0').href, '/briefing?date=2026-06-26', 'Enrollment users should keep dated briefing context when kiosk readiness is review-only.');
assert.equal(findAction(enrollmentActions, 'schedule-warning').href, '/briefing?date=2026-06-26', 'Enrollment users should keep dated briefing context when schedule actions are review-only.');
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
assert.equal(findAction(viewerActions, 'invalid-face').href, '/briefing?date=2026-06-26', 'Viewers should keep dated briefing context for enrollment issues.');
assert.equal(findAction(viewerActions, 'system-health-0').cta, 'Inspect readiness', 'Viewers should inspect kiosk readiness instead of operating it.');
assert.equal(findAction(viewerActions, 'system-health-0').href, '/briefing?date=2026-06-26', 'Viewers should keep dated briefing context for kiosk readiness.');
assert.equal(findAction(viewerActions, 'schedule-warning').href, '/briefing?date=2026-06-26', 'Viewers should keep dated briefing context for schedule warnings.');
assert.equal(findAction(viewerActions, 'not-arrived').cta, 'Review missing', 'Viewers should get read-safe missing-worker copy.');
assert.equal(findAction(viewerActions, 'not-arrived').href, '/briefing?date=2026-06-26&status=missing', 'Viewer attendance actions should keep the dated missing-worker briefing filter.');
assert.deepEqual(
  plain(findAction(viewerActions, 'shift-closeout-pending').actionability),
  { access: 'review', canOperate: false, role: 'viewer' },
  'Viewer actionability should mark write workflows as review-only.',
);
const viewerTrustPlan = buildProactiveShiftTrustPlan(viewerActions);
assert.equal(viewerTrustPlan.label, 'Review this first: Kiosk sync warning', 'Viewer shift trust plan should use review-safe language.');
assert.equal(viewerTrustPlan.href, '/briefing?date=2026-06-26', 'Viewer shift trust plan should inherit the dated role-safe review href.');
assert.equal(viewerTrustPlan.cta, 'Inspect readiness', 'Viewer shift trust plan should inherit the role-safe review CTA.');
assert.equal(viewerTrustPlan.access, 'review', 'Viewer shift trust plan should expose review access.');
assert.deepEqual(
  plain(getProactiveActionOutcomeChips(findAction(adminActions, 'system-health-0'))),
  ['Clears shift readiness', 'Clears closeout trust'],
  'Operating users should see the outcomes an action clears.',
);
assert.deepEqual(
  plain(getProactiveActionOutcomeChips(findAction(viewerActions, 'system-health-0'))),
  ['Review shift readiness', 'Review closeout trust'],
  'Review-only users should not see copy implying they can clear readiness or closeout trust.',
);
assert.deepEqual(
  plain(getProactiveActionOutcomeChips(findAction(adminActions, 'shift-closeout-pending'))),
  ['Clears closeout trust'],
  'Blocked closeout actions should emphasize closeout trust before signoff.',
);

const dashboardSource = read('src/app/page.tsx');
const portalRoleRoute = read('src/app/api/portal-role/route.ts');
const middlewareSource = read('src/middleware.ts');
assert.match(dashboardSource, /\/api\/portal-role/, 'Dashboard should resolve role through the lightweight portal role API.');
assert.match(dashboardSource, /const dashboardRole = currentRole \|\| 'viewer'/, 'Dashboard should default unresolved portal roles to review-safe actionability until role lookup confirms operator access.');
assert.match(dashboardSource, /currentRole:\s*dashboardRole/, 'Dashboard proactive actions should use the review-safe role fallback instead of raw unresolved role state.');
assert.match(dashboardSource, /buildProactiveShiftTrustPlan/, 'Dashboard should render a single next-best shift trust plan from ranked actions.');
assert.match(dashboardSource, /Next best action/, 'Dashboard should label the next-best action summary.');
assert.match(dashboardSource, /shiftTrustPlan\.href/, 'Dashboard next-best action should reuse the selected action href.');
assert.match(dashboardSource, /shiftTrustPlan\.cta/, 'Dashboard next-best action should reuse the selected action CTA.');
assert.match(dashboardSource, /shiftTrustPlan\.proofLink[\s\S]*href=\{shiftTrustPlan\.proofLink\.href\}[\s\S]*\{shiftTrustPlan\.proofLink\.label\}/, 'Dashboard next-best action should render exact source proof links when the selected action has proof.');
assert.match(dashboardSource, /const opsKioskHref = canOpenAdminOps \? '\/kiosks' : `\/briefing\?date=\$\{actionDate\}`/, 'Today Ops kiosk CTA should keep non-admin users in dated briefing review context.');
assert.match(dashboardSource, /const opsKioskCta = canOpenAdminOps \? 'Fix kiosk sync' : 'Review kiosk readiness'/, 'Today Ops kiosk CTA copy should distinguish admin operation from review mode.');
assert.match(dashboardSource, /const canOpenAdminOps = dashboardRole === 'admin'/, 'Dashboard admin-only CTAs should use the review-safe dashboard role fallback.');
assert.match(dashboardSource, /const canOpenEnrollmentOps = dashboardRole === 'admin' \|\| dashboardRole === 'enrollment'/, 'Dashboard should distinguish enrollment-capable users from review-only users after applying the safe role fallback.');
assert.match(dashboardSource, /const opsEnrollmentHref = canOpenEnrollmentOps \? '\/enroll' : `\/briefing\?date=\$\{actionDate\}`/, 'Face-service warning links should keep review-only users in dated briefing context.');
assert.match(dashboardSource, /const opsWorkerHref = canOpenAdminOps \? '\/workers' : canOpenEnrollmentOps \? '\/enroll' : `\/briefing\?date=\$\{actionDate\}`/, 'Worker-readiness links should avoid admin-only worker listing for enrollment, viewer, and unresolved roles.');
assert.match(dashboardSource, /const opsExceptionsHref = `\/exceptions\?date=\$\{actionDate\}&status=open`/, 'Today Ops exceptions CTA should preserve dated open-exception context.');
assert.match(dashboardSource, /const systemHealthCta = canOpenAdminOps \? 'Manage kiosks' : 'Review readiness'/, 'System Health CTA copy should distinguish admin operations from review mode.');
assert.match(dashboardSource, /const rosterFailureHref = canOpenAdminOps \? '\/workers' : `\/briefing\?date=\$\{actionDate\}`/, 'Worker roster failure links should avoid sending enrollment users into a generic enrollment flow without worker context.');
assert.match(dashboardSource, /const signalFailureHrefs: Partial<Record<SignalFailureKey, string>> = \{[\s\S]*workers: rosterFailureHref,[\s\S]*'system-health': opsKioskHref,[\s\S]*\}/, 'Live data gap links should downgrade worker and system-health failures to role-safe review targets.');
assert.match(dashboardSource, /href=\{opsKioskHref\}[\s\S]*\{opsKioskCta\}/, 'Today Ops should render the role-safe kiosk CTA target and copy.');
assert.match(dashboardSource, /href=\{opsExceptionsHref\}[\s\S]*Review exceptions/, 'Today Ops should render the dated open-exception CTA.');
assert.match(dashboardSource, /label: 'Face service'[\s\S]*href: opsEnrollmentHref/, 'Today Ops face-service readiness tile should use the role-safe enrollment review target.');
assert.match(dashboardSource, /label: 'Kiosks online'[\s\S]*href: opsKioskHref/, 'Today Ops kiosk readiness tile should use the same role-safe kiosk review target.');
assert.match(dashboardSource, /label: 'Workers enrolled'[\s\S]*href: opsWorkerHref/, 'Today Ops worker-readiness tile should use the role-safe worker/enrollment/review target.');
assert.match(dashboardSource, /href: warning\.includes\('Face service'\) \? opsEnrollmentHref : opsKioskHref/, 'Recent Events system warnings should reuse role-safe kiosk and enrollment review targets.');
assert.match(dashboardSource, /href=\{signalFailureHrefs\[failure\.key\] \|\| failure\.href\}/, 'Live data gap cards should render role-safe href overrides when available.');
assert.match(dashboardSource, /href=\{opsKioskHref\}[\s\S]*\{systemHealthCta\}/, 'System Health header CTA should reuse the role-safe kiosk review target and copy.');
assert.match(dashboardSource, /getActionEvidenceChips/, 'Dashboard action cards should derive compact evidence chips from existing action evidence.');
assert.match(dashboardSource, /aria-label=\{`\$\{item\.label\} evidence`\}/, 'Dashboard evidence chips should be labelled for assistive technology.');
assert.match(dashboardSource, /item\.source === 'enrollment'[\s\S]*evidence\.firstWorkerId[\s\S]*item\.actionability\.canOperate && item\.href\.startsWith\('\/enroll\?worker_id='\) \? 'Exact worker ready' : 'Worker identified'/, 'Enrollment evidence chips should disclose exact worker handoffs only when the visible action can open the exact enrollment target.');
assert.match(dashboardSource, /item\.key === 'recognition-review'[\s\S]*evidence\.firstExceptionKey[\s\S]*Exact row ready/, 'Recognition review evidence chips should disclose exact exception-row handoffs.');
assert.match(dashboardSource, /item\.source === 'closeout'[\s\S]*evidence\.firstBlockerProof[\s\S]*Exact source ready/, 'Closeout evidence chips should disclose exact closeout proof handoffs when available.');
assert.match(dashboardSource, /getProactiveActionProofLink/, 'Dashboard should derive secondary proof links from shared proactive action proof semantics.');
assert.match(dashboardSource, /proofLink && \([\s\S]*href=\{proofLink\.href\}[\s\S]*\{proofLink\.label\}/, 'Dashboard action cards should render the secondary proof link when exact source proof exists.');
assert.match(dashboardSource, /getProactiveActionOutcomeChips/, 'Dashboard action cards should derive outcome chips from the shared proactive action semantics.');
assert.match(dashboardSource, /aria-label=\{`\$\{item\.label\} outcomes`\}/, 'Dashboard outcome chips should be labelled for assistive technology.');
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
assert.equal(buildProactiveShiftTrustPlan(noActions), null, 'Clean payloads should not invent a next-best action.');

console.log('Proactive actions contract passed');
