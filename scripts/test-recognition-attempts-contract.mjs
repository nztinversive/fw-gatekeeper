#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const schema = read('convex/schema.ts');
const attempts = read('convex/recognitionAttempts.ts');
const auth = read('src/lib/auth.ts');
const apiRoute = read('src/app/api/recognition-attempts/route.ts');
const bulkRoute = read('src/app/api/recognition-attempts/bulk/route.ts');
const page = read('src/app/calibration/recognition/page.tsx');
const sidebar = read('src/components/Sidebar.tsx');

assert.match(schema, /recognitionAttempts:\s*defineTable/, 'Schema must define recognitionAttempts.');
assert.match(schema, /timestamp:\s*v\.string\(\)/, 'Recognition attempts must store timestamp.');
assert.match(schema, /kioskId:\s*v\.string\(\)/, 'Recognition attempts must store kioskId.');
assert.match(schema, /faceDetected:\s*v\.boolean\(\)/, 'Recognition attempts must store faceDetected.');
assert.match(schema, /candidateWorkerId:\s*v\.optional\(v\.string\(\)\)/, 'Recognition attempts must store optional candidate worker id.');
assert.match(schema, /bestScore:\s*v\.optional\(v\.float64\(\)\)/, 'Recognition attempts must store optional best score.');
assert.match(schema, /scoreMargin:\s*v\.optional\(v\.float64\(\)\)/, 'Recognition attempts must store optional score margin.');
assert.match(schema, /decision:\s*v\.string\(\)/, 'Recognition attempts must store decision.');
assert.match(schema, /threshold:\s*v\.float64\(\)/, 'Recognition attempts must store threshold.');
assert.match(schema, /livenessConfirmed:\s*v\.optional\(v\.boolean\(\)\)/, 'Recognition attempts must store optional liveness confirmation.');
assert.match(schema, /modelVersion:\s*v\.optional\(v\.string\(\)\)/, 'Recognition attempts must store optional model version.');
assert.match(schema, /reviewed:\s*v\.boolean\(\)/, 'Recognition attempts must store review status.');
assert.match(schema, /reviewedLabel:\s*v\.optional\(v\.string\(\)\)/, 'Recognition attempts must store optional review label.');
assert.match(schema, /\.index\("by_timestamp",\s*\["timestamp"\]\)/, 'Recognition attempts need a timestamp index for date/range queries.');
assert.match(schema, /\.index\("by_kiosk_timestamp",\s*\["kioskId",\s*"timestamp"\]\)/, 'Recognition attempts need a kiosk/timestamp index.');
assert.match(schema, /\.index\("by_reviewed_timestamp",\s*\["reviewed",\s*"timestamp"\]\)/, 'Recognition attempts need a review/timestamp index.');
assert.match(schema, /\.index\("by_kiosk_reviewed_timestamp",\s*\["kioskId",\s*"reviewed",\s*"timestamp"\]\)/, 'Recognition attempts need a kiosk/review/timestamp index.');

assert.match(attempts, /export const bulkIngest\s*=\s*mutation/, 'Recognition attempts must expose bulkIngest mutation.');
assert.match(attempts, /export const listByDate\s*=\s*query/, 'Recognition attempts must expose listByDate query.');
assert.match(attempts, /export const listRange\s*=\s*query/, 'Recognition attempts must expose listRange query.');
assert.match(attempts, /export const listForReview\s*=\s*query/, 'Recognition attempts must expose listForReview query.');
assert.match(attempts, /export const updateReview\s*=\s*mutation/, 'Recognition attempts must expose updateReview mutation.');
assert.match(attempts, /const reviewed = attempt\.reviewed \?\? false/, 'Bulk ingest should default attempts to unreviewed.');
assert.match(attempts, /bestScore[\s\S]*secondBestScore[\s\S]*bestScore - attempt\.secondBestScore/, 'Bulk ingest should derive scoreMargin from best and second-best scores.');
assert.match(attempts, /by_source_attempt_id/, 'Bulk ingest should support sourceAttemptId idempotency.');

assert.match(auth, /\/api\/recognition-attempts\/bulk/, 'Kiosk auth allow-list must include recognition attempt bulk upload.');
assert.match(bulkRoute, /hasValidKioskKey/, 'Bulk recognition attempt upload must require a valid kiosk key.');
assert.match(bulkRoute, /recognitionAttempts\.bulkIngest/, 'Bulk recognition attempt API must call the Convex bulkIngest mutation.');
assert.match(apiRoute, /recognitionAttempts\.listByDate/, 'Recognition attempt API must call the Convex listByDate query.');
assert.match(apiRoute, /recognitionAttempts\.updateReview/, 'Recognition attempt review API must call the Convex updateReview mutation.');
assert.match(page, /RecognitionCalibrationLab/, 'Recognition calibration page must render the lab component.');
assert.match(sidebar, /\/calibration\/recognition/, 'Sidebar must link to the recognition calibration lab.');

console.log('Recognition attempts contract passed');
