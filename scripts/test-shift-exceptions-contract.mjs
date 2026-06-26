#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const schema = read('convex/schema.ts');
const exceptions = read('convex/shiftExceptions.ts');
const apiRoute = read('src/app/api/shift-exceptions/route.ts');
const page = read('src/app/exceptions/page.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const dashboard = read('src/app/page.tsx');
const middleware = read('src/middleware.ts');
const types = read('src/lib/types.ts');
const proactiveActions = read('src/lib/proactive-actions.ts');

assert.match(schema, /exceptionReviews:\s*defineTable/, 'Schema must define exceptionReviews.');
assert.match(schema, /exceptionKey:\s*v\.string\(\)/, 'Exception reviews must store stable exceptionKey.');
assert.match(schema, /status:\s*v\.union\(v\.literal\("open"\),\s*v\.literal\("reviewed"\),\s*v\.literal\("ignored"\),\s*v\.literal\("resolved"\)\)/, 'Exception review status must support open/reviewed/ignored/resolved.');
assert.match(schema, /\.index\("by_key",\s*\["exceptionKey"\]\)/, 'Exception reviews need a stable key index.');
assert.match(schema, /\.index\("by_date",\s*\["date"\]\)/, 'Exception reviews need a date index.');

assert.match(exceptions, /export const summary\s*=\s*query/, 'Shift exceptions must expose a summary query.');
assert.match(exceptions, /export const review\s*=\s*mutation/, 'Shift exceptions must expose a review mutation.');
assert.match(exceptions, /getScheduleForWorker/, 'Shift exceptions should match workers against schedules.');
assert.match(exceptions, /department[\s\S]*global|todaysSchedules\.find\(\(schedule\) => !normalizeText\(schedule\.department\)\)/, 'Schedule matching should prefer department schedules and fall back to global schedules.');
assert.match(exceptions, /missing_arrival/, 'Shift exceptions must include missing arrivals.');
assert.match(exceptions, /late_arrival/, 'Shift exceptions must include late arrivals.');
assert.match(exceptions, /missing_clock_out/, 'Shift exceptions must include missing clock-out cases.');
assert.match(exceptions, /scan_sequence/, 'Shift exceptions must include bad scan sequence cases.');
assert.match(exceptions, /recognition_review/, 'Shift exceptions must include recognition review cases.');
assert.match(exceptions, /LOW_MARGIN_THRESHOLD/, 'Recognition backlog should include low-margin accepted attempts.');

assert.match(apiRoute, /shiftExceptions\.summary/, 'GET /api/shift-exceptions must call the Convex summary query.');
assert.match(apiRoute, /shiftExceptions\.review/, 'PATCH /api/shift-exceptions must call the Convex review mutation.');
assert.match(apiRoute, /FunctionPathNotFound/, 'GET route should degrade gracefully while Convex functions are waiting to deploy.');
assert.match(apiRoute, /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment',\s*'viewer'\]\)/, 'GET route should allow portal viewers.');
assert.match(apiRoute, /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment'\]\)/, 'PATCH route should restrict review actions.');

assert.match(page, /fetch\(`\/api\/shift-exceptions\?date=\$\{date\}`/, 'Exceptions page should fetch the shift exceptions API.');
assert.match(page, /useSearchParams/, 'Exceptions page must honor action-link query params.');
assert.match(page, /searchParams\.get\('date'\)/, 'Exceptions page should initialize the exception date from query params.');
assert.match(page, /searchParams\.get\('department'\)/, 'Exceptions page should initialize department filtering from query params.');
assert.match(page, /searchParams\.get\('type'\)/, 'Exceptions page should initialize type filtering from query params.');
assert.match(page, /searchParams\.get\('severity'\)/, 'Exceptions page should initialize severity filtering from query params.');
assert.match(page, /searchParams\.get\('status'\)/, 'Exceptions page should initialize status filtering from query params.');
assert.match(page, /searchParams\.get\('exception_key'\)/, 'Exceptions page should read exact exception-row action links.');
assert.match(page, /searchParams\.get\('intent'\)/, 'Exceptions page should read action intent query params.');
assert.match(page, /\/api\/portal-role/, 'Exceptions page should resolve the current portal role before exposing direct write intent.');
assert.match(page, /function canOperateExceptions/, 'Exceptions page should centralize write-role checks.');
assert.match(page, /function suggestedReviewNotes/, 'Exceptions page should provide deterministic review-note suggestions.');
assert.match(page, /function applySuggestedReviewNote/, 'Exceptions page should let operators apply suggested review notes without typing them from scratch.');
assert.match(page, /function appendReviewNote/, 'Suggested review notes should preserve existing note text instead of overwriting it.');
assert.match(page, /current\.includes\(suggestion\)/, 'Suggested review notes should not duplicate the same generated note.');
assert.match(page, /appendReviewNote\(current\[exception\.key\] \?\? exception\.review_note \?\? '', note\)/, 'Suggested review note chips should append to saved or draft notes.');
assert.match(page, /queryIntent !== 'correct'/, 'Exceptions page should only auto-open correction flow for explicit correction intents.');
assert.match(page, /handledIntentKey === queryExceptionKey/, 'Exceptions page should avoid repeatedly opening the same correction intent after refreshes.');
assert.match(page, /!canOperate \|\| !queryExceptionKey/, 'Exceptions page should not auto-open correction intent for read-only roles.');
assert.match(page, /filtered\.find\(\(exception\) => exception\.key === queryExceptionKey\)/, 'Exceptions page should only auto-open a correction target visible in the current filtered queue.');
assert.match(page, /canCorrectException\(target\)/, 'Exceptions page should only auto-open correction flow for correctable exception types.');
assert.match(page, /exception\.type === 'scan_sequence'\) return Boolean\(exception\.attendance_id\)/, 'Scan-sequence correction intent must require an attendance row to void.');
assert.match(page, /queryExceptionKey === exception\.key/, 'Exceptions page should highlight the targeted exception row.');
assert.match(page, /id=\{exceptionRowId\(exception\.key\)\}/, 'Targeted exception rows should have stable ids for direct-link scrolling.');
assert.match(page, /scrollIntoView/, 'Exceptions page should scroll direct links to the targeted row.');
assert.match(page, /canOperate \?[\s\S]*canCorrectException\(exception\)[\s\S]*Correct attendance[\s\S]*Review-only/, 'Correction buttons should only render for operating roles and correctable rows.');
assert.match(page, /if \(!canOperate\)[\s\S]*Only admin or enrollment roles can update exception reviews/, 'Exception review mutations should be guarded client-side for read-only roles.');
assert.match(page, /canOperate \?[\s\S]*Reviewed[\s\S]*Resolved[\s\S]*Ignore[\s\S]*Review-only/, 'Exceptions page should hide write controls behind role-aware rendering.');
assert.match(page, /suggestedReviewNotes\(exception\)\.map/, 'Operators should see suggested note chips for exception review rows.');
assert.match(page, /readOnly=\{!canOperate\}/, 'Viewer note fields should be read-only.');
assert.match(page, /if \(!canOperate\) return;[\s\S]*setNoteDrafts/, 'Viewer note edits should not update local draft state.');
assert.match(page, /Source exception \$\{exception\.key\}/, 'Suggested review notes should preserve source exception keys.');
assert.match(page, /Export CSV/, 'Exceptions page must provide CSV export.');
assert.match(page, /All departments/, 'Exceptions page must provide department filtering.');
assert.match(page, /All types/, 'Exceptions page must provide type filtering.');
assert.match(page, /All severity/, 'Exceptions page must provide severity filtering.');
assert.match(page, /All statuses/, 'Exceptions page must provide status filtering.');
assert.match(page, /Reviewed[\s\S]*Resolved[\s\S]*Ignore/, 'Exceptions page must expose supervisor review actions.');
assert.match(page, /No exceptions in this view/, 'Exceptions page must have an empty state.');
assert.match(page, /backend_unavailable/, 'Exceptions page should show a deployment-pending warning instead of a hard error.');

assert.match(sidebar, /href:\s*'\/exceptions'[\s\S]*label:\s*'Exceptions'/, 'Sidebar must link to the Exceptions page.');
assert.match(dashboard, /\/api\/shift-exceptions/, 'Dashboard must fetch shift exception counts.');
assert.match(dashboard, /buildProactiveActions/, 'Dashboard Action Center must use the proactive action engine.');
assert.match(proactiveActions, /Open shift exceptions/, 'Dashboard Action Center must surface open exceptions.');
assert.match(middleware, /pathname === '\/api\/shift-exceptions' && method === 'GET'[\s\S]*\['admin', 'enrollment', 'viewer'\]/, 'Middleware should permit exception reads for portal viewers.');
assert.match(middleware, /pathname === '\/api\/shift-exceptions' && method === 'PATCH'[\s\S]*\['admin', 'enrollment'\]/, 'Middleware should restrict exception review writes.');
assert.match(types, /interface ShiftException/, 'Shared types must define ShiftException.');
assert.match(types, /interface ShiftExceptionsResponse/, 'Shared types must define ShiftExceptionsResponse.');

console.log('Shift exceptions contract passed');
