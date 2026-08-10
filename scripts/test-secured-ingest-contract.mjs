import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const attendance = read('convex/attendance.ts');
const recognitionAttempts = read('convex/recognitionAttempts.ts');
const kiosks = read('convex/kiosks.ts');
const http = read('convex/http.ts');

assert.match(
  attendance,
  /export const bulkCreateFromHttp\s*=\s*internalMutation/,
  'Attendance ingest must use an internal Convex mutation.',
);
assert.match(
  recognitionAttempts,
  /export const bulkIngestFromHttp\s*=\s*internalMutation/,
  'Recognition ingest must use an internal Convex mutation.',
);
assert.match(
  kiosks,
  /export const updateLastSyncFromHttp\s*=\s*internalMutation/,
  'Kiosk lastSync ingest must use an internal Convex mutation.',
);

assert.match(http, /process\.env\.CONVEX_INGEST_KEY/, 'Convex HTTP ingest must require the server ingest key.');
assert.match(http, /request\.headers\.get\('authorization'\)/, 'Convex HTTP ingest must read bearer authorization.');
assert.match(http, /\{ error: 'Unauthorized' \}, 401/, 'Invalid Convex HTTP credentials must return 401.');
assert.match(http, /path: '\/api\/ingest\/attendance\/bulk'/, 'Attendance HTTP ingest route must be registered.');
assert.match(http, /path: '\/api\/ingest\/recognition-attempts\/bulk'/, 'Recognition HTTP ingest route must be registered.');
assert.match(http, /path: '\/api\/ingest\/kiosks\/last-sync'/, 'Kiosk sync HTTP ingest route must be registered.');

console.log('Secured Convex ingest contract passed');
