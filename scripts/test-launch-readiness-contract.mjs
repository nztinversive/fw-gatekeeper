import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const workersPage = read('src/app/workers/page.tsx');
const workersRoute = read('src/app/api/workers/route.ts');
assert.doesNotMatch(workersPage, /include_encodings=true/, 'Portal UI must not request biometric vectors.');
assert.doesNotMatch(workersRoute, /face_encoding:\s*worker\.face_encoding/, 'Portal API must not return biometric vectors.');

const kioskApp = read('pi-kiosk/app.py');
const kioskTemplate = read('pi-kiosk/templates/index.html');
assert.match(kioskApp, /@supervisor_auth_required\s+def manual_clock/, 'Manual clock must require supervisor authentication.');
assert.match(kioskApp, /snapshot\.pop\("admin", None\)/, 'Roster metadata must be hidden before supervisor authentication.');
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
