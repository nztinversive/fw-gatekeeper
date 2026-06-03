#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const workersPage = read('src/app/workers/page.tsx');
const enrollPage = read('src/app/enroll/page.tsx');
const enrollRoute = read('src/app/api/enroll/route.ts');
const workersRoute = read('src/app/api/workers/route.ts');
const dashboardPage = read('src/app/page.tsx');
const convexWorkers = read('convex/workers.ts');
const types = read('src/lib/types.ts');

assert.match(
  workersPage,
  /include_encodings=true/,
  'Workers page may request encoding metadata for recognition readiness, but must not expose raw vectors outside admin worker management.'
);
assert.match(workersPage, /Face enrolled/, 'Workers page must show a Face enrolled badge.');
assert.match(workersPage, /Missing face/, 'Workers page must show a Missing face badge.');
assert.match(workersPage, /Invalid face data/, 'Workers page must distinguish invalid/corrupt face data from missing data.');
assert.match(workersPage, /Ready for kiosk recognition/, 'Workers page must explain that valid enrolled workers are kiosk-ready.');
assert.match(workersPage, /Needs enrollment/, 'Workers page must flag workers who still need enrollment.');
assert.match(workersPage, /Needs re-enrollment/, 'Workers page must flag workers with invalid face data for re-enrollment.');
assert.match(workersPage, /Re-enroll/, 'Workers page must offer a re-enroll path for missing/updated face data.');
assert.match(workersPage, /`\/enroll\?worker_id=\$\{encodeURIComponent\(w\.id\)\}`/, 'Workers page Enroll/Re-enroll CTA must pass the existing worker id.');
assert.doesNotMatch(workersPage, /href="\/enroll" className=\{`flex-1 text-center text-xs/, 'Workers page must not use a plain /enroll link for existing worker enrollment.');
assert.match(workersPage, /grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3/, 'Workers list should be responsive cards, not a cramped row list.');

assert.match(enrollPage, /useSearchParams/, 'Enroll page must read worker_id from the URL.');
assert.match(enrollPage, /\/api\/workers\?id=\$\{encodeURIComponent\(workerId\)\}/, 'Enroll page must fetch an existing worker by id for prefill.');
assert.match(enrollPage, /workerId: workerIdRef\.current/, 'Enroll submit payload must include the existing worker id when present.');
assert.match(enrollPage, /<Link href="\/enroll" className="btn-primary w-full py-3\.5 text-base block text-center">/, 'Done state must clear worker_id by navigating to a fresh /enroll URL before enrolling another person.');
assert.match(enrollRoute, /workerId\?: string/, 'Enroll API must accept an optional existing worker id.');
assert.match(enrollRoute, /api\.workers\.update/, 'Enroll API must update an existing worker when workerId is provided.');
assert.doesNotMatch(enrollRoute, /if \(existingWorker\?\.active\) \{\n\s*return NextResponse\.json\(\{ error: 'Worker name already exists' \}/, 'Enroll API must not reject the same active worker before checking workerId.');

assert.match(dashboardPage, /Action Center/, 'Dashboard must include an Action Center section.');
assert.match(dashboardPage, /missingFaceWorkers/, 'Dashboard must compute missing face enrollment action items.');
assert.match(dashboardPage, /invalidFaceWorkers/, 'Dashboard must compute invalid face data action items.');
assert.match(dashboardPage, /All clear/, 'Dashboard Action Center must have a positive empty state.');
assert.match(dashboardPage, /Review now/, 'Dashboard Action Center must provide a clear review CTA.');
assert.match(dashboardPage, /fetch\('\/api\/workers'\)/, 'Dashboard must fetch worker readiness metadata without requesting full biometric vectors.');
assert.doesNotMatch(dashboardPage, /fetch\('\/api\/workers\?include_encodings=true'\)/, 'Dashboard must not download full biometric vectors every poll.');

assert.match(convexWorkers, /encoding_status/, 'Convex worker list must expose encoding_status readiness metadata.');
assert.match(convexWorkers, /has_face_encoding/, 'Convex worker list must expose has_face_encoding readiness metadata.');
assert.match(workersRoute, /includeEncodings \? \{ face_encoding: worker\.face_encoding \}/, 'Workers API should only include raw face_encoding when explicitly requested.');
assert.match(workersRoute, /const \{ face_encoding: _faceEncoding, \.\.\.safeWorker \} = worker/, 'Workers API id prefill should strip raw face_encoding before returning worker data.');
assert.match(types, /encoding_status\?:\s*'valid'\s*\|\s*'missing'\s*\|\s*'invalid'/, 'Worker type should model encoding_status readiness metadata.');
assert.match(types, /has_face_encoding\?:\s*boolean/, 'Worker type should model has_face_encoding readiness metadata.');

console.log('Worker UI contract passed');
