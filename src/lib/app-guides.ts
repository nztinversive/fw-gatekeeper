export type GuideRole = 'admin' | 'enrollment' | 'viewer';

export type GuideLink = {
  href: string;
  label: string;
};

export type AppGuide = {
  path: string;
  title: string;
  eyebrow: string;
  purpose: string;
  steps: string[];
  tips: string[];
  related: GuideLink[];
  roles?: GuideRole[];
  roleNotes?: Partial<Record<GuideRole, string>>;
};

export const appGuides: AppGuide[] = [
  {
    path: '/',
    title: 'Dashboard',
    eyebrow: 'Your starting point',
    purpose: 'See whether today’s shift is healthy and identify the first item that needs attention.',
    steps: [
      'Check the readiness summary and system warnings first.',
      'Open the highest-priority action instead of scanning every page.',
      'Use recent activity to confirm attendance is arriving from the kiosks.',
    ],
    tips: ['Refresh if the freshness time is old.', 'Red items need action; amber items need review; green items are on track.'],
    related: [{ href: '/briefing', label: 'Open shift briefing' }, { href: '/exceptions', label: 'Review exceptions' }],
  },
  {
    path: '/briefing',
    title: 'Shift Briefing',
    eyebrow: 'Before the shift',
    purpose: 'Compare scheduled coverage with attendance, enrollment readiness, and kiosk health before work begins.',
    steps: [
      'Choose the work date and confirm the expected headcount.',
      'Read First actions from top to bottom.',
      'Open any linked worker, exception, or kiosk issue and resolve it at the source.',
      'Refresh the briefing to confirm the warning cleared.',
    ],
    tips: ['Use department filters when a supervisor owns only one area.', 'Print or export when a durable handoff is needed.'],
    related: [{ href: '/schedules', label: 'Manage schedules' }, { href: '/exceptions', label: 'Open exception queue' }],
  },
  {
    path: '/exceptions',
    title: 'Shift Exceptions',
    eyebrow: 'During the shift',
    purpose: 'Work attendance problems such as missing scans, late arrivals, bad sequences, and recognition reviews.',
    steps: [
      'Start with Critical, then work Warning items.',
      'Use the filters to narrow the queue without changing the underlying records.',
      'Open an item and compare its evidence before applying a correction.',
      'Add a clear reason, save the correction, and confirm the item resolves.',
    ],
    tips: ['Do not correct an event until the worker and timestamp are confirmed.', 'Export CSV for a supervisor handoff or audit.'],
    related: [{ href: '/log', label: 'Inspect activity evidence' }, { href: '/closeout', label: 'Review closeout' }],
    roleNotes: { viewer: 'Your account is review-only. Confirm the evidence, then hand the correction to an authorized supervisor.' },
  },
  {
    path: '/closeout',
    title: 'Shift Closeout',
    eyebrow: 'End of shift',
    purpose: 'Confirm the day is complete, record supervisor notes, and leave an auditable signoff.',
    steps: [
      'Review every checklist item and open any unresolved source link.',
      'Resolve open exceptions and workers who are still clocked in.',
      'Enter the supervisor name and useful handoff notes.',
      'Complete the closeout only after the readiness status is clear.',
    ],
    tips: ['Save notes while work is in progress.', 'Reopen a closeout if a correction must be made after signoff.'],
    related: [{ href: '/exceptions', label: 'Resolve exceptions' }, { href: '/log', label: 'Review the day’s log' }],
    roleNotes: { viewer: 'Use this page to review closeout readiness. An authorized supervisor must save notes or complete signoff.' },
  },
  {
    path: '/log',
    title: 'Activity Log',
    eyebrow: 'Attendance evidence',
    purpose: 'Inspect the effective clock-in and clock-out record and its correction history for a selected date.',
    steps: [
      'Choose the date or follow a source link from an exception.',
      'Confirm the worker, event type, time, and kiosk for the event in question.',
      'Review correction history to understand any supervisor changes.',
      'Export events or calculated hours when the record must be shared.',
    ],
    tips: ['A source-linked view highlights the relevant worker or event.', 'Attendance corrections belong in Exceptions, not directly in this table.'],
    related: [{ href: '/exceptions', label: 'Correct an exception' }, { href: '/closeout', label: 'Return to closeout' }],
  },
  {
    path: '/workers',
    title: 'Workers',
    eyebrow: 'People and recognition',
    purpose: 'Review worker records and see who is ready, missing face data, or needs re-enrollment.',
    steps: [
      'Check the recognition-ready, missing, and invalid totals.',
      'Find the person and confirm their name, employee ID, and department.',
      'Use Enroll Face for a new person or re-enroll for invalid face data.',
      'Administrators can edit worker details or deactivate old records.',
    ],
    tips: ['Employee IDs should be unique.', 'Viewers can inspect records but cannot change them.'],
    related: [{ href: '/enroll', label: 'Enroll a face' }, { href: '/calibration/recognition', label: 'Open Recognition Lab' }],
    roleNotes: {
      viewer: 'Your account can review worker readiness but cannot edit records or enroll faces.',
      enrollment: 'You can enroll and re-enroll faces. Worker detail changes require an administrator.',
    },
  },
  {
    path: '/enroll',
    title: 'Face Enrollment',
    eyebrow: 'Recognition setup',
    purpose: 'Create reliable face data so a worker can be recognized at a gate kiosk.',
    steps: [
      'Find and select the correct worker before opening the camera.',
      'Confirm the employee ID and department to avoid duplicate records.',
      'Use even front lighting and remove hats, masks, and sunglasses.',
      'Keep the face inside the guide while the photos are captured.',
      'Confirm the saved result on Workers and allow the kiosk to sync.',
    ],
    tips: ['Re-enroll instead of creating a second record.', 'If recognition remains weak, capture again in better lighting.'],
    related: [{ href: '/workers', label: 'Check worker status' }, { href: '/kiosks', label: 'Check kiosk sync' }],
    roles: ['admin', 'enrollment'],
  },
  {
    path: '/schedules',
    title: 'Schedules',
    eyebrow: 'Expected coverage',
    purpose: 'Define when departments are expected to work so briefing and exception calculations have the right baseline.',
    steps: [
      'Review the active schedules before adding another one.',
      'Set the days, start and end time, department, and effective dates.',
      'Avoid overlapping schedules for the same department unless intentional.',
      'Return to Briefing and confirm the expected coverage changed correctly.',
    ],
    tips: ['Viewers and enrollment users can review schedules; administrators manage them.', 'Use clear names that include the shift or department.'],
    related: [{ href: '/briefing', label: 'Verify shift coverage' }],
    roleNotes: {
      viewer: 'Your account can review schedules but cannot create or edit them.',
      enrollment: 'Your account can review schedules but cannot create or edit them.',
    },
  },
  {
    path: '/kiosks',
    title: 'Kiosks',
    eyebrow: 'Device readiness',
    purpose: 'Confirm gate devices are syncing workers and uploading attendance to the portal.',
    steps: [
      'Check the online, stale, offline, and never-synced totals.',
      'Open the affected kiosk and compare its last sync and upload times.',
      'Confirm its portal URL, kiosk ID, and API key configuration.',
      'Refresh after the device syncs and verify it returns online.',
    ],
    tips: ['Never paste the kiosk API key into notes or screenshots.', 'A newly enrolled worker appears after the kiosk’s next successful sync.'],
    related: [{ href: '/workers', label: 'Check ready workers' }, { href: '/', label: 'Return to dashboard' }],
    roles: ['admin'],
  },
  {
    path: '/accounts',
    title: 'Accounts',
    eyebrow: 'Portal access',
    purpose: 'Create named portal accounts and give each person only the permissions required for their job.',
    steps: [
      'Enter the person’s work email and choose the lowest sufficient role.',
      'Generate an initial password and create the account.',
      'Share credentials directly with the user, not in a public channel.',
      'Review the active user list and deactivate access that is no longer needed.',
    ],
    tips: ['Viewer is read-only; Enrollment can capture faces; Admin can change system data.', 'Use named accounts instead of shared credentials.'],
    related: [{ href: '/guide', label: 'Compare role workflows' }],
    roles: ['admin'],
  },
  {
    path: '/calibration/recognition',
    title: 'Recognition Lab',
    eyebrow: 'Recognition evidence',
    purpose: 'Investigate uncertain matches and recognition quality without changing attendance records.',
    steps: [
      'Choose the date, kiosk, or worker connected to the recognition concern.',
      'Compare the best and second-best candidates and their scores.',
      'Look for repeated low-confidence or ambiguous attempts.',
      'Re-enroll the worker or inspect the kiosk when the evidence shows a recurring problem.',
    ],
    tips: ['Use Exceptions for attendance corrections.', 'One weak attempt may be environmental; repeated weak attempts need action.'],
    related: [{ href: '/workers', label: 'Re-enroll a worker' }, { href: '/exceptions', label: 'Review attendance exceptions' }],
  },
];

export function getGuideForPath(pathname: string) {
  return appGuides.find((guide) => guide.path === pathname) ?? null;
}

export function canRoleUseGuide(guide: AppGuide, role: GuideRole | undefined) {
  return !guide.roles || (role !== undefined && guide.roles.includes(role));
}
