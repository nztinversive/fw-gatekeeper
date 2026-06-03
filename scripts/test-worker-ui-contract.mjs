#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const workersPage = read('src/app/workers/page.tsx');
const dashboardPage = read('src/app/page.tsx');
const types = read('src/lib/types.ts');

assert.match(
  workersPage,
  /include_encodings=true/,
  'Workers page must request encoding metadata so it can show recognition readiness.'
);
assert.match(workersPage, /Face enrolled/, 'Workers page must show a Face enrolled badge.');
assert.match(workersPage, /Missing face/, 'Workers page must show a Missing face badge.');
assert.match(workersPage, /Ready for kiosk recognition/, 'Workers page must explain that enrolled workers are kiosk-ready.');
assert.match(workersPage, /Needs enrollment/, 'Workers page must flag workers who still need enrollment.');
assert.match(workersPage, /Re-enroll/, 'Workers page must offer a re-enroll path for missing/updated face data.');
assert.match(workersPage, /grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3/, 'Workers list should be responsive cards, not a cramped row list.');

assert.match(dashboardPage, /Action Center/, 'Dashboard must include an Action Center section.');
assert.match(dashboardPage, /missingFaceWorkers/, 'Dashboard must compute missing face enrollment action items.');
assert.match(dashboardPage, /All clear/, 'Dashboard Action Center must have a positive empty state.');
assert.match(dashboardPage, /Review now/, 'Dashboard Action Center must provide a clear review CTA.');
assert.match(dashboardPage, /include_encodings=true/, 'Dashboard must request encoding metadata for action items.');

assert.match(types, /face_encoding:\s*number\[\]\s*\|\s*null/, 'Worker type should model face_encoding as number[] | null.');

console.log('Worker UI contract passed');
