'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import StatsBar from '@/components/StatsBar';
import WorkerCard from '@/components/WorkerCard';
import { DashboardSkeleton } from '@/components/Skeleton';
import { getLocalDateString } from '@/lib/date';
import { buildProactiveActions } from '@/lib/proactive-actions';

interface WorkerWithStatus {
  id: string;
  name: string;
  department: string;
  has_face_encoding?: boolean;
  encoding_status?: 'valid' | 'missing' | 'invalid';
  status: 'in' | 'out' | 'absent';
  clockInTime?: string;
}

type DashboardWorkerPayload = {
  id: string;
  name: string;
  department: string;
  has_face_encoding?: boolean;
  encoding_status?: 'valid' | 'missing' | 'invalid';
};

interface AttendanceEvent {
  id?: string;
  worker_id: string;
  worker_name?: string;
  worker_department?: string;
  event_type: 'clock_in' | 'clock_out' | string;
  timestamp: string;
  kiosk_id?: string | null;
  kiosk_name?: string | null;
}

type OpsReadinessStatus = 'ready' | 'attention' | 'critical';

interface RecentEvent {
  id: string;
  tone: 'emerald' | 'amber' | 'red' | 'slate';
  source: 'system-warning' | 'attendance';
  label: string;
  title: string;
  description: string;
  timestamp: string | null;
  href: string;
}

type HealthStatus = 'online' | 'degraded' | 'stale' | 'offline' | 'never_synced';

interface KioskHealthRow {
  id: string;
  name: string;
  kiosk_id: string | null;
  type: string;
  location: string;
  last_sync: string | null;
  status: 'online' | 'stale' | 'offline' | 'never_synced';
  expected_worker_count: number;
  last_attendance_upload: string | null;
}

interface SystemHealth {
  checked_at: string;
  portal: { status: 'online'; checked_at: string };
  face_service: {
    status: 'online' | 'degraded' | 'offline';
    latency_ms: number;
    version: string | null;
    model_ready: boolean;
  };
  kiosks: {
    total: number;
    counts: { online: number; stale: number; offline: number; never_synced: number };
    rows: KioskHealthRow[];
  };
  sync: { ready_worker_count: number; last_attendance_upload: string | null };
  warnings: string[];
}

interface ShiftExceptionsSummary {
  date: string;
  backend_unavailable?: boolean;
  warning?: string;
  summary: {
    total: number;
    open: number;
    critical: number;
    warning: number;
    info: number;
  };
}

interface ShiftCloseoutSummary {
  date: string;
  backend_unavailable?: boolean;
  warning?: string;
  closeout: {
    status: 'open' | 'completed' | 'reopened';
    completed_at: string | null;
  } | null;
  summary: {
    open_exceptions: number;
    critical_exceptions: number;
    kiosk_warnings: number;
  };
  blockers: Array<{ id: string; label: string }>;
  can_complete: boolean;
}

type SignalFailureKey = 'stats' | 'workers' | 'attendance' | 'system-health' | 'shift-exceptions' | 'shift-closeout';

interface SignalFailure {
  key: SignalFailureKey;
  label: string;
  href: string;
  message: string;
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'Never';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown';
  const diffMs = Date.now() - timestamp;
  if (diffMs < -60_000) return 'Clock skew';
  if (diffMs < 60_000) return 'Just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function healthTone(status: HealthStatus) {
  return {
    online: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    degraded: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    stale: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    offline: 'border-red-400/20 bg-red-400/10 text-red-300',
    never_synced: 'border-red-400/20 bg-red-400/10 text-red-300',
  }[status];
}

function healthLabel(status: HealthStatus) {
  return status === 'never_synced' ? 'Never synced' : status.charAt(0).toUpperCase() + status.slice(1);
}

function signalErrorMessage(label: string, error: unknown) {
  const detail = error instanceof Error ? error.message : 'Request failed';
  return `${label} could not refresh: ${detail}`;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ totalWorkers: 0, clockedIn: 0, clockedOut: 0, notArrived: 0, avgArrival: null as string | null, scheduleWarning: undefined as string | undefined });
  const [workers, setWorkers] = useState<WorkerWithStatus[]>([]);
  const [attendanceEvents, setAttendanceEvents] = useState<AttendanceEvent[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [shiftExceptions, setShiftExceptions] = useState<ShiftExceptionsSummary | null>(null);
  const [shiftCloseout, setShiftCloseout] = useState<ShiftCloseoutSummary | null>(null);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [signalFailures, setSignalFailures] = useState<SignalFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const today = getLocalDateString();
      const signals: Array<{ key: SignalFailureKey; label: string; href: string; request: () => Promise<Response> }> = [
        { key: 'stats', label: 'Dashboard stats', href: '/reports', request: () => fetch(`/api/stats?date=${today}`) },
        { key: 'workers', label: 'Worker roster', href: '/workers', request: () => fetch('/api/workers') },
        { key: 'attendance', label: 'Attendance events', href: '/log', request: () => fetch(`/api/attendance?date=${today}`) },
        { key: 'system-health', label: 'Kiosk and system health', href: '/kiosks', request: () => fetch(`/api/system-health?date=${today}`) },
        { key: 'shift-exceptions', label: 'Shift exceptions', href: '/exceptions', request: () => fetch(`/api/shift-exceptions?date=${today}`) },
        { key: 'shift-closeout', label: 'Shift closeout', href: '/closeout', request: () => fetch(`/api/shift-closeout?date=${today}`) },
      ];

      const results = await Promise.allSettled(signals.map(async (signal) => {
        const res = await signal.request();
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(json?.error || `${res.status} ${res.statusText}`);
        }
        return { signal, json };
      }));

      const failures: SignalFailure[] = [];
      let nextWorkers: DashboardWorkerPayload[] | null = null;
      let nextAttendance: AttendanceEvent[] | null = null;

      results.forEach((result, index) => {
        const signal = signals[index];
        if (result.status === 'rejected') {
          failures.push({
            key: signal.key,
            label: signal.label,
            href: signal.href,
            message: signalErrorMessage(signal.label, result.reason),
          });
          return;
        }

        const { json } = result.value;
        if (signal.key === 'stats') {
          setStats(json);
        } else if (signal.key === 'workers') {
          nextWorkers = Array.isArray(json) ? json : [];
        } else if (signal.key === 'attendance') {
          nextAttendance = Array.isArray(json) ? json : [];
          setAttendanceEvents(nextAttendance);
        } else if (signal.key === 'system-health') {
          setSystemHealth(json);
        } else if (signal.key === 'shift-exceptions') {
          setShiftExceptions(json);
        } else if (signal.key === 'shift-closeout') {
          setShiftCloseout(json);
        }
      });

      const statusMap = new Map<string, { event_type: string; timestamp: string }>();
      const attendanceForRoster = nextAttendance || attendanceEvents;
      for (const e of attendanceForRoster) {
        const existing = statusMap.get(e.worker_id);
        if (!existing || e.timestamp > existing.timestamp) {
          statusMap.set(e.worker_id, { event_type: e.event_type, timestamp: e.timestamp });
        }
      }

      const workersForRoster = nextWorkers as DashboardWorkerPayload[] | null;
      if (workersForRoster) {
        const enriched: WorkerWithStatus[] = workersForRoster.map((w) => {
          const latest = statusMap.get(w.id);
          let status: 'in' | 'out' | 'absent' = 'absent';
          let clockInTime: string | undefined;

          if (latest) {
            status = latest.event_type === 'clock_in' ? 'in' : 'out';
            clockInTime = new Date(latest.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          }

          return { ...w, status, clockInTime };
        });

        enriched.sort((a, b) => {
          const order = { in: 0, out: 1, absent: 2 };
          return order[a.status] - order[b.status];
        });

        setWorkers(enriched);
      }
      setSignalFailures(failures);
      setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
      setSignalFailures([{
        key: 'stats',
        label: 'Dashboard refresh',
        href: '/',
        message: signalErrorMessage('Dashboard refresh', err),
      }]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [attendanceEvents]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const filtered = workers.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.department.toLowerCase().includes(search.toLowerCase())
  );
  const missingFaceWorkers = workers.filter((w) => w.encoding_status === 'missing' || (!w.encoding_status && !w.has_face_encoding));
  const invalidFaceWorkers = workers.filter((w) => w.encoding_status === 'invalid');
  const absentWorkers = workers.filter((w) => w.status === 'absent');
  const failedSignalKeys = new Set(signalFailures.map((failure) => failure.key));
  const actionItems = buildProactiveActions({
    signalFailures,
    workers,
    systemHealth,
    stats,
    shiftExceptions,
    shiftCloseout,
  });

  const offlineKioskCount = systemHealth
    ? systemHealth.kiosks.counts.offline + systemHealth.kiosks.counts.never_synced
    : 0;
  const staleKioskCount = systemHealth?.kiosks.counts.stale || 0;
  const faceServiceHealthy = systemHealth?.face_service.status === 'online' && systemHealth.face_service.model_ready;
  const hasWorkerEnrollmentIssues = missingFaceWorkers.length + invalidFaceWorkers.length > 0;
  const readyForShift = Boolean(
    systemHealth &&
    faceServiceHealthy &&
    systemHealth.kiosks.total > 0 &&
    offlineKioskCount === 0 &&
    staleKioskCount === 0 &&
    !hasWorkerEnrollmentIssues
  );
  const readinessStatus: OpsReadinessStatus = !systemHealth || systemHealth.kiosks.total === 0 || stats.totalWorkers === 0 || offlineKioskCount > 0 || !faceServiceHealthy
    ? 'critical'
    : readyForShift
      ? 'ready'
      : 'attention';
  const readinessCopy = {
    ready: {
      label: 'Ready for shift',
      title: 'Employees can clock in now',
      description: 'Portal, face service, kiosk sync, and worker enrollment are all healthy.',
      tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    },
    attention: {
      label: 'Needs attention before shift',
      title: 'Review a few items before launch',
      description: 'Core services are reachable, but at least one readiness check needs review.',
      tone: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    },
    critical: {
      label: 'Not ready for shift',
      title: 'Clock-in flow needs attention',
      description: !systemHealth
        ? 'System health is unavailable, so readiness cannot be confirmed.'
        : systemHealth.kiosks.total === 0
          ? 'No kiosks are registered, so employee clock-in cannot be confirmed.'
          : stats.totalWorkers === 0
            ? 'No active workers are available for today’s clock-in readiness.'
            : offlineKioskCount > 0
              ? `${offlineKioskCount} kiosk${offlineKioskCount === 1 ? '' : 's'} are offline or have never synced.`
              : 'Face service is not fully ready for enrollment or recognition.',
      tone: 'border-red-400/25 bg-red-400/10 text-red-200',
    },
  }[readinessStatus];

  const readinessChecks = [
    { label: 'Portal', value: systemHealth ? 'Online' : 'Unknown', status: systemHealth ? 'online' as HealthStatus : 'offline' as HealthStatus, href: '/' },
    { label: 'Face service', value: systemHealth ? healthLabel(systemHealth.face_service.status) : 'Unknown', status: systemHealth?.face_service.status || 'offline' as HealthStatus, href: '/enroll' },
    { label: 'Kiosks online', value: systemHealth ? `${systemHealth.kiosks.counts.online} of ${systemHealth.kiosks.total} kiosks online` : 'Unknown', status: offlineKioskCount > 0 ? 'offline' as HealthStatus : staleKioskCount > 0 ? 'stale' as HealthStatus : 'online' as HealthStatus, href: '/kiosks' },
    { label: 'Workers enrolled', value: systemHealth ? `${systemHealth.sync.ready_worker_count} of ${stats.totalWorkers} enrolled` : `${workers.filter((w) => w.encoding_status === 'valid' || w.has_face_encoding).length} of ${stats.totalWorkers} enrolled`, status: hasWorkerEnrollmentIssues ? 'stale' as HealthStatus : 'online' as HealthStatus, href: '/workers' },
    { label: 'Exceptions', value: shiftExceptions ? `${shiftExceptions.summary.open} open exceptions` : 'Unknown', status: shiftExceptions?.summary.critical ? 'offline' as HealthStatus : shiftExceptions?.summary.open ? 'stale' as HealthStatus : 'online' as HealthStatus, href: '/exceptions' },
  ];

  const recentEvents: RecentEvent[] = [
    ...(systemHealth?.warnings || []).map((warning, index) => ({
      id: `warning-${index}`,
      tone: warning.includes('offline') || warning.includes('never synced') ? 'red' as const : 'amber' as const,
      source: 'system-warning' as const,
      label: warning.includes('Face service') ? 'System warning' : 'Kiosk timeline signal',
      title: warning.includes('Face service') ? 'Face service needs attention' : 'Kiosk sync needs attention',
      description: warning,
      timestamp: systemHealth?.checked_at || null,
      href: warning.includes('Face service') ? '/enroll' : '/kiosks',
    })),
    ...attendanceEvents.map((event) => ({
      id: event.id || `${event.worker_id}-${event.timestamp}-${event.event_type}`,
      tone: event.event_type === 'clock_in' ? 'emerald' as const : 'slate' as const,
      source: 'attendance' as const,
      label: event.event_type === 'clock_in' ? 'Clock in' : event.event_type === 'clock_out' ? 'Clock out' : 'Attendance',
      title: `${event.worker_name || 'Worker'} ${event.event_type === 'clock_in' ? 'clocked in' : event.event_type === 'clock_out' ? 'clocked out' : 'recorded an event'}`,
      description: `${event.worker_department || 'No department'}${event.kiosk_name ? ` · ${event.kiosk_name}` : event.kiosk_id ? ` · ${event.kiosk_id}` : ''}`,
      timestamp: event.timestamp,
      href: '/log',
    })),
  ]
    .sort((a, b) => {
      const bMs = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      const aMs = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    })
    .slice(0, 8);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title text-slate-100">
            Live <span className="text-gold">Dashboard</span>
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="flex items-center gap-1.5">
              <span className={`status-dot bg-emerald-400 ${refreshing ? 'refresh-pulse' : 'animate-pulse-slow'}`} />
              <span className="text-xs font-mono text-slate-500">
                {refreshing ? 'Syncing...' : signalFailures.length > 0 ? 'Partial live data' : 'Live'}
              </span>
            </span>
            {lastUpdated && (
              <span className="text-xs font-mono text-slate-600">Updated {lastUpdated}</span>
            )}
            {stats.avgArrival && (
              <span className="text-xs font-mono text-slate-600">Avg arrival {stats.avgArrival}</span>
            )}
          </div>
        </div>
      </div>

      {signalFailures.length > 0 && (
        <section role="status" className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <p className="section-label text-amber-200">Live data gaps</p>
              <h2 className="mt-1 font-display text-lg font-semibold text-amber-100">Some dashboard signals did not refresh</h2>
              <p className="mt-1 text-sm text-amber-100/75 leading-6">
                The rest of the dashboard is using the latest successful data. Review the affected source before treating this as all clear.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[520px]">
              {signalFailures.map((failure) => (
                <Link key={failure.key} href={failure.href} className="rounded-xl border border-amber-400/20 bg-navy-950/35 px-3 py-2 text-sm text-amber-100 hover:border-gold/35 transition-colors">
                  <span className="block font-display font-semibold">{failure.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-amber-100/65">{failure.message}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Today's Ops */}
      <section className={`rounded-3xl border p-5 mb-6 ${readinessCopy.tone}`}>
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-xs font-mono uppercase tracking-[0.2em] opacity-80">Today's Ops</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-semibold text-slate-100">{readinessCopy.title}</h2>
              <span className="badge border border-current/20 bg-black/10 text-current">{readinessCopy.label}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{readinessCopy.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/kiosks" className="btn-primary inline-flex px-4 py-2 text-sm">
                Fix kiosk sync
              </Link>
              <Link href="/exceptions" className="btn-secondary inline-flex px-4 py-2 text-sm">
                Review exceptions
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:min-w-[560px] gap-3">
            <div className="rounded-2xl bg-navy-950/35 border border-white/10 p-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Expected</p>
              <p className="mt-1 text-2xl font-display font-bold text-slate-100">{stats.totalWorkers}</p>
              <p className="text-[11px] text-slate-500">workers today</p>
            </div>
            <div className="rounded-2xl bg-navy-950/35 border border-white/10 p-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Arrived</p>
              <p className="mt-1 text-2xl font-display font-bold text-emerald-300">{stats.clockedIn + stats.clockedOut}</p>
              <p className="text-[11px] text-slate-500">clock events today</p>
            </div>
            <div className="rounded-2xl bg-navy-950/35 border border-white/10 p-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Not arrived</p>
              <p className="mt-1 text-2xl font-display font-bold text-amber-300">{stats.notArrived}</p>
              <p className="text-[11px] text-slate-500">no clock-in scans yet</p>
            </div>
            <div className="rounded-2xl bg-navy-950/35 border border-white/10 p-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Kiosks online</p>
              <p className="mt-1 text-2xl font-display font-bold text-slate-100">{systemHealth ? systemHealth.kiosks.counts.online : '—'}</p>
              <p className="text-[11px] text-slate-500">{systemHealth ? `of ${systemHealth.kiosks.total} connected` : 'sync unknown'}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 hidden sm:grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {readinessChecks.map((check) => (
            <Link key={check.label} href={check.href} className="rounded-2xl border border-white/10 bg-navy-950/30 p-3 hover:border-gold/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono uppercase tracking-wider text-slate-500">{check.label}</p>
                <span className={`badge border text-[10px] ${healthTone(check.status)}`}>{healthLabel(check.status)}</span>
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-slate-100">{check.value}</p>
            </Link>
          ))}
        </div>
      </section>

      <StatsBar stats={stats} />

      {/* System Health */}
      <section className="glass-card p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="section-label">System Health</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-100">Kiosk fleet & sync readiness</h2>
            <p className="mt-1 text-xs text-slate-500 font-mono">
              {systemHealth ? `Checked ${formatRelativeTime(systemHealth.checked_at)}` : 'Health check unavailable'}
            </p>
          </div>
          <Link href="/kiosks" className="btn-secondary text-xs">Manage kiosks</Link>
        </div>

        {systemHealth ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4">
                <p className="section-label">Portal</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={`badge border ${healthTone(systemHealth.portal.status)}`}>Online</span>
                  <span className="text-xs font-mono text-slate-500">Live</span>
                </div>
              </div>
              <div className="rounded-2xl border border-navy-600/50 bg-navy-900/45 p-4">
                <p className="section-label">Face service</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={`badge border ${healthTone(systemHealth.face_service.status)}`}>{healthLabel(systemHealth.face_service.status)}</span>
                  <span className="text-xs font-mono text-slate-500">{systemHealth.face_service.latency_ms}ms</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500 truncate">
                  {systemHealth.face_service.model_ready ? 'Recognition models ready' : 'Model readiness unknown'}
                </p>
              </div>
              <div className="rounded-2xl border border-navy-600/50 bg-navy-900/45 p-4">
                <p className="section-label">Kiosks</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-display font-bold text-emerald-400">{systemHealth.kiosks.counts.online}</span>
                  <span className="pb-1 text-sm text-slate-500">online / {systemHealth.kiosks.total} total</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {systemHealth.kiosks.counts.stale} stale · {systemHealth.kiosks.counts.offline + systemHealth.kiosks.counts.never_synced} offline/never
                </p>
              </div>
              <div className="rounded-2xl border border-navy-600/50 bg-navy-900/45 p-4">
                <p className="section-label">Worker data ready</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-display font-bold text-gold">{systemHealth.sync.ready_worker_count}</span>
                  <span className="pb-1 text-sm text-slate-500">workers enrolled</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Last event upload {formatRelativeTime(systemHealth.sync.last_attendance_upload)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {systemHealth.kiosks.rows.slice(0, 4).map((kiosk) => (
                <div key={kiosk.id} className="rounded-2xl border border-navy-600/45 bg-navy-900/40 p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display font-semibold text-sm text-slate-200 truncate">{kiosk.name}</h3>
                      <span className={`badge border text-[10px] ${healthTone(kiosk.status)}`}>{healthLabel(kiosk.status)}</span>
                    </div>
                    <p className="mt-1 text-xs font-mono text-slate-500 truncate">{kiosk.location || kiosk.kiosk_id || 'No location set'}</p>
                    <p className="mt-2 text-[11px] text-slate-500">Last sync {formatRelativeTime(kiosk.last_sync)} · Last upload {formatRelativeTime(kiosk.last_attendance_upload)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-display font-bold text-slate-200">{kiosk.expected_worker_count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-600">expected</p>
                  </div>
                </div>
              ))}
              {systemHealth.kiosks.rows.length === 0 && (
                <div className="rounded-2xl border border-amber-400/15 bg-amber-400/5 p-4 text-sm text-amber-200">
                  No kiosks are registered yet. Add the first kiosk before employee launch so sync health has something to monitor.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-red-400/15 bg-red-400/5 p-4 text-sm text-red-200">
            System health is unavailable right now. Refresh or open Kiosks to inspect device records.
          </div>
        )}
      </section>

      {/* Action Center */}
      <section className="glass-card p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="section-label">Proactive Action Center</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-100">Today’s decisions, ranked</h2>
            <p className="mt-1 text-xs text-slate-500 font-mono">Sorted by shift risk, readiness blockers, and closeout trust</p>
          </div>
          <span className="badge border bg-navy-900/60 text-slate-400 border-navy-600/50">
            {actionItems.length || 'All clear'}
          </span>
        </div>

        {actionItems.length === 0 ? (
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4 flex items-start gap-3">
            <span className="status-dot-pulse bg-emerald-400 mt-1.5" />
            <div>
              <p className="font-display font-semibold text-emerald-300">All clear</p>
              <p className="text-sm text-slate-500 mt-1">No enrollment, schedule, or arrival issues need review right now.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {actionItems.map((item) => {
              const tone = {
                amber: 'border-amber-400/20 bg-amber-400/5 text-amber-300',
                red: 'border-red-400/20 bg-red-400/5 text-red-300',
                slate: 'border-navy-600/50 bg-navy-900/55 text-slate-300',
              }[item.tone];
              const priorityTone = {
                critical: 'border-red-400/20 bg-red-400/10 text-red-300',
                warning: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
                closeout: 'border-blue-400/20 bg-blue-400/10 text-blue-300',
                info: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
              }[item.priority];
              return (
                <div key={item.key} className={`rounded-2xl border p-4 ${tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge border text-[10px] ${priorityTone}`}>{item.priority}</span>
                        <p className="text-xs font-mono uppercase tracking-wider opacity-80">{item.label}</p>
                      </div>
                      <p className="mt-2 text-sm leading-5 text-slate-400">{item.description}</p>
                      {(item.blocksReadiness || item.blocksCloseout) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.blocksReadiness && (
                            <span className="badge border border-red-400/15 bg-red-400/5 text-[10px] text-red-300">Blocks readiness</span>
                          )}
                          {item.blocksCloseout && (
                            <span className="badge border border-amber-400/15 bg-amber-400/5 text-[10px] text-amber-300">Blocks closeout trust</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-3xl font-display font-bold tabular-nums">{item.value}</span>
                  </div>
                  <Link href={item.href} className="mt-4 inline-flex text-xs font-semibold text-gold hover:text-gold-light">
                    {item.cta} →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Events */}
      <section className="glass-card p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="section-label">Recent Events</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-100">What just happened</h2>
            <p className="mt-1 text-xs text-slate-500 font-mono">Attendance and system signals from today</p>
          </div>
          <Link href="/log" className="btn-secondary text-xs">Open activity log</Link>
        </div>

        {recentEvents.length === 0 ? (
          <div className="rounded-2xl border border-navy-600/45 bg-navy-900/40 p-4 text-sm text-slate-400">
            No clock events yet today. Kiosk sync and recognition events will appear here as the system starts moving.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {recentEvents.map((event) => {
              const tone = {
                emerald: 'bg-emerald-400',
                amber: 'bg-amber-400',
                red: 'bg-red-400',
                slate: 'bg-slate-400',
              }[event.tone];
              return (
                <Link key={event.id} href={event.href} data-event-source={event.source} className="rounded-2xl border border-navy-600/45 bg-navy-900/40 p-4 flex items-start gap-3 hover:border-gold/30 transition-colors">
                  <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-mono uppercase tracking-wider text-slate-500">{event.label}</p>
                      <span className="text-[11px] font-mono text-slate-600 shrink-0">{formatRelativeTime(event.timestamp)}</span>
                    </div>
                    <p className="mt-1 font-display font-semibold text-sm text-slate-200 truncate">{event.title}</p>
                    <p className="mt-1 text-xs text-slate-500 truncate">{event.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Attendance roster */}
      <section className="mb-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
          <div>
            <p className="section-label">Attendance roster</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-100">Today’s workers</h2>
            <p className="mt-1 text-xs text-slate-500 font-mono">Search active workers by name or department</p>
          </div>
          <div className="relative w-full md:w-96">
            <svg className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search workers by name or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field pl-11 w-full"
            />
          </div>
        </div>
      </section>

      {/* Worker grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((w) => (
          <WorkerCard key={w.id} name={w.name} department={w.department} status={w.status} clockInTime={w.clockInTime} />
        ))}
      </div>

      {filtered.length === 0 && workers.length > 0 && (
        <div className="text-center py-12 text-slate-500">
          <svg className="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="font-display text-lg">No workers match your search</p>
          <p className="text-sm mt-1">Try a different name or department</p>
        </div>
      )}

      {workers.length === 0 && !loading && (
        <div className="text-center py-16">
          <svg className="w-16 h-16 text-slate-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={0.75} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <p className="font-display text-lg text-slate-400">
            {failedSignalKeys.has('workers') ? 'Worker roster unavailable' : 'No workers registered'}
          </p>
          <p className="text-sm text-slate-600 mt-1">
            {failedSignalKeys.has('workers')
              ? 'The roster did not refresh, so this is not a confirmed empty worker list.'
              : 'Add workers from the Workers page to see them here'}
          </p>
        </div>
      )}
    </div>
  );
}
