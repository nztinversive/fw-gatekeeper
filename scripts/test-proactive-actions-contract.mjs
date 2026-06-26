#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourcePath = new URL('../src/lib/proactive-actions.ts', import.meta.url);
const source = readFileSync(sourcePath, 'utf8');
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

assert.deepEqual(JSON.parse(JSON.stringify(PROACTIVE_ACTION_PRIORITY_RANK)), {
  critical: 0,
  warning: 1,
  closeout: 2,
  info: 3,
}, 'Proactive action priorities must make the ranking contract explicit.');

const rankedActions = buildProactiveActions({
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
});

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
assert.deepEqual(offlineKiosk.evidence.kioskCounts, { online: 1, stale: 0, offline: 1, never_synced: 0 }, 'Kiosk evidence must include fleet counts.');

const invalidEnrollment = rankedActions.find((action) => action.key === 'invalid-face');
assert.equal(invalidEnrollment.description, '1 worker needs re-enrollment because their face data is not kiosk-valid.');
assert.equal(invalidEnrollment.blocksReadiness, true, 'Invalid enrollment blocks readiness.');
assert.deepEqual(invalidEnrollment.evidence.workerIds, ['w2'], 'Invalid enrollment evidence should name affected workers.');

const missingEnrollment = rankedActions.find((action) => action.key === 'missing-face');
assert.equal(missingEnrollment.description, '1 worker is missing face data for kiosk recognition.');
assert.equal(missingEnrollment.priority, 'warning', 'Missing enrollment remains a warning action.');

const exceptions = rankedActions.find((action) => action.key === 'shift-exceptions');
assert.equal(exceptions.description, '3 exceptions need supervisor review, including 1 critical.');
assert.equal(exceptions.blocksCloseout, true, 'Open exceptions block closeout.');
assert.equal(exceptions.blocksReadiness, true, 'Critical exceptions block readiness.');

const closeout = rankedActions.find((action) => action.key === 'shift-closeout-pending');
assert.equal(closeout.priority, 'closeout', 'Closeout should rank after warning actions.');
assert.equal(closeout.severity, 'warning', 'Closeout with blockers should still show warning severity.');
assert.equal(closeout.description, '1 closeout checklist item needs acknowledgement.');

const notArrived = rankedActions.find((action) => action.key === 'not-arrived');
assert.equal(notArrived.priority, 'info', 'Not-arrived attendance is informational after closeout work.');
assert.equal(notArrived.description, '2 active workers have no clock-in scans today.');

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
assert.equal(backendUnavailableActions[1].description, 'Shift closeout is waiting for the Convex functions to deploy.');

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
