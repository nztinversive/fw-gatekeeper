import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

const middleware = read('src/middleware.ts');
assert.match(
  middleware,
  /getApiAllowedRoles\s*\(/,
  'middleware should derive API allowed roles per route instead of treating every /api route as admin-only',
);
assert.match(
  middleware,
  /pathname\s*===\s*['"]\/api\/enroll['"][\s\S]*\['admin',\s*'enrollment'\]/,
  'middleware should allow enrollment-role users through /api/enroll while keeping route-level validation in place',
);
assert.match(
  middleware,
  /pathname\s*===\s*['"]\/api\/workers['"][\s\S]*method\s*===\s*['"]GET['"][\s\S]*searchParams\.has\(['"]id['"]\)[\s\S]*\['admin',\s*'enrollment'\]/,
  'middleware should allow enrollment-role users to fetch a specific worker for re-enrollment lookup',
);
assert.match(
  middleware,
  /hasPortalMemberAccess\(token,\s*apiAllowedRoles\)/,
  'middleware should pass route-specific allowed roles into portal-member authorization',
);
assert.match(
  middleware,
  /hasPortalMemberAccess\(token,\s*\['admin'\]\)/,
  'middleware should still compute explicit admin status for admin-only UI/API routes',
);

const workersRoute = read('src/app/api/workers/route.ts');
assert.match(
  workersRoute,
  /requireWorkerRead\s*\(/,
  'Workers API should separate specific-worker read access from admin-only mutations/listing',
);
assert.match(
  workersRoute,
  /hasValidPortalSession\(req,\s*\['admin',\s*'enrollment'\]\)/,
  'Specific worker lookup should allow admin and enrollment roles for re-enrollment',
);
assert.match(
  workersRoute,
  /include_encodings[\s\S]*requireAdmin\(req\)/,
  'Full worker listing and include_encodings access should remain admin-only',
);
assert.match(
  workersRoute,
  /POST[\s\S]*requireAdmin\(req\)/,
  'Worker creation outside the enrollment flow must stay admin-only',
);
assert.match(
  workersRoute,
  /PATCH[\s\S]*requireAdmin\(req\)/,
  'Generic worker edits must stay admin-only; enrollment users should use /api/enroll for face re-enrollment',
);

const enrollRoute = read('src/app/api/enroll/route.ts');
assert.match(
  enrollRoute,
  /const isAdminSession = await hasValidPortalSession\(req,\s*\['admin'\]\)/,
  'Enrollment API should detect admin role separately before allowing metadata changes during re-enrollment',
);
assert.match(
  enrollRoute,
  /hasValidPortalSession\(req,\s*\['enrollment'\]\)/,
  'Enrollment API should allow enrollment-role sessions after checking admin status',
);
assert.match(
  enrollRoute,
  /if \(workerId && !isAdminSession\)[\s\S]*convex\.query\(api\.workers\.get[\s\S]*normalizedName = existingForEnrollment\.name/,
  'Enrollment-role re-enrollment should preserve existing worker name instead of allowing metadata edits through /api/enroll',
);
assert.match(
  enrollRoute,
  /employeeIdForSave = existingForEnrollment\.employee_id/,
  'Enrollment-role re-enrollment should preserve existing employee ID instead of allowing metadata edits through /api/enroll',
);
assert.match(
  enrollRoute,
  /departmentForSave = existingForEnrollment\.department/,
  'Enrollment-role re-enrollment should preserve existing department instead of allowing metadata edits through /api/enroll',
);

console.log('Enrollment permissions contract passed');
