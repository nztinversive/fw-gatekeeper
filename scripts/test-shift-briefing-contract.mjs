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
assert.match(briefing, /getCoverageActionStatus/, 'Briefing coverage actions must choose a precise worker status filter.');
assert.match(briefing, /function getExceptionIntent/, 'Briefing exception actions should classify direct correction intents.');
assert.match(briefing, /if \(!exception\.worker_id\) return undefined/, 'Briefing correction intents should require a worker-backed exception.');
assert.match(briefing, /exception\.type === "scan_sequence"[\s\S]*exception\.attendance_id \? "correct" : undefined/, 'Briefing scan-sequence correction intents should require a source attendance row.');
assert.match(briefing, /buildHref\("\/briefing",\s*\{\s*date,\s*department:\s*row\.department,\s*status:\s*getCoverageActionStatus\(row\)/, 'Briefing coverage actions must deep-link to date, department, and worker status filters.');
assert.match(briefing, /buildHref\("\/exceptions",\s*\{\s*date,\s*status:\s*"open",\s*department:\s*exception\.department,\s*type:\s*exception\.type,\s*severity:\s*exception\.severity/, 'Briefing exception actions must deep-link to filtered open exception views.');
assert.match(briefing, /exception_key:\s*exception\.key/, 'Briefing exception actions must preserve the exact exception row key.');
assert.match(briefing, /intent:\s*getExceptionIntent\(exception\)/, 'Briefing correctable exception actions should carry correction intent.');
assert.match(briefing, /encodeURIComponent/, 'Shift briefing action links must encode filter query params.');

assert.match(apiRoute, /shiftBriefing\.summary/, 'GET /api/shift-briefing must call the Convex briefing query.');
assert.match(apiRoute, /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment',\s*'viewer'\]\)/, 'Briefing reads must allow viewer portal members.');
assert.match(apiRoute, /FunctionPathNotFound/, 'Briefing route should degrade gracefully while Convex functions deploy.');
assert.match(apiRoute, /date must use YYYY-MM-DD format/, 'Briefing route must validate date format.');

assert.match(page, /\/api\/shift-briefing\?date=\$\{date\}/, 'Briefing page must fetch the shift briefing API.');
assert.match(page, /Shift <span className="text-gold">Coverage<\/span>/, 'Briefing page must render the Shift Coverage surface.');
assert.match(page, /useSearchParams/, 'Briefing page must honor action-link query params.');
assert.match(page, /searchParams\.get\('date'\)/, 'Briefing page should initialize the briefing date from query params.');
assert.match(page, /searchParams\.get\('department'\)/, 'Briefing page should initialize department filtering from query params.');
assert.match(page, /searchParams\.get\('status'\)/, 'Briefing page should initialize worker status filtering from query params.');
assert.match(page, /\/api\/portal-role/, 'Briefing page should resolve portal role before exposing direct action intent.');
assert.match(page, /function canOperateBriefingAction/, 'Briefing page should centralize per-action role checks.');
assert.match(page, /role === 'admin'[\s\S]*role !== 'enrollment'[\s\S]*href\.startsWith\('\/exceptions'\) \|\| href\.startsWith\('\/briefing'\)/, 'Enrollment briefing actions should be limited to exceptions and briefing filters.');
assert.match(page, /function stripHrefParams/, 'Briefing page should be able to strip write intent from review links.');
assert.match(page, /href\.startsWith\('\/exceptions'\)[\s\S]*stripHrefParams\(href, \['intent'\]\)/, 'Viewer exception briefing actions should preserve row context but remove correction intent.');
assert.match(page, /href === '\/kiosks' \|\| href === '\/schedules'[\s\S]*`\/briefing\?date=\$\{date\}`/, 'Review-only admin-heavy briefing actions should remain in the dated briefing context.');
assert.match(page, /const canOperateAction = canOperateBriefingAction\(currentRole, item\.href\)/, 'Briefing action cards should decide operate/review state per item.');
assert.match(page, /href=\{canOperateAction \? item\.href : getReviewHref\(item\.href, date\)\}/, 'Briefing action cards should downgrade hrefs for read-only roles.');
assert.match(page, /Review-only/, 'Briefing action cards should label read-only action handoffs.');
assert.match(page, /canOperateAction \? 'Open action' : 'Review source'/, 'Briefing action card copy should distinguish operate and review handoffs.');
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
