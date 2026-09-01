import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const guides = read('src/lib/app-guides.ts');
const drawer = read('src/components/GuideDrawer.tsx');
const shell = read('src/components/AppShell.tsx');
const center = read('src/app/guide/page.tsx');
const sidebar = read('src/components/Sidebar.tsx');

for (const path of ['/', '/briefing', '/exceptions', '/closeout', '/log', '/workers', '/enroll', '/schedules', '/kiosks', '/accounts', '/calibration/recognition']) {
  assert.match(guides, new RegExp(`path: '${path.replaceAll('/', '\\/')}'`), `Guide content must cover ${path}`);
}

assert.match(shell, /<GuideDrawer \/>/, 'The app shell must expose contextual help on every authenticated page.');
assert.match(drawer, /aria-haspopup="dialog"/, 'The Help trigger must identify the guide dialog to assistive technology.');
assert.match(drawer, /aria-modal="true"/, 'The contextual guide must be presented as a modal dialog.');
assert.match(drawer, /event\.key === 'Escape'/, 'The guide drawer must support keyboard dismissal.');
assert.match(drawer, /guide\.roleNotes\?\.\[currentRole\]/, 'Contextual help must surface role-specific guidance.');
assert.match(drawer, /canRoleUseGuide\(linkedGuide, currentRole\)/, 'Related links must not advertise pages unavailable to the current role.');
assert.match(center, /The supervisor loop/, 'The Guide Center must explain the daily supervisor workflow.');
assert.match(center, /Only pages available to your account are shown/, 'The Guide Center must explain its role-aware directory.');
assert.match(sidebar, /href: '\/guide'[\s\S]*label: 'Guide Center'/, 'Navigation must provide a persistent Guide Center entry.');

console.log('Application guides contract passed');
