import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const workersPage = read('src/app/workers/page.tsx');
const workersRoute = read('src/app/api/workers/route.ts');
assert.doesNotMatch(workersPage, /include_encodings=true/, 'Portal UI must not request biometric vectors.');
assert.doesNotMatch(workersRoute, /face_encoding:\s*worker\.face_encoding/, 'Portal API must not return biometric vectors.');

const convexServer = read('src/lib/convex.ts');
const convexIngest = read('src/lib/convex-ingest.ts');
const proxy = read('src/proxy.ts');
assert.match(
  convexServer,
  /if \(isServerDemoWriteMode\(\)\)[\s\S]*Convex access is disabled in local demo mode/,
  'Local demo mode must fail closed before creating a server Convex client.',
);
assert.match(
  convexIngest,
  /assertProductionIngestAllowed[\s\S]*Secured Convex ingest is disabled in local demo mode/,
  'Local demo mode must fail closed before calling secured Convex ingest.',
);
assert.match(
  proxy,
  /FW_DEMO_WRITE_MODE[\s\S]*NEXT_PUBLIC_FW_DEMO_WRITE_MODE/,
  'Middleware auth bypass must require both server and public demo flags.',
);

const kioskApp = read('pi-kiosk/app.py');
const kioskTemplate = read('pi-kiosk/templates/index.html');
assert.match(kioskApp, /@supervisor_auth_required\s+def manual_clock/, 'Manual clock must require supervisor authentication.');
assert.match(kioskApp, /snapshot\.pop\("admin", None\)/, 'Roster metadata must be hidden before supervisor authentication.');
assert.match(kioskApp, /_supervisor_attempt_limiter\.is_locked\(\)/, 'Supervisor passcode attempts must be rate-limited.');
assert.match(kioskTemplate, /supervisor\/unlock/, 'Kiosk UI must unlock through the supervisor-auth endpoint.');
assert.doesNotMatch(kioskTemplate, /setAdminVisible\(!adminVisible\)/, 'Keyboard shortcuts must not bypass supervisor authentication.');

const demoRoutes = [
  'src/app/api/workers/route.ts',
  'src/app/api/stats/route.ts',
  'src/app/api/attendance/route.ts',
  'src/app/api/schedules/route.ts',
  'src/app/api/kiosks/route.ts',
  'src/app/api/system-health/route.ts',
  'src/app/api/shift-exceptions/route.ts',
  'src/app/api/shift-briefing/route.ts',
  'src/app/api/shift-closeout/route.ts',
  'src/app/api/recognition-attempts/route.ts',
  'src/app/api/enroll/route.ts',
  'src/app/api/worker-encode/route.ts',
  'src/app/api/attendance/bulk/route.ts',
  'src/app/api/recognition-attempts/bulk/route.ts',
  'src/app/api/sync/route.ts',
];
for (const route of demoRoutes) {
  assert.match(read(route), /isDemoWriteMode\(\)/, `${route} must provide isolated local demo data.`);
}

const visibleUi = [
  'src/app/layout.tsx',
  'src/app/login/page.tsx',
  'src/components/Sidebar.tsx',
  'src/app/not-found.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/reports/page.tsx',
  'pi-kiosk/templates/index.html',
].map(read).join('\n');
assert.match(visibleUi, /FW Gateway|Gateway Reports|FW GATEWAY/, 'Visible UI should use FW Gateway.');
assert.doesNotMatch(visibleUi, /FW Gatekeeper|Gatekeeper Reports|admin PIN/, 'Visible UI must not retain stale naming or PIN guidance.');

console.log('Launch readiness privacy, kiosk auth, demo isolation, and naming contract passed');
