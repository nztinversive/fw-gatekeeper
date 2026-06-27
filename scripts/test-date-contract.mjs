#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  createLocalIsoTimestamp,
  DEFAULT_FACTORY_TIME_ZONE,
  getFactoryLocalDateString,
  getLocalDateString,
  isValidLocalDateString,
  resolveRequestDate,
} from '../src/lib/date.ts';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

class LocalPartsDate extends Date {
  constructor(isoTimestamp, year, monthIndex, day) {
    super(isoTimestamp);
    this.year = year;
    this.monthIndex = monthIndex;
    this.day = day;
  }

  getFullYear() {
    return this.year;
  }

  getMonth() {
    return this.monthIndex;
  }

  getDate() {
    return this.day;
  }
}

const centralLateNight = new LocalPartsDate('2026-06-26T04:30:00.000Z', 2026, 5, 25);
assert.equal(centralLateNight.toISOString().slice(0, 10), '2026-06-26');
assert.equal(getLocalDateString(centralLateNight), '2026-06-25');
assert.equal(resolveRequestDate(new URLSearchParams(), { now: centralLateNight }), '2026-06-25');
assert.equal(DEFAULT_FACTORY_TIME_ZONE, 'America/Chicago');
assert.equal(getFactoryLocalDateString(new Date('2026-06-28T04:30:00.000Z')), '2026-06-27');
assert.equal(resolveRequestDate(new URLSearchParams(), { now: new Date('2026-06-28T04:30:00.000Z') }), '2026-06-27');
assert.equal(resolveRequestDate(new URLSearchParams(), {
  now: new Date('2026-06-28T04:30:00.000Z'),
  timeZone: 'UTC',
}), '2026-06-28');

const centralEarlyMorning = new LocalPartsDate('2026-01-01T06:15:00.000Z', 2026, 0, 1);
assert.equal(getLocalDateString(centralEarlyMorning), '2026-01-01');
assert.equal(resolveRequestDate(new URLSearchParams('date='), { now: centralEarlyMorning }), '2026-01-01');

assert.equal(resolveRequestDate(new URLSearchParams('date=2026-06-24'), { now: centralLateNight }), '2026-06-24');
assert.equal(resolveRequestDate(new URLSearchParams('shiftDate=2026-06-23'), { now: centralLateNight, param: 'shiftDate' }), '2026-06-23');
assert.equal(resolveRequestDate(new URLSearchParams('date=2026-02-29'), { now: centralLateNight }), '2026-02-29');

assert.equal(isValidLocalDateString('2026-06-25'), true);
assert.equal(isValidLocalDateString('2024-02-29'), true);
assert.equal(isValidLocalDateString('2026-02-29'), false);
assert.equal(isValidLocalDateString('2026-13-01'), false);
assert.equal(isValidLocalDateString('2026-00-10'), false);
assert.equal(isValidLocalDateString('2026-06-00'), false);
assert.equal(isValidLocalDateString('2026-6-25'), false);
assert.equal(isValidLocalDateString(' 2026-06-25'), false);
assert.equal(isValidLocalDateString(null), false);

assert.equal(createLocalIsoTimestamp('2026-06-25', '23:30'), '2026-06-25T23:30:00');
assert.equal(createLocalIsoTimestamp('2026-06-25', '05:07:09'), '2026-06-25T05:07:09');
assert.equal(createLocalIsoTimestamp('2026-01-01', '00:00').endsWith('Z'), false);
assert.throws(() => createLocalIsoTimestamp('2026-02-29', '12:00'), /date must use YYYY-MM-DD format/);
assert.throws(() => createLocalIsoTimestamp('2026-06-25', '24:00'), /time must use HH:mm or HH:mm:ss format/);
assert.throws(() => createLocalIsoTimestamp('2026-06-25', '9:00'), /time must use HH:mm or HH:mm:ss format/);

const exceptionsPage = read('src/app/exceptions/page.tsx');
assert.match(exceptionsPage, /createLocalIsoTimestamp/, 'Exception correction flow should use local timestamp construction.');
assert.doesNotMatch(exceptionsPage, /`\\$\\{date\\}T\\$\\{time\.length === 5 \? `\\$\\{time\\}:00` : time\\}\\.000Z`/, 'Correction flow must not append a fake UTC marker to local supervisor times.');

const localDefaultRoutes = [
  'src/app/api/stats/route.ts',
  'src/app/api/attendance/route.ts',
  'src/app/api/attendance-corrections/route.ts',
  'src/app/api/shift-briefing/route.ts',
  'src/app/api/shift-exceptions/route.ts',
  'src/app/api/shift-closeout/route.ts',
  'src/app/api/recognition-attempts/route.ts',
  'src/app/api/system-health/route.ts',
];

for (const route of localDefaultRoutes) {
  const source = read(route);
  assert.match(source, /resolveRequestDate/, `${route} should resolve omitted dates from the factory-local request day.`);
}

const dateHelper = read('src/lib/date.ts');
assert.match(dateHelper, /DEFAULT_FACTORY_TIME_ZONE = 'America\/Chicago'/, 'Date helper should make the factory timezone explicit.');
assert.match(dateHelper, /getFactoryLocalDateString/, 'Date helper should expose a factory-timezone date formatter.');
assert.match(dateHelper, /Intl\.DateTimeFormat\('en-US'[\s\S]*timeZone/, 'Date helper should format omitted dates in the configured factory timezone.');
assert.match(dateHelper, /return getFactoryLocalDateString\(options\.now \|\| new Date\(\), options\.timeZone\)/, 'Omitted request dates should use the factory-timezone fallback.');

for (const route of [
  'src/app/api/stats/route.ts',
  'src/app/api/attendance/route.ts',
  'src/app/api/attendance-corrections/route.ts',
  'src/app/api/recognition-attempts/route.ts',
  'src/app/api/shift-briefing/route.ts',
  'src/app/api/shift-exceptions/route.ts',
  'src/app/api/shift-closeout/route.ts',
  'src/app/api/system-health/route.ts',
]) {
  assert.match(read(route), /isValidLocalDateString/, `${route} should reject impossible calendar dates.`);
}

console.log('Date contract passed');
