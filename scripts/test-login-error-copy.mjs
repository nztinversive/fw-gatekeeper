import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const helperPath = join(root, 'src/lib/convex-auth-errors.ts');
let helperSource = '';
try {
  helperSource = readFileSync(helperPath, 'utf8');
} catch {
  assert.fail('src/lib/convex-auth-errors.ts should centralize user-facing Convex Auth error copy');
}

assert.match(
  helperSource,
  /normalizeConvexAuthError/,
  'Convex Auth errors should be normalized through normalizeConvexAuthError',
);
assert.match(
  helperSource,
  /Request ID:[\s\S]*Server Error|Server Error[\s\S]*Request ID/,
  'Redacted Convex production errors with request IDs should be detected explicitly',
);
assert.match(
  helperSource,
  /Email or password was not accepted/,
  'Redacted production login errors should become actionable email/password/account copy',
);

const loginPage = readFileSync(join(root, 'src/app/login/page.tsx'), 'utf8');
assert.match(
  loginPage,
  /normalizeConvexAuthError\(message\)/,
  'Login page should display normalized Convex Auth errors instead of raw redacted Server Error text',
);
assert.doesNotMatch(
  loginPage,
  /setConvexError\(message\)/,
  'Login page should not show raw Convex Auth Server Error messages directly',
);

console.log('Login error copy contract passed');
