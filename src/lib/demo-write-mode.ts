import { AttendanceCorrection, Schedule, Worker } from '@/lib/types';

type DemoKiosk = {
  id: string;
  name: string;
  kiosk_id: string | null;
  type: 'entry' | 'exit';
  location: string;
  last_sync: string | null;
  active: number;
};

type DemoCloseout = {
  date: string;
  status: 'open' | 'completed' | 'reopened';
  supervisor_name: string | null;
  notes: string | null;
  acknowledged_blockers: boolean;
  completed_at: string | null;
  updated_at: string;
};

const DEMO_WARNING = 'Demo write mode: no production Convex data was changed.';

const store = globalThis as typeof globalThis & {
  __fwDemoSchedules?: Schedule[];
  __fwDemoKiosks?: DemoKiosk[];
  __fwDemoWorkers?: Worker[];
  __fwDemoCorrections?: AttendanceCorrection[];
  __fwDemoCloseouts?: DemoCloseout[];
};

function nowIso() {
  return new Date().toISOString();
}

function demoId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isDemoWriteMode() {
  return process.env.NODE_ENV !== 'production' && process.env.FW_DEMO_WRITE_MODE === '1';
}

export function demoWriteMetadata() {
  return { demo_write: true, warning: DEMO_WARNING };
}

function schedules() {
  store.__fwDemoSchedules ||= [{
    id: 'demo_schedule_default',
    name: 'Demo Day Shift',
    days: '[1,2,3,4]',
    start_time: '07:00',
    end_time: '17:30',
    department: null,
    active: 1,
    created_at: nowIso(),
  }];
  return store.__fwDemoSchedules;
}

function kiosks() {
  store.__fwDemoKiosks ||= [
    { id: 'demo_kiosk_entry', name: 'Main Entry Demo', kiosk_id: 'demo-entry', type: 'entry', location: 'Demo', last_sync: nowIso(), active: 1 },
    { id: 'demo_kiosk_exit', name: 'Main Exit Demo', kiosk_id: 'demo-exit', type: 'exit', location: 'Demo', last_sync: nowIso(), active: 1 },
  ];
  return store.__fwDemoKiosks;
}

function workers() {
  store.__fwDemoWorkers ||= [{
    id: 'demo_worker_1',
    name: 'Synthetic Demo',
    employee_id: 'DEMO-ONLY',
    department: 'Review Lab',
    photo_url: null,
    has_face_encoding: false,
    encoding_status: 'missing',
    enrolled_at: nowIso(),
    active: 1,
  }];
  return store.__fwDemoWorkers;
}

function corrections() {
  store.__fwDemoCorrections ||= [];
  return store.__fwDemoCorrections;
}

function closeouts() {
  store.__fwDemoCloseouts ||= [];
  return store.__fwDemoCloseouts;
}

export function listDemoSchedules() {
  return [...schedules()];
}

export function createDemoSchedule(input: {
  name: string;
  days: string;
  start_time: string;
  end_time: string;
  department?: string | null;
}) {
  const created: Schedule = {
    id: demoId('demo_schedule'),
    name: input.name,
    days: input.days,
    start_time: input.start_time,
    end_time: input.end_time,
    department: input.department || null,
    active: 1,
    created_at: nowIso(),
  };
  schedules().push(created);
  return created;
}

export function updateDemoSchedule(id: string, updates: Partial<Schedule>) {
  const row = schedules().find((schedule) => schedule.id === id);
  if (!row) return null;
  Object.assign(row, updates);
  return row;
}

export function deleteDemoSchedule(id: string) {
  const rows = schedules();
  const index = rows.findIndex((schedule) => schedule.id === id);
  if (index === -1) return false;
  rows.splice(index, 1);
  return true;
}

export function listDemoKiosks() {
  return [...kiosks()];
}

export function listDemoWorkers() {
  return workers().filter((worker) => worker.active === 1).map((worker) => ({ ...worker }));
}

export function createDemoWorker(input: {
  name: string;
  employee_id?: string;
  department?: string;
  enrolled?: boolean;
}) {
  const enrolled = input.enrolled === true;
  const created: Worker = {
    id: demoId('demo_worker'),
    name: input.name,
    employee_id: input.employee_id || '',
    department: input.department || '',
    photo_url: null,
    has_face_encoding: enrolled,
    encoding_status: enrolled ? 'valid' : 'missing',
    enrolled_at: enrolled ? nowIso() : '',
    active: 1,
  };
  workers().push(created);
  return { ...created };
}

export function getDemoWorker(id: string) {
  const worker = workers().find((candidate) => candidate.id === id && candidate.active === 1);
  return worker ? { ...worker } : null;
}

export function updateDemoWorker(id: string, updates: Partial<Pick<Worker, 'name' | 'employee_id' | 'department'>>) {
  const worker = workers().find((candidate) => candidate.id === id && candidate.active === 1);
  if (!worker) return null;
  Object.assign(worker, updates);
  return { ...worker };
}

export function markDemoWorkerEnrolled(id: string) {
  const worker = workers().find((candidate) => candidate.id === id && candidate.active === 1);
  if (!worker) return null;
  worker.has_face_encoding = true;
  worker.encoding_status = 'valid';
  worker.enrolled_at = nowIso();
  return { ...worker };
}

export function deactivateDemoWorker(id: string) {
  const worker = workers().find((candidate) => candidate.id === id && candidate.active === 1);
  if (!worker) return false;
  worker.active = 0;
  return true;
}

export function createDemoKiosk(input: {
  name: string;
  kiosk_id?: string | null;
  type: 'entry' | 'exit';
  location?: string | null;
}) {
  const created: DemoKiosk = {
    id: demoId('demo_kiosk'),
    name: input.name,
    kiosk_id: input.kiosk_id || null,
    type: input.type,
    location: input.location || '',
    last_sync: nowIso(),
    active: 1,
  };
  kiosks().push(created);
  return created;
}

export function listDemoAttendanceCorrections(date: string, workerId?: string) {
  return corrections().filter((correction) => {
    return correction.date === date && (!workerId || correction.worker_id === workerId);
  });
}

export function createDemoAttendanceCorrection(input: {
  date: string;
  workerId: string;
  action: 'add_clock_in' | 'add_clock_out' | 'void_event';
  correctedTimestamp?: string;
  originalAttendanceId?: string;
  relatedExceptionKey?: string;
  reason: string;
  supervisorName?: string;
}) {
  const created: AttendanceCorrection = {
    id: demoId('demo_correction'),
    date: input.date,
    worker_id: input.workerId,
    worker_name: 'Demo worker',
    worker_department: 'Demo',
    action: input.action,
    event_type: input.action === 'add_clock_in' ? 'clock_in' : input.action === 'add_clock_out' ? 'clock_out' : null,
    corrected_timestamp: input.correctedTimestamp || null,
    original_attendance_id: input.originalAttendanceId || null,
    original_timestamp: null,
    original_event_type: null,
    related_exception_key: input.relatedExceptionKey || null,
    reason: input.reason,
    supervisor_name: input.supervisorName || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  corrections().push(created);
  return created;
}

export function getDemoCloseout(date: string) {
  return closeouts().find((closeout) => closeout.date === date) || null;
}

export function saveDemoCloseout(input: {
  date: string;
  action: 'save' | 'complete' | 'reopen';
  supervisorName?: string;
  notes?: string;
  acknowledgedBlockers?: boolean;
}) {
  const rows = closeouts();
  let row = rows.find((closeout) => closeout.date === input.date);
  const status = input.action === 'complete' ? 'completed' : input.action === 'reopen' ? 'reopened' : row?.status || 'open';
  if (!row) {
    row = {
      date: input.date,
      status,
      supervisor_name: null,
      notes: null,
      acknowledged_blockers: false,
      completed_at: null,
      updated_at: nowIso(),
    };
    rows.push(row);
  }
  row.status = status;
  row.supervisor_name = input.supervisorName || row.supervisor_name;
  row.notes = input.notes || row.notes;
  row.acknowledged_blockers = Boolean(input.acknowledgedBlockers);
  row.completed_at = input.action === 'complete' ? nowIso() : input.action === 'reopen' ? null : row.completed_at;
  row.updated_at = nowIso();
  return row;
}
