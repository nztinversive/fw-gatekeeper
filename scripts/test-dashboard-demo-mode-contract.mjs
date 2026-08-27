import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, root));

assert.ok(exists('src/lib/demo-write-mode.ts'), 'Demo write mode helper should centralize safe local write behavior');
assert.ok(exists('src/lib/public-convex-url.ts'), 'Local demo mode should have a client-safe Convex URL helper');
assert.ok(exists('src/components/DemoWriteModeBanner.tsx'), 'Demo write mode should have a visible reusable banner');

const dashboard = read('src/app/page.tsx');
assert.match(dashboard, /Promise\.allSettled/, 'Dashboard should fetch live signals independently');
assert.match(dashboard, /SignalFailure/, 'Dashboard should model individual signal failures');
assert.match(dashboard, /Live data gaps/, 'Dashboard should show a visible partial-data warning');
assert.match(dashboard, /Partial live data/, 'Dashboard live indicator should call out partial data');
assert.match(dashboard, /signalFreshness/, 'Dashboard should track freshness for each live signal');
assert.match(dashboard, /Refresh attempted/, 'Dashboard should not imply a partial refresh made every slice fresh');
assert.match(dashboard, /actionFreshnessBadge/, 'Dashboard action cards should visibly flag stale source data with source-aware badges');
assert.match(dashboard, /getProactiveActionFreshnessLabel/, 'Dashboard action stale badges should use shared proactive freshness semantics');
assert.match(dashboard, /System health cached/, 'Dashboard readiness should visibly flag cached system health');
assert.match(dashboard, /Attendance status cached/, 'Dashboard worker statuses should visibly flag cached attendance');
assert.match(dashboard, /buildProactiveActions\(\{\s*date:\s*actionDate,/, 'Dashboard Action Center should pass the local action date into proactive links');
assert.match(dashboard, /\/exceptions\?date=\$\{today\}&status=open/, 'Dashboard signal failures should deep-link to the dated open exception queue');
assert.match(dashboard, /\/closeout\?date=\$\{today\}/, 'Dashboard signal failures should deep-link to the dated closeout view');
assert.match(dashboard, /\/log\?date=\$\{actionDate\}/, 'Dashboard attendance links should preserve the local action date');
assert.match(dashboard, /Worker roster unavailable/, 'Dashboard should not label a failed roster fetch as an empty worker list');
assert.match(dashboard, /signalFailures\.map/, 'Dashboard failures should become operator-visible action items or links');
assert.match(read('src/components/WorkerCard.tsx'), /Cached/, 'Worker cards should have a compact stale-data marker');

const demoMode = read('src/lib/demo-write-mode.ts');
assert.match(demoMode, /FW_DEMO_WRITE_MODE/, 'Demo write mode should require an explicit server env flag');
assert.match(demoMode, /process\.env\.NODE_ENV\s*!==\s*['"]production['"]/, 'Demo write mode must be disabled in production');
assert.match(demoMode, /demo_write:\s*true/, 'Demo write responses should be machine-readable');
assert.match(demoMode, /no production Convex data was changed/i, 'Demo write responses should explain that production data was not changed');

const publicConvexUrl = read('src/lib/public-convex-url.ts');
assert.match(publicConvexUrl, /NEXT_PUBLIC_FW_DEMO_WRITE_MODE/, 'Client demo mode should boot without requiring production Convex env wiring');
assert.match(publicConvexUrl, /NODE_ENV\s*!==\s*['"]production['"]/, 'Client demo fallback must be disabled in production');
const serverConvex = read('src/lib/convex.ts');
assert.match(serverConvex, /FW_DEMO_WRITE_MODE/, 'Server Convex helper should support local demo mode without requiring production Convex env wiring');
assert.match(serverConvex, /NODE_ENV\s*!==\s*["']production["']/, 'Server demo Convex fallback must be disabled in production');
assert.match(read('src/components/ConvexAuthProvider.tsx'), /getPublicConvexUrl/, 'Convex auth provider should use the demo-safe public URL helper');
assert.match(read('src/components/ConvexAuthProvider.tsx'), /ConvexProvider/, 'Convex auth provider should bypass Convex Auth env storage only for local demo boot');
assert.match(read('src/components/ConvexAuthProvider.tsx'), /ConvexAuthNextjsProvider/, 'Convex auth provider should preserve the normal authenticated provider path');
assert.match(read('src/app/layout.tsx'), /useConvexAuthServerProvider/, 'Root layout should not render the Convex Auth server provider for local demo boot without a Convex URL');
assert.match(read('src/app/layout.tsx'), /NEXT_PUBLIC_FW_DEMO_WRITE_MODE/, 'Root layout demo-auth bypass should be gated by the public demo write flag');

const routes = [
  'src/app/api/schedules/route.ts',
  'src/app/api/kiosks/route.ts',
  'src/app/api/attendance-corrections/route.ts',
  'src/app/api/shift-closeout/route.ts',
];

for (const route of routes) {
  const source = read(route);
  assert.match(source, /isDemoWriteMode/, `${route} should branch before production writes in demo mode`);
  assert.match(source, /demoWriteMetadata/, `${route} should label demo write responses`);
  assert.match(source, /convex\.(mutation|query)/, `${route} should preserve the live Convex path outside demo mode`);
}

const systemHealth = read('src/app/api/system-health/route.ts');
assert.match(systemHealth, /listDemoKiosks/, 'System health should merge locally registered demo kiosks');
assert.match(systemHealth, /!isDemoWriteMode\(\)\s*&&\s*cached/, 'System health should avoid hiding demo kiosk writes behind the live cache');

const clientPages = [
  'src/app/schedules/page.tsx',
  'src/app/kiosks/page.tsx',
  'src/app/exceptions/page.tsx',
  'src/app/closeout/page.tsx',
  'src/app/accounts/page.tsx',
];

for (const page of clientPages) {
  assert.match(read(page), /DemoWriteModeBanner/, `${page} should warn operators when writes are local-only`);
}

const accounts = read('src/app/accounts/page.tsx');
assert.match(accounts, /NEXT_PUBLIC_FW_DEMO_WRITE_MODE/, 'Account page needs a client-visible demo flag because it normally calls Convex actions directly');
assert.match(accounts, /if\s*\(demoWriteMode\)/, 'Account page should avoid Convex account actions when demo mode is enabled');
assert.match(accounts, /Demo account ready locally|Demo password updated locally/, 'Account page should tell the operator the account write was local-only');

const login = read('src/app/login/page.tsx');
assert.match(login, /LocalDemoLogin/, 'Login page should render a local demo surface when Convex Auth is intentionally unavailable');
assert.match(login, /Continue to local demo/, 'Local demo login surface should give operators a clear way into demo flows');

const middleware = read('src/proxy.ts');
assert.match(middleware, /isLocalDemoWriteMode/, 'Middleware should have an explicit local demo bypass');
assert.match(middleware, /NextResponse\.next\(\)/, 'Local demo middleware should allow protected write-flow pages to render without a real auth session');
const portalAuth = read('src/lib/portal-auth.ts');
assert.match(portalAuth, /isDemoWriteMode\(\)[\s\S]*return true/, 'Route-level portal auth should allow local demo routes without a real auth session');
const portalRole = read('src/app/api/portal-role/route.ts');
assert.match(portalRole, /isDemoWriteMode\(\)[\s\S]*role:\s*['"]admin['"][\s\S]*source:\s*['"]local-demo['"]/, 'Portal role API should resolve an isolated local admin role so protected demo workflows can be reviewed without a real auth session');
assert.match(read('src/components/Sidebar.tsx'), /demoWriteMode \? 'skip' : \{\}/, 'Sidebar must not open a live Convex membership subscription in demo mode');

console.log('Dashboard partial-data and demo write mode contract passed');
