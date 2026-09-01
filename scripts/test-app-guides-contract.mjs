import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const guides = read('src/lib/app-guides.ts');
const drawer = read('src/components/GuideDrawer.tsx');
const shell = read('src/components/AppShell.tsx');
const center = read('src/app/guide/page.tsx');
const sidebar = read('src/components/Sidebar.tsx');
const onboarding = read('src/components/OnboardingChecklist.tsx');

for (const path of ['/', '/briefing', '/exceptions', '/closeout', '/log', '/workers', '/enroll', '/schedules', '/kiosks', '/accounts', '/calibration/recognition']) {
  assert.match(guides, new RegExp(`path: '${path.replaceAll('/', '\\/')}'`), `Guide content must cover ${path}`);
}

assert.match(shell, /<GuideDrawer \/>/, 'The app shell must expose contextual help on every authenticated page.');
assert.match(drawer, /aria-haspopup="dialog"/, 'The Help trigger must identify the guide dialog to assistive technology.');
assert.match(drawer, /aria-modal="true"/, 'The contextual guide must be presented as a modal dialog.');
assert.match(drawer, /event\.key === 'Escape'/, 'The guide drawer must support keyboard dismissal.');
assert.match(drawer, /event\.key !== 'Tab'/, 'The guide drawer must keep keyboard focus inside the modal.');
assert.match(drawer, /wasOpenRef\.current[\s\S]*triggerRef\.current\?\.focus\(\)/, 'Closing the guide must restore focus after the modal unmounts.');
assert.match(drawer, /getGuideSteps\(guide, currentRole\)/, 'The contextual guide must render steps for the current role.');
assert.match(drawer, /guide\.roleNotes\?\.\[currentRole\]/, 'Contextual help must surface role-specific guidance.');
assert.match(drawer, /canRoleUseGuide\(linkedGuide, currentRole\)/, 'Related links must not advertise pages unavailable to the current role.');
assert.match(center, /Your Gatekeeper loop/, 'The Guide Center must explain the role-aware daily workflow.');
assert.match(center, /id="guide-search"/, 'The Guide Center must provide a labeled guide search input.');
assert.match(center, /md:hidden[\s\S]*<details/, 'Mobile guide groups must use collapsible sections.');
assert.match(center, /searchAppGuides\(query, currentRole\)/, 'Search results must respect the signed-in role.');
assert.match(onboarding, /localStorage\.setItem\(storageKey\(role\)/, 'Onboarding progress must persist separately for each role.');
assert.match(onboarding, /tasksByRole: Record<GuideRole/, 'The onboarding checklist must define tasks for every portal role.');
assert.match(onboarding, /Hide checklist/, 'The onboarding checklist must be dismissible.');
assert.match(sidebar, /href: '\/guide'[\s\S]*label: 'Guide Center'/, 'Navigation must provide a persistent Guide Center entry.');

console.log('Application guides contract passed');
