#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const schema = read('convex/schema.ts');
const closeouts = read('convex/shiftCloseouts.ts');
const briefing = read('convex/shiftBriefing.ts');
const apiRoute = read('src/app/api/shift-closeout/route.ts');
const page = read('src/app/closeout/page.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const dashboard = read('src/app/page.tsx');
const middleware = read('src/middleware.ts');
const types = read('src/lib/types.ts');
const packageJson = read('package.json');
const proactiveActions = read('src/lib/proactive-actions.ts');

assert.match(schema, /shiftCloseouts:\s*defineTable/, 'Schema must define shiftCloseouts.');
assert.match(schema, /date:\s*v\.string\(\)/, 'Closeouts must be keyed by date.');
assert.match(schema, /status:\s*v\.union\(v\.literal\("open"\),\s*v\.literal\("completed"\),\s*v\.literal\("reopened"\)\)/, 'Closeout status must support open/completed/reopened.');
assert.match(schema, /acknowledgedBlockers:\s*v\.boolean\(\)/, 'Closeouts must persist blocker acknowledgement.');
assert.match(schema, /\.index\("by_date",\s*\["date"\]\)/, 'Closeouts need a date index.');

assert.match(briefing, /export async function buildShiftBriefing/, 'Shift briefing builder must be reusable by closeouts.');
assert.match(closeouts, /export const get\s*=\s*query/, 'Shift closeouts must expose a get query.');
assert.match(closeouts, /export const save\s*=\s*mutation/, 'Shift closeouts must expose a save mutation.');
assert.match(closeouts, /buildShiftBriefing/, 'Closeout should reuse briefing summary data.');
assert.match(closeouts, /buildShiftExceptions/, 'Closeout should reuse exception state.');
assert.match(closeouts, /critical_exceptions/, 'Closeout payload must track critical exceptions.');
assert.match(closeouts, /missing_clock_outs/, 'Closeout payload must track missing clock-out blockers.');
assert.match(closeouts, /recognition_reviews/, 'Closeout payload must track recognition review blockers.');
assert.match(closeouts, /kiosk_warnings/, 'Closeout payload must track kiosk warning blockers.');
assert.match(closeouts, /Closeout has blockers\. Add an acknowledgement note before completing\./, 'Closeout mutation must enforce acknowledgement notes for blockers.');
assert.match(closeouts, /buildHref\("\/exceptions",\s*\{\s*date:\s*input\.date,\s*status:\s*"open",\s*severity:\s*"critical"\s*\}\)/, 'Critical closeout blockers must deep-link to open critical exceptions for the date.');
assert.match(closeouts, /buildHref\("\/exceptions",\s*\{\s*date:\s*input\.date,\s*status:\s*"open",\s*type:\s*"missing_clock_out"\s*\}\)/, 'Missing clock-out blockers must deep-link to matching open exceptions for the date.');
assert.match(closeouts, /buildHref\("\/calibration\/recognition",\s*\{\s*date:\s*input\.date,\s*review_status:\s*"unreviewed"\s*\}\)/, 'Recognition blockers must deep-link to the dated unreviewed recognition queue.');
assert.match(closeouts, /buildHref\("\/exceptions",\s*\{\s*date,\s*status:\s*"open"\s*\}\)/, 'Closeout action links must preserve the selected date on filtered exception links.');
assert.match(closeouts, /buildHref\("\/calibration\/recognition",\s*\{\s*date,\s*review_status:\s*"unreviewed"\s*\}\)/, 'Closeout action links must preserve the selected date on recognition links.');

assert.match(apiRoute, /shiftCloseouts\.get/, 'GET /api/shift-closeout must call the Convex closeout query.');
assert.match(apiRoute, /shiftCloseouts\.save/, 'PATCH /api/shift-closeout must call the Convex closeout mutation.');
assert.match(apiRoute, /FunctionPathNotFound/, 'Closeout route should degrade gracefully while Convex functions deploy.');
assert.match(apiRoute, /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment',\s*'viewer'\]\)/, 'GET route should allow portal viewers.');
assert.match(apiRoute, /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment'\]\)/, 'PATCH route should restrict closeout writes.');
assert.match(apiRoute, /action must be save, complete, or reopen/, 'PATCH route must validate closeout actions.');

assert.match(page, /\/api\/shift-closeout\?date=\$\{date\}/, 'Closeout page must fetch the closeout API.');
assert.match(page, /Shift <span className="text-gold">Closeout<\/span>/, 'Closeout page must render the Shift Closeout surface.');
assert.match(page, /useSearchParams/, 'Closeout page must honor action-link query params.');
assert.match(page, /searchParams\.get\('date'\)/, 'Closeout page should initialize the closeout date from query params.');
assert.match(page, /Closeout checklist/, 'Closeout page must show the checklist.');
assert.match(page, /Supervisor signoff/, 'Closeout page must include supervisor signoff.');
assert.match(page, /acknowledgement note/, 'Closeout page must require acknowledgement notes for blockers.');
assert.match(page, /Complete closeout/, 'Closeout page must support completion.');
assert.match(page, /Reopen/, 'Closeout page must support reopening.');
assert.match(page, /window\.print\(\)/, 'Closeout page must support print output.');
assert.match(page, /Export/, 'Closeout page must support export.');

assert.match(sidebar, /href:\s*'\/closeout'[\s\S]*label:\s*'Closeout'/, 'Sidebar must link to the Closeout page.');
assert.match(dashboard, /\/api\/shift-closeout/, 'Dashboard must fetch shift closeout state.');
assert.match(dashboard, /buildProactiveActions/, 'Dashboard Action Center must use the proactive action engine.');
assert.match(proactiveActions, /Shift closeout pending/, 'Dashboard Action Center must surface pending closeout.');
assert.match(proactiveActions, /Shift closeout complete/, 'Dashboard Action Center must surface completed closeout.');
assert.match(middleware, /pathname === '\/api\/shift-closeout' && method === 'GET'[\s\S]*\['admin', 'enrollment', 'viewer'\]/, 'Middleware should permit closeout reads for portal viewers.');
assert.match(middleware, /pathname === '\/api\/shift-closeout' && method === 'PATCH'[\s\S]*\['admin', 'enrollment'\]/, 'Middleware should restrict closeout writes.');
assert.match(types, /interface ShiftCloseoutResponse/, 'Shared types must define ShiftCloseoutResponse.');
assert.match(types, /interface ShiftCloseoutChecklistItem/, 'Shared types must define ShiftCloseoutChecklistItem.');
assert.match(packageJson, /"test:shift-closeout":\s*"node scripts\/test-shift-closeout-contract\.mjs"/, 'package.json must expose test:shift-closeout.');

const recognitionLab = read('src/components/RecognitionCalibrationLab.tsx');
assert.match(recognitionLab, /useSearchParams/, 'Recognition Lab must honor action-link query params.');
assert.match(recognitionLab, /searchParams\.get\('date'\)/, 'Recognition Lab should initialize date filtering from query params.');
assert.match(recognitionLab, /searchParams\.get\('review_status'\)/, 'Recognition Lab should initialize review filtering from query params.');

const activityLog = read('src/app/log/page.tsx');
assert.match(activityLog, /useSearchParams/, 'Activity Log must honor dated closeout/source links.');
assert.match(activityLog, /searchParams\.get\('date'\)/, 'Activity Log should initialize date filtering from query params.');

console.log('Shift closeout contract passed');
