'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import StatsBar from '@/components/StatsBar';
import WorkerCard from '@/components/WorkerCard';
import { DashboardSkeleton } from '@/components/Skeleton';
import { getLocalDateString } from '@/lib/date';

interface WorkerWithStatus {
  id: string;
  name: string;
  department: string;
  has_face_encoding?: boolean;
  encoding_status?: 'valid' | 'missing' | 'invalid';
  status: 'in' | 'out' | 'absent';
  clockInTime?: string;
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

export default function Dashboard() {
  const [stats, setStats] = useState({ totalWorkers: 0, clockedIn: 0, clockedOut: 0, notArrived: 0, avgArrival: null as string | null, scheduleWarning: undefined as string | undefined });
  const [workers, setWorkers] = useState<WorkerWithStatus[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const today = getLocalDateString();
      const [statsRes, workersRes, attendanceRes, systemHealthRes] = await Promise.all([
        fetch(`/api/stats?date=${today}`),
        fetch('/api/workers'),
        fetch(`/api/attendance?date=${today}`),
        fetch(`/api/system-health?date=${today}`),
      ]);

      const statsData = await statsRes.json();
      const workersData = await workersRes.json();
      const attendanceData = await attendanceRes.json();
      const systemHealthData = systemHealthRes.ok ? await systemHealthRes.json() : null;

      setStats(statsData);
      setSystemHealth(systemHealthData);

      const statusMap = new Map<string, { event_type: string; timestamp: string }>();
      for (const e of attendanceData) {
        const existing = statusMap.get(e.worker_id);
        if (!existing || e.timestamp > existing.timestamp) {
          statusMap.set(e.worker_id, { event_type: e.event_type, timestamp: e.timestamp });
        }
      }

      const enriched: WorkerWithStatus[] = workersData.map((w: { id: string; name: string; department: string; has_face_encoding?: boolean; encoding_status?: 'valid' | 'missing' | 'invalid' }) => {
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
      setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Failed to fetch dashboard data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
  const actionItems = [
    ...(missingFaceWorkers.length > 0
      ? [{
          key: 'missing-face',
          label: 'Face enrollment needed',
          value: missingFaceWorkers.length,
          tone: 'amber' as const,
          description: `${missingFaceWorkers.length} worker${missingFaceWorkers.length === 1 ? '' : 's'} missing face data for kiosk recognition.`,
          href: '/workers',
          cta: 'Review now',
        }]
      : []),
    ...(invalidFaceWorkers.length > 0
      ? [{
          key: 'invalid-face',
          label: 'Invalid face data',
          value: invalidFaceWorkers.length,
          tone: 'red' as const,
          description: `${invalidFaceWorkers.length} worker${invalidFaceWorkers.length === 1 ? '' : 's'} need re-enrollment because their face data is not kiosk-valid.`,
          href: '/workers',
          cta: 'Review now',
        }]
      : []),
    ...(systemHealth?.warnings?.map((warning, index) => ({
          key: `system-health-${index}`,
          label: warning.includes('Face service') ? 'Face service warning' : 'Kiosk sync warning',
          value: '!',
          tone: warning.includes('offline') || warning.includes('never synced') ? 'red' as const : 'amber' as const,
          description: warning,
          href: '/kiosks',
          cta: 'Open kiosks',
        })) || []),
    ...(stats.scheduleWarning
      ? [{
          key: 'schedule-warning',
          label: 'Schedule warning',
          value: '!',
          tone: 'red' as const,
          description: stats.scheduleWarning,
          href: '/schedules',
          cta: 'Review now',
        }]
      : []),
    ...(absentWorkers.length > 0
      ? [{
          key: 'not-arrived',
          label: 'Not arrived today',
          value: absentWorkers.length,
          tone: 'slate' as const,
          description: `${absentWorkers.length} active worker${absentWorkers.length === 1 ? '' : 's'} have no clock event today.`,
          href: '/log',
          cta: 'Open log',
        }]
      : []),
  ];

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
                {refreshing ? 'Syncing...' : 'Live'}
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
                  {systemHealth.face_service.version || (systemHealth.face_service.model_ready ? 'Models ready' : 'Model readiness unknown')}
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
                <p className="section-label">Sync payload</p>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-3xl font-display font-bold text-gold">{systemHealth.sync.ready_worker_count}</span>
                  <span className="pb-1 text-sm text-slate-500">workers ready</span>
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
            <p className="section-label">Action Center</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-100">What needs attention</h2>
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
              return (
                <div key={item.key} className={`rounded-2xl border p-4 ${tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono uppercase tracking-wider opacity-80">{item.label}</p>
                      <p className="mt-2 text-sm leading-5 text-slate-400">{item.description}</p>
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

      {/* Search */}
      <div className="relative mb-6">
        <svg className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          placeholder="Search workers by name or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-11 w-full md:w-96"
        />
      </div>

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
          <p className="font-display text-lg text-slate-400">No workers registered</p>
          <p className="text-sm text-slate-600 mt-1">Add workers from the Workers page to see them here</p>
        </div>
      )}
    </div>
  );
}
