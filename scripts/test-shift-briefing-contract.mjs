#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const briefing = read('convex/shiftBriefing.ts');
const exceptions = read('convex/shiftExceptions.ts');
const apiRoute = read('src/app/api/shift-briefing/route.ts');
const page = read('src/app/briefing/page.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const middleware = read('src/middleware.ts');
const types = read('src/lib/types.ts');
const packageJson = read('package.json');

assert.match(exceptions, /export async function buildShiftExceptions/, 'Shift exceptions builder must be exported for briefing reuse.');

assert.match(briefing, /export const summary\s*=\s*query/, 'Shift briefing must expose a Convex summary query.');
assert.match(briefing, /buildShiftExceptions/, 'Shift briefing should reuse the shift exception builder.');
assert.match(briefing, /listEffectiveAttendanceByTimestampRange/, 'Shift briefing should compose effective attendance records server-side.');
assert.match(briefing, /getScheduleForWorker/, 'Shift briefing should match workers to schedules.');
assert.match(briefing, /departments/, 'Shift briefing response must include department coverage rows.');
assert.match(briefing, /action_items/, 'Shift briefing response must include prioritized action items.');
assert.match(briefing, /kiosks/, 'Shift briefing response must include kiosk trust data.');
assert.match(briefing, /No schedule is active today/, 'Shift briefing should explain missing schedule coverage.');

assert.match(apiRoute, /shiftBriefing\.summary/, 'GET /api/shift-briefing must call the Convex briefing query.');
assert.match(apiRoute, /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment',\s*'viewer'\]\)/, 'Briefing reads must allow viewer portal members.');
assert.match(apiRoute, /FunctionPathNotFound/, 'Briefing route should degrade gracefully while Convex functions deploy.');
assert.match(apiRoute, /date must use YYYY-MM-DD format/, 'Briefing route must validate date format.');

assert.match(page, /\/api\/shift-briefing\?date=\$\{date\}/, 'Briefing page must fetch the shift briefing API.');
assert.match(page, /Shift <span className="text-gold">Coverage<\/span>/, 'Briefing page must render the Shift Coverage surface.');
assert.match(page, /Coverage by department/, 'Briefing page must show department coverage.');
assert.match(page, /First actions/, 'Briefing page must show prioritized actions.');
assert.match(page, /Kiosk trust/, 'Briefing page must show kiosk trust signals.');
assert.match(page, /Export CSV/, 'Briefing page must support CSV export.');
assert.match(page, /window\.print\(\)/, 'Briefing page must support print output.');
assert.match(page, /All departments/, 'Briefing page must provide department filtering.');
assert.match(page, /Worker Status/, 'Briefing page must provide worker status filtering.');

assert.match(sidebar, /href:\s*'\/briefing'[\s\S]*label:\s*'Briefing'/, 'Sidebar must link to the briefing page.');
assert.match(middleware, /pathname === '\/api\/shift-briefing' && method === 'GET'[\s\S]*\['admin', 'enrollment', 'viewer'\]/, 'Middleware should permit briefing reads for portal viewers.');

assert.match(types, /interface ShiftBriefingResponse/, 'Shared types must define ShiftBriefingResponse.');
assert.match(types, /interface ShiftBriefingDepartment/, 'Shared types must define ShiftBriefingDepartment.');
assert.match(types, /interface ShiftBriefingActionItem/, 'Shared types must define ShiftBriefingActionItem.');

assert.match(packageJson, /"test:shift-briefing":\s*"node scripts\/test-shift-briefing-contract\.mjs"/, 'package.json must expose test:shift-briefing.');

console.log('Shift briefing contract passed');
