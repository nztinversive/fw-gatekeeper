import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);
const root = new URL('../', import.meta.url);
const at = (path) => new URL(path, root);

const packageJson = JSON.parse(read(at('package.json')));
assert.equal(
  packageJson.dependencies?.['@convex-dev/auth'],
  '^0.0.95',
  'package.json should include @convex-dev/auth so portal users can move from shared PIN to Convex Auth',
);

assert.ok(exists(at('convex/auth.ts')), 'convex/auth.ts should define the Convex Auth server config');
const convexAuth = read(at('convex/auth.ts'));
assert.match(convexAuth, /convexAuth\s*\(/, 'convex/auth.ts should call convexAuth');
assert.match(convexAuth, /providers:\s*\[\s*Password/, 'convex/auth.ts should enable a Password provider for portal login');
assert.match(convexAuth, /flow\s*===\s*'signUp'/, 'convex/auth.ts should explicitly reject public sign-up until invites are implemented');
assert.match(convexAuth, /invite-only/, 'convex/auth.ts should explain that account creation is invite-only');

assert.ok(exists(at('convex/http.ts')), 'convex/http.ts should register Convex Auth HTTP routes');
const convexHttp = read(at('convex/http.ts'));
assert.match(convexHttp, /httpRouter\s*\(/, 'convex/http.ts should create a Convex httpRouter');
assert.match(convexHttp, /auth\.addHttpRoutes\(http\)/, 'convex/http.ts should add Convex Auth HTTP routes');

assert.ok(exists(at('convex/auth.config.ts')), 'convex/auth.config.ts should register the Convex Auth JWT issuer for token validation');
const authConfig = read(at('convex/auth.config.ts'));
assert.match(authConfig, /domain:\s*process\.env\.CONVEX_SITE_URL/, 'auth.config.ts should trust the Convex site URL issuer');
assert.match(authConfig, /applicationID:\s*['"]convex['"]/, 'auth.config.ts should use the Convex Auth application id');

const schema = read(at('convex/schema.ts'));
assert.match(schema, /authTables/, 'convex/schema.ts should include Convex Auth tables');
assert.match(schema, /\.\.\.authTables/, 'convex/schema.ts should spread authTables into the schema');
assert.match(schema, /portalMembers/, 'convex/schema.ts should include portalMembers for roles around Convex Auth users');
assert.ok(exists(at('convex/portalMembers.ts')), 'Convex should expose a portalMembers query for active named-user authorization');
const portalMembers = read(at('convex/portalMembers.ts'));
assert.match(portalMembers, /getAuthUserId\(ctx\)/, 'portalMembers query should resolve the authenticated Convex Auth user id server-side');
assert.match(portalMembers, /\.query\('portalMembers'\)/, 'portalMembers query should check the portalMembers table');
assert.match(portalMembers, /member\?\.active/, 'portalMembers query should require an active member record');

assert.ok(exists(at('src/components/ConvexAuthProvider.tsx')), 'Next app should have a Convex Auth provider component');
const provider = read(at('src/components/ConvexAuthProvider.tsx'));
assert.match(provider, /ConvexAuthNextjsProvider/, 'ConvexAuthProvider should use ConvexAuthNextjsProvider');
assert.match(provider, /ConvexReactClient/, 'ConvexAuthProvider should create a ConvexReactClient');

const layout = read(at('src/app/layout.tsx'));
assert.match(layout, /ConvexAuthNextjsServerProvider/, 'Root layout should initialize Convex Auth server state');
assert.match(layout, /apiRoute="\/api\/convex-auth"/, 'Root layout should use a non-conflicting Convex Auth API route');
assert.match(layout, /ConvexAuthProvider/, 'Root layout should wrap the portal in ConvexAuthProvider');

const middleware = read(at('src/middleware.ts'));
assert.match(middleware, /convexAuthNextjsMiddleware/, 'middleware should proxy Convex Auth requests before applying legacy PIN protections');
assert.match(middleware, /\/api\/convex-auth/, 'middleware should expose the Convex Auth proxy route without colliding with PIN auth');
assert.match(middleware, /hasConvexPortalMember/, 'middleware should accept only active Convex portal members alongside legacy PIN sessions');
assert.match(middleware, /hasConvexPortalAdmin/, 'middleware should require admin role for protected API access');
assert.match(middleware, /hasPortalMemberAccess\(token, \['admin'\]\)/, 'middleware should authorize protected API access through admin portalMembers role, not authentication alone');
assert.match(middleware, /isPublicPath/, 'middleware should use exact-or-child public path matching instead of broad startsWith checks');

const portalMemberHelper = read(at('src/lib/portal-member.ts'));
assert.match(portalMemberHelper, /client\.setAuth\(token\)/, 'portal member helper should send the Convex Auth token to the Convex authorization query');
assert.match(portalMemberHelper, /portalMembers\.current/, 'portal member helper should call the Convex portalMembers.current authorization query');

const legacyLogin = read(at('src/app/api/auth/login/route.ts'));
assert.match(legacyLogin, /ADMIN_PIN/, 'First migration slice should preserve existing PIN login fallback');
assert.match(legacyLogin, /ADMIN_PIN is required in production/, 'PIN fallback should not silently use a default PIN in production');
assert.doesNotMatch(legacyLogin, /process\.env\.ADMIN_PIN\s*\|\|\s*['"]1234['"]/, 'Production PIN fallback must not be a top-level default');

const legacyAuth = read(at('src/lib/auth.ts'));
assert.match(legacyAuth, /AUTH_SECRET is required in production/, 'Legacy PIN tokens should require AUTH_SECRET in production');
assert.doesNotMatch(legacyAuth, /process\.env\.AUTH_SECRET\s*\|\|\s*process\.env\.ADMIN_PIN\s*\|\|\s*['"]dev-fw-gatekeeper-secret['"]/, 'Production token signing must not silently fall back to dev secrets');

const sidebar = read(at('src/components/Sidebar.tsx'));
assert.match(sidebar, /signOut/, 'Portal logout should clear Convex Auth sessions as well as the legacy PIN cookie');
assert.match(sidebar, /\/api\/auth\/logout/, 'Portal logout should still clear the legacy PIN cookie');
assert.doesNotMatch(sidebar, /Promise\.allSettled/, 'Portal logout should not redirect after silently ignoring Convex or legacy sign-out failures');
assert.match(sidebar, /Sign out failed/, 'Portal logout should report sign-out failures instead of leaving a Convex session active silently');

const loginPage = read(at('src/app/login/page.tsx'));
assert.match(loginPage, /useAuthActions/, 'Login page should expose Convex Auth actions alongside PIN fallback');
assert.match(loginPage, /signIn\('password'/, 'Login page should call the Convex Auth Password provider');
assert.doesNotMatch(loginPage, /flow:\s*authMode/, 'Login page should not expose public sign-up before invites/roles are enforced');
assert.doesNotMatch(loginPage, /Create account/, 'Login page should not advertise self-service account creation yet');

const workersRoute = read(at('src/app/api/workers/route.ts'));
assert.match(workersRoute, /hasValidPortalSession/, 'Workers API should accept the new portal session helper, not only the legacy PIN cookie');
assert.match(workersRoute, /hasValidPortalSession\(req, \['admin'\]\)/, 'Workers API mutations/listing should require admin portal role for Convex Auth sessions');
const portalAuth = read(at('src/lib/portal-auth.ts'));
assert.match(portalAuth, /allowedRoles/, 'Route-level portal auth should support role-restricted Convex Auth checks');
const syncRoute = read(at('src/app/api/sync/route.ts'));
assert.match(syncRoute, /hasValidPortalSession/, 'Sync API should accept portal sessions while preserving kiosk-key access');
assert.match(syncRoute, /hasValidPortalSession\(req, \['admin'\]\)/, 'Sync API human access should require admin portal role while preserving kiosk-key access');
assert.match(syncRoute, /hasValidKioskKey/, 'Sync API should preserve kiosk-key access');

console.log('Convex Auth scaffold contract passed');
