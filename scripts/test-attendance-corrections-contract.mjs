#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const schema = read('convex/schema.ts');
const attendance = read('convex/attendance.ts');
const corrections = read('convex/attendanceCorrections.ts');
const stats = read('convex/stats.ts');
const exceptions = read('convex/shiftExceptions.ts');
const briefing = read('convex/shiftBriefing.ts');
const closeouts = read('convex/shiftCloseouts.ts');
const apiRoute = read('src/app/api/attendance-corrections/route.ts');
const attendanceApi = read('src/app/api/attendance/route.ts');
const systemHealthApi = read('src/app/api/system-health/route.ts');
const exceptionsPage = read('src/app/exceptions/page.tsx');
const logPage = read('src/app/log/page.tsx');
const closeoutPage = read('src/app/closeout/page.tsx');
const middleware = read('src/middleware.ts');
const types = read('src/lib/types.ts');
const packageJson = read('package.json');

assert.match(schema, /attendanceCorrections:\s*defineTable/, 'Schema must define attendanceCorrections.');
assert.match(schema, /action:\s*v\.union\(v\.literal\("add_clock_in"\),\s*v\.literal\("add_clock_out"\),\s*v\.literal\("void_event"\)\)/, 'Corrections must support add/void actions.');
assert.match(schema, /originalAttendanceId:\s*v\.optional\(v\.id\("attendance"\)\)/, 'Void corrections must reference original attendance rows.');
assert.match(schema, /\.index\("by_date",\s*\["date"\]\)/, 'Corrections need a date index.');
assert.match(schema, /\.index\("by_worker_date",\s*\["workerId",\s*"date"\]\)/, 'Corrections need a worker/date index.');

assert.match(corrections, /export const list\s*=\s*query/, 'Attendance corrections must expose a list query.');
assert.match(corrections, /export const create\s*=\s*mutation/, 'Attendance corrections must expose a create mutation.');
assert.match(corrections, /Correction reason is required/, 'Correction writes must require a reason.');
assert.match(corrections, /originalAttendanceId is required when voiding an event/, 'Void corrections must require an original attendance id.');

assert.match(attendance, /export async function listEffectiveAttendanceByTimestampRange/, 'Attendance must expose an effective attendance helper.');
assert.match(attendance, /attendanceCorrections/, 'Effective attendance must compose correction rows.');
assert.match(attendance, /void_event/, 'Effective attendance must remove voided raw events.');
assert.match(attendance, /source:\s*"correction"/, 'Effective attendance must add synthetic correction events.');
assert.match(attendanceApi, /includeCorrections/, 'Attendance API must support corrected reads.');
assert.match(systemHealthApi, /includeCorrections:\s*false/, 'System health should keep kiosk upload evidence raw.');

assert.match(stats, /listEffectiveAttendanceByTimestampRange/, 'Stats must use effective attendance.');
assert.match(exceptions, /listEffectiveAttendanceByTimestampRange/, 'Shift exceptions must use effective attendance.');
assert.match(exceptions, /attendance_id/, 'Shift exceptions should expose attendance ids for void corrections.');
assert.match(briefing, /listEffectiveAttendanceByTimestampRange/, 'Shift briefing must use effective attendance.');
assert.match(closeouts, /attendance_corrections/, 'Closeout payload must include correction context.');

assert.match(apiRoute, /attendanceCorrections\.list/, 'GET /api/attendance-corrections must call correction list.');
assert.match(apiRoute, /attendanceCorrections\.create/, 'POST /api/attendance-corrections must call correction create.');
assert.match(apiRoute, /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment',\s*'viewer'\]\)/, 'Correction reads should allow viewers.');
assert.match(apiRoute, /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment'\]\)/, 'Correction writes should be restricted.');
assert.match(middleware, /pathname === '\/api\/attendance-corrections' && method === 'GET'[\s\S]*\['admin', 'enrollment', 'viewer'\]/, 'Middleware should permit correction reads for viewers.');
assert.match(middleware, /pathname === '\/api\/attendance-corrections' && method === 'POST'[\s\S]*\['admin', 'enrollment'\]/, 'Middleware should restrict correction writes.');

assert.match(exceptionsPage, /Correct attendance/, 'Exceptions page must expose correction actions.');
assert.match(exceptionsPage, /Save correction/, 'Exceptions page must submit corrections.');
assert.match(exceptionsPage, /Correction reason/, 'Exceptions page must require a correction reason field.');
assert.match(exceptionsPage, /Only admin or enrollment roles can correct attendance/, 'Correction modal entry should be client-guarded for read-only roles.');
assert.match(exceptionsPage, /exception\.type === 'scan_sequence'\) return Boolean\(exception\.attendance_id\)/, 'Scan-sequence corrections must only be offered when a source attendance row can be voided.');
assert.match(exceptionsPage, /function suggestedCorrectionReason/, 'Exceptions page should generate deterministic correction reason suggestions from exception evidence.');
assert.match(exceptionsPage, /existingReason \|\| suggestedCorrectionReason\(exception, suggestion\)/, 'Correction drafts should prefill blank reasons while preserving existing supervisor notes.');
assert.match(exceptionsPage, /reasonWasSuggested:\s*!existingReason/, 'Correction drafts should track whether the reason came from a suggestion.');
assert.match(exceptionsPage, /function updateCorrectionDraft/, 'Correction drafts should refresh suggested reasons when action or corrected time changes.');
assert.match(exceptionsPage, /current\.reasonWasSuggested[\s\S]*suggestedCorrectionReason\(updated\.exception, updated\)/, 'Suggested correction reasons should stay aligned until the supervisor edits the reason.');
assert.match(exceptionsPage, /reasonWasSuggested:\s*false/, 'Manual reason edits should stop automatic suggestion updates.');
assert.doesNotMatch(exceptionsPage, /event_count\} scan event/, 'Void correction suggestions should not imply all day scan events are voided.');
assert.match(exceptionsPage, /selected source scan event/, 'Void correction suggestions should describe one selected source event.');
assert.match(exceptionsPage, /Source exception \$\{exception\.key\}/, 'Suggested correction reasons should preserve the source exception key for auditability.');
assert.match(logPage, /Correction history/, 'Activity log must show correction history.');
assert.match(logPage, /\/api\/attendance-corrections\?date=\$\{date\}/, 'Activity log must fetch correction history.');
assert.match(closeoutPage, /Attendance corrections/, 'Closeout export must include correction context.');
assert.match(types, /interface AttendanceCorrection/, 'Shared types must define AttendanceCorrection.');
assert.match(types, /attendance_corrections:\s*number/, 'Shared closeout summary must include correction count.');
assert.match(packageJson, /"test:attendance-corrections":\s*"node scripts\/test-attendance-corrections-contract\.mjs"/, 'package.json must expose test:attendance-corrections.');

console.log('Attendance corrections contract passed');
