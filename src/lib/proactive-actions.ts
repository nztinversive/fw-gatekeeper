export type ProactiveActionPriority = 'critical' | 'warning' | 'closeout' | 'info';
export type ProactiveActionSeverity = 'critical' | 'warning' | 'info';
export type ProactiveActionTone = 'red' | 'amber' | 'slate';
export type ProactiveActionSource = 'service' | 'kiosk' | 'enrollment' | 'exceptions' | 'schedule' | 'signal' | 'closeout' | 'attendance';

export type SignalFailureKey = 'stats' | 'workers' | 'attendance' | 'system-health' | 'shift-exceptions' | 'shift-closeout' | string;

export interface ProactiveSignalFailure {
  key: SignalFailureKey;
  label: string;
  href: string;
  message: string;
}

export interface ProactiveWorker {
  id: string;
  name?: string;
  department?: string;
  has_face_encoding?: boolean;
  encoding_status?: 'valid' | 'missing' | 'invalid' | string;
  status?: 'in' | 'out' | 'absent' | string;
}

export interface ProactiveStats {
  totalWorkers?: number;
  notArrived?: number;
  scheduleWarning?: string;
}

export interface ProactiveSystemHealth {
  checked_at?: string;
  kiosks?: {
    total?: number;
    counts?: {
      online?: number;
      stale?: number;
      offline?: number;
      never_synced?: number;
      [key: string]: number | undefined;
    };
  };
  warnings?: string[];
}

export interface ProactiveShiftExceptions {
  date?: string;
  backend_unavailable?: boolean;
  warning?: string;
  summary?: {
    total?: number;
    open?: number;
    critical?: number;
    warning?: number;
    info?: number;
  };
}

export interface ProactiveShiftCloseout {
  date?: string;
  backend_unavailable?: boolean;
  warning?: string;
  closeout?: {
    status?: 'open' | 'completed' | 'reopened' | string;
    completed_at?: string | null;
  } | null;
  summary?: Record<string, unknown>;
  blockers?: Array<{ id?: string; label?: string }>;
  can_complete?: boolean;
}

export interface BuildProactiveActionsInput {
  signalFailures?: ProactiveSignalFailure[];
  workers?: ProactiveWorker[];
  systemHealth?: ProactiveSystemHealth | null;
  stats?: ProactiveStats;
  shiftExceptions?: ProactiveShiftExceptions | null;
  shiftCloseout?: ProactiveShiftCloseout | null;
}

export interface ProactiveAction {
  key: string;
  priority: ProactiveActionPriority;
  severity: ProactiveActionSeverity;
  tone: ProactiveActionTone;
  label: string;
  value: string | number;
  description: string;
  href: string;
  cta: string;
  source: ProactiveActionSource;
  evidence: Record<string, unknown>;
  blocksReadiness: boolean;
  blocksCloseout: boolean;
}

type DraftProactiveAction = Omit<ProactiveAction, 'priority' | 'severity' | 'tone' | 'source' | 'blocksReadiness' | 'blocksCloseout'> & {
  priority?: ProactiveActionPriority;
  severity?: ProactiveActionSeverity;
  tone?: ProactiveActionTone;
  source?: ProactiveActionSource;
  blocksReadiness?: boolean;
  blocksCloseout?: boolean;
};

type RankedProactiveAction = ProactiveAction & {
  sort: {
    priority: number;
    source: number;
    severity: number;
    original: number;
  };
};

const CRITICAL_PRIORITY: ProactiveActionPriority = 'critical';
const WARNING_PRIORITY: ProactiveActionPriority = 'warning';
const CLOSEOUT_PRIORITY: ProactiveActionPriority = 'closeout';
const INFO_PRIORITY: ProactiveActionPriority = 'info';

export const PROACTIVE_ACTION_PRIORITY_RANK = Object.freeze({
  [CRITICAL_PRIORITY]: 0,
  [WARNING_PRIORITY]: 1,
  [CLOSEOUT_PRIORITY]: 2,
  [INFO_PRIORITY]: 3,
});

const SOURCE_RANK = Object.freeze({
  service: 0,
  kiosk: 1,
  enrollment: 2,
  exceptions: 3,
  schedule: 4,
  signal: 5,
  closeout: 6,
  attendance: 7,
});

function plural(count: number, singular: string, pluralValue?: string) {
  return `${count} ${count === 1 ? singular : pluralValue || `${singular}s`}`;
}

function verb(count: number, singular: string, pluralValue: string) {
  return count === 1 ? singular : pluralValue;
}

function hasOwn(input: BuildProactiveActionsInput, key: keyof BuildProactiveActionsInput) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function getOpenExceptionCount(shiftExceptions: ProactiveShiftExceptions | null) {
  return Number(shiftExceptions?.summary?.open || 0);
}

function getCriticalExceptionCount(shiftExceptions: ProactiveShiftExceptions | null) {
  return Number(shiftExceptions?.summary?.critical || 0);
}

function isCriticalSystemWarning(warning: string) {
  const normalized = String(warning).toLowerCase();
  return (
    normalized.includes('offline') ||
    normalized.includes('never synced') ||
    normalized.includes('not ready') ||
    normalized.includes('unavailable')
  );
}

function getSignalPriority(failure: ProactiveSignalFailure): ProactiveActionPriority {
  return failure?.key === 'system-health' || failure?.key === 'workers' ? CRITICAL_PRIORITY : WARNING_PRIORITY;
}

function getSignalSource(failure: ProactiveSignalFailure): ProactiveActionSource {
  if (failure?.key === 'system-health') return 'service';
  if (failure?.key === 'workers') return 'enrollment';
  if (failure?.key === 'shift-exceptions') return 'exceptions';
  if (failure?.key === 'shift-closeout') return 'closeout';
  if (failure?.key === 'attendance') return 'attendance';
  return 'signal';
}

function getSeverityForPriority(priority: ProactiveActionPriority): ProactiveActionSeverity {
  return priority === CRITICAL_PRIORITY ? 'critical' : priority === WARNING_PRIORITY ? 'warning' : 'info';
}

function getToneForPriority(priority: ProactiveActionPriority): ProactiveActionTone {
  return priority === CRITICAL_PRIORITY ? 'red' : priority === WARNING_PRIORITY ? 'amber' : 'slate';
}

function normalizeAction(action: DraftProactiveAction, index: number): RankedProactiveAction {
  const priority = action.priority || INFO_PRIORITY;
  const severity = action.severity || getSeverityForPriority(priority);
  const source = action.source || 'signal';
  const tone = action.tone || getToneForPriority(priority);
  return {
    ...action,
    priority,
    severity,
    tone,
    source,
    blocksReadiness: Boolean(action.blocksReadiness),
    blocksCloseout: Boolean(action.blocksCloseout),
    sort: {
      priority: PROACTIVE_ACTION_PRIORITY_RANK[priority] ?? PROACTIVE_ACTION_PRIORITY_RANK[INFO_PRIORITY],
      source: SOURCE_RANK[source] ?? 99,
      severity: severity === CRITICAL_PRIORITY ? 0 : severity === WARNING_PRIORITY ? 1 : 2,
      original: index,
    },
  };
}

export function rankProactiveActions(actions: DraftProactiveAction[]): ProactiveAction[] {
  return actions
    .map(normalizeAction)
    .sort((a, b) => (
      a.sort.priority - b.sort.priority ||
      a.sort.source - b.sort.source ||
      a.sort.severity - b.sort.severity ||
      a.sort.original - b.sort.original
    ))
    .map(({ sort, ...action }) => action);
}

export function buildProactiveActions(input: BuildProactiveActionsInput = {}): ProactiveAction[] {
  const actions: DraftProactiveAction[] = [];
  const signalFailures = Array.isArray(input.signalFailures) ? input.signalFailures : [];
  const workers = Array.isArray(input.workers) ? input.workers : [];
  const systemHealth = input.systemHealth || null;
  const stats = input.stats || {};
  const shiftExceptions = input.shiftExceptions || null;
  const shiftCloseout = input.shiftCloseout || null;

  for (const failure of signalFailures) {
    const priority = getSignalPriority(failure);
    const source = getSignalSource(failure);
    actions.push({
      key: `signal-failure-${failure.key}`,
      priority,
      severity: getSeverityForPriority(priority),
      label: `${failure.label} unavailable`,
      value: '!',
      description: failure.message,
      href: failure.href,
      cta: 'Open source',
      source,
      evidence: {
        signal: failure.key,
        message: failure.message,
      },
      blocksReadiness: priority === CRITICAL_PRIORITY,
      blocksCloseout: failure.key === 'shift-exceptions' || failure.key === 'shift-closeout',
    });
  }

  const missingFaceWorkers = workers.filter((worker) => worker.encoding_status === 'missing' || (!worker.encoding_status && !worker.has_face_encoding));
  const invalidFaceWorkers = workers.filter((worker) => worker.encoding_status === 'invalid');

  if (invalidFaceWorkers.length > 0) {
    actions.push({
      key: 'invalid-face',
      priority: CRITICAL_PRIORITY,
      severity: 'critical',
      label: 'Invalid face data',
      value: invalidFaceWorkers.length,
      description: `${plural(invalidFaceWorkers.length, 'worker')} ${verb(invalidFaceWorkers.length, 'needs', 'need')} re-enrollment because their face data is not kiosk-valid.`,
      href: '/workers',
      cta: 'Review now',
      source: 'enrollment',
      evidence: {
        count: invalidFaceWorkers.length,
        workerIds: invalidFaceWorkers.map((worker) => worker.id),
      },
      blocksReadiness: true,
      blocksCloseout: false,
    });
  }

  if (missingFaceWorkers.length > 0) {
    actions.push({
      key: 'missing-face',
      priority: WARNING_PRIORITY,
      severity: 'warning',
      label: 'Face enrollment needed',
      value: missingFaceWorkers.length,
      description: `${plural(missingFaceWorkers.length, 'worker')} ${verb(missingFaceWorkers.length, 'is', 'are')} missing face data for kiosk recognition.`,
      href: '/workers',
      cta: 'Review now',
      source: 'enrollment',
      evidence: {
        count: missingFaceWorkers.length,
        workerIds: missingFaceWorkers.map((worker) => worker.id),
      },
      blocksReadiness: true,
      blocksCloseout: false,
    });
  }

  for (const [index, warning] of (systemHealth?.warnings || []).entries()) {
    const critical = isCriticalSystemWarning(warning);
    const source = String(warning).includes('Face service') ? 'service' : 'kiosk';
    actions.push({
      key: `system-health-${index}`,
      priority: critical ? CRITICAL_PRIORITY : WARNING_PRIORITY,
      severity: critical ? 'critical' : 'warning',
      label: source === 'service' ? 'Face service warning' : 'Kiosk sync warning',
      value: '!',
      description: warning,
      href: '/kiosks',
      cta: 'Open kiosks',
      source,
      evidence: {
        warning,
        kioskCounts: systemHealth?.kiosks?.counts || null,
        checkedAt: systemHealth?.checked_at || null,
      },
      blocksReadiness: true,
      blocksCloseout: source === 'kiosk',
    });
  }

  if (stats.scheduleWarning) {
    actions.push({
      key: 'schedule-warning',
      priority: WARNING_PRIORITY,
      severity: 'warning',
      label: 'Schedule warning',
      value: '!',
      description: stats.scheduleWarning,
      href: '/schedules',
      cta: 'Review now',
      source: 'schedule',
      evidence: {
        scheduleWarning: stats.scheduleWarning,
      },
      blocksReadiness: true,
      blocksCloseout: false,
    });
  }

  if (shiftExceptions?.backend_unavailable) {
    actions.push({
      key: 'shift-exceptions-unavailable',
      priority: WARNING_PRIORITY,
      severity: 'warning',
      label: 'Shift exception storage unavailable',
      value: '!',
      description: shiftExceptions.warning || 'Shift exceptions are waiting for backend storage, so today cannot be treated as all clear yet.',
      href: '/exceptions',
      cta: 'Open exceptions',
      source: 'exceptions',
      evidence: {
        backendUnavailable: true,
        warning: shiftExceptions.warning || null,
        date: shiftExceptions.date || null,
      },
      blocksReadiness: false,
      blocksCloseout: true,
    });
  }

  const openExceptions = getOpenExceptionCount(shiftExceptions);
  if (openExceptions > 0) {
    const criticalExceptions = getCriticalExceptionCount(shiftExceptions);
    const priority = criticalExceptions > 0 ? CRITICAL_PRIORITY : WARNING_PRIORITY;
    actions.push({
      key: 'shift-exceptions',
      priority,
      severity: priority === CRITICAL_PRIORITY ? 'critical' : 'warning',
      label: 'Open shift exceptions',
      value: openExceptions,
      description: `${plural(openExceptions, 'exception')} ${verb(openExceptions, 'needs', 'need')} supervisor review, including ${criticalExceptions} critical.`,
      href: '/exceptions',
      cta: 'Open exceptions',
      source: 'exceptions',
      evidence: {
        open: openExceptions,
        critical: criticalExceptions,
        warning: Number(shiftExceptions?.summary?.warning || 0),
        info: Number(shiftExceptions?.summary?.info || 0),
      },
      blocksReadiness: criticalExceptions > 0,
      blocksCloseout: true,
    });
  }

  if (hasOwn(input, 'shiftCloseout')) {
    if (shiftCloseout?.backend_unavailable) {
      actions.push({
        key: 'shift-closeout-unavailable',
        priority: WARNING_PRIORITY,
        severity: 'warning',
        label: 'Shift closeout storage unavailable',
        value: '!',
        description: shiftCloseout.warning || 'Shift closeout is waiting for backend storage, so the signoff state cannot be trusted yet.',
        href: '/closeout',
        cta: 'Open closeout',
        source: 'closeout',
        evidence: {
          backendUnavailable: true,
          warning: shiftCloseout.warning || null,
          date: shiftCloseout.date || null,
        },
        blocksReadiness: false,
        blocksCloseout: true,
      });
    }

    if (shiftCloseout?.closeout?.status === 'completed') {
      actions.push({
        key: 'shift-closeout-complete',
        priority: INFO_PRIORITY,
        severity: 'info',
        label: 'Shift closeout complete',
        value: '✓',
        description: `Today's supervisor closeout was completed${shiftCloseout.closeout.completed_at ? ` at ${new Date(shiftCloseout.closeout.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}.`,
        href: '/closeout',
        cta: 'Open closeout',
        source: 'closeout',
        evidence: {
          status: shiftCloseout.closeout.status,
          completedAt: shiftCloseout.closeout.completed_at || null,
        },
        blocksReadiness: false,
        blocksCloseout: false,
      });
    } else {
      const blockerCount = shiftCloseout?.blockers?.length || 0;
      actions.push({
        key: 'shift-closeout-pending',
        priority: CLOSEOUT_PRIORITY,
        severity: blockerCount > 0 ? 'warning' : 'info',
        label: 'Shift closeout pending',
        value: blockerCount || '!',
        description: blockerCount > 0
          ? `${plural(blockerCount, 'closeout checklist item')} ${verb(blockerCount, 'needs', 'need')} acknowledgement.`
          : 'Complete the supervisor closeout when the shift is ready to sign off.',
        href: '/closeout',
        cta: 'Close shift',
        source: 'closeout',
        evidence: {
          blockerCount,
          canComplete: Boolean(shiftCloseout?.can_complete),
          summary: shiftCloseout?.summary || null,
        },
        blocksReadiness: false,
        blocksCloseout: blockerCount > 0,
      });
    }
  }

  const absentWorkers = workers.filter((worker) => worker.status === 'absent');
  const notArrived = workers.length > 0 ? absentWorkers.length : Number(stats.notArrived || 0);
  if (notArrived > 0) {
    actions.push({
      key: 'not-arrived',
      priority: INFO_PRIORITY,
      severity: 'info',
      label: 'Not arrived today',
      value: notArrived,
      description: `${plural(notArrived, 'active worker')} ${verb(notArrived, 'has', 'have')} no clock-in scans today.`,
      href: '/log',
      cta: 'Review attendance',
      source: 'attendance',
      evidence: {
        count: notArrived,
        workerIds: absentWorkers.map((worker) => worker.id),
      },
      blocksReadiness: false,
      blocksCloseout: false,
    });
  }

  return rankProactiveActions(actions);
}
