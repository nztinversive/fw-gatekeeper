'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getLocalDateString } from '@/lib/date';

interface WorkerHours {
  name: string;
  department: string;
  firstIn: string;
  lastOut: string;
  hours: number;
  late: boolean;
}

interface DayCount {
  date: string;
  count: number;
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getLocalDateString(d);
  });
  const [endDate, setEndDate] = useState(getLocalDateString());
  const [lateThreshold, setLateThreshold] = useState('06:00');
  const [workerHours, setWorkerHours] = useState<WorkerHours[]>([]);
  const [dailyCounts, setDailyCounts] = useState<DayCount[]>([]);

  useEffect(() => {
    const fetchReport = async () => {
      const start = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);
      const allEvents: { worker_id: string; worker_name: string; worker_department: string; event_type: string; timestamp: string }[] = [];
      const counts: DayCount[] = [];

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = getLocalDateString(d);
        const res = await fetch(`/api/attendance?date=${dateStr}`);
        const events = await res.json();
        allEvents.push(...events);

        const uniqueWorkers = new Set(events.filter((e: { event_type: string }) => e.event_type === 'clock_in').map((e: { worker_id: string }) => e.worker_id));
        counts.push({ date: dateStr.slice(5), count: uniqueWorkers.size });
      }

      setDailyCounts(counts);

      const workerMap = new Map<string, { name: string; department: string; ins: string[]; outs: string[] }>();

      for (const e of allEvents) {
        if (!workerMap.has(e.worker_id)) {
          workerMap.set(e.worker_id, { name: e.worker_name, department: e.worker_department, ins: [], outs: [] });
        }
        const w = workerMap.get(e.worker_id)!;
        if (e.event_type === 'clock_in') w.ins.push(e.timestamp);
        else w.outs.push(e.timestamp);
      }

      const thresholdMinutes = parseInt(lateThreshold.split(':')[0]) * 60 + parseInt(lateThreshold.split(':')[1]);

      const hours: WorkerHours[] = [];
      for (const [, w] of workerMap) {
        if (w.ins.length === 0) continue;
        const firstIn = w.ins.sort()[0];
        const lastOut = w.outs.length > 0 ? w.outs.sort().reverse()[0] : firstIn;
        const diffMs = new Date(lastOut).getTime() - new Date(firstIn).getTime();
        const h = Math.round((diffMs / 3600000) * 10) / 10;

        const inDate = new Date(firstIn);
        const inMinutes = inDate.getHours() * 60 + inDate.getMinutes();
        const late = inMinutes > thresholdMinutes;

        hours.push({
          name: w.name,
          department: w.department,
          firstIn: new Date(firstIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          lastOut: new Date(lastOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          hours: h,
          late,
        });
      }

      hours.sort((a, b) => a.name.localeCompare(b.name));
      setWorkerHours(hours);
    };

    fetchReport();
  }, [startDate, endDate, lateThreshold]);

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="page-title text-slate-100">
          Gateway <span className="text-gold">Reports</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1 font-mono">Attendance analytics and insights</p>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 md:p-5 mb-8">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="section-label mb-1.5 block">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="input-field w-auto font-mono" />
          </div>
          <div>
            <label className="section-label mb-1.5 block">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="input-field w-auto font-mono" />
          </div>
          <div>
            <label className="section-label mb-1.5 block">Late After (Local)</label>
            <input type="time" value={lateThreshold} onChange={(e) => setLateThreshold(e.target.value)}
              className="input-field w-auto font-mono" />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card p-5 md:p-6 mb-8">
        <div className="flex items-center gap-2 mb-5">
          <svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <h2 className="font-display font-semibold text-slate-200">Daily Activity</h2>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyCounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2540" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} axisLine={{ stroke: '#1a2540' }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} axisLine={{ stroke: '#1a2540' }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: '#131c30',
                  border: '1px solid rgba(30, 41, 59, 0.5)',
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#f59e0b' }}
              />
              <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} fillOpacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Worker hours table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-600/50 flex items-center gap-2">
          <svg className="w-5 h-5 text-gold" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="font-display font-semibold text-slate-200">Worker Hours</h2>
          <span className="text-xs font-mono text-slate-500 ml-auto">{workerHours.length} workers</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600/50">
                <th className="text-left py-3.5 px-5 section-label">Worker</th>
                <th className="text-left py-3.5 px-5 section-label">Dept</th>
                <th className="text-left py-3.5 px-5 section-label">First In</th>
                <th className="text-left py-3.5 px-5 section-label">Last Out</th>
                <th className="text-left py-3.5 px-5 section-label">Hours</th>
                <th className="text-left py-3.5 px-5 section-label">Status</th>
              </tr>
            </thead>
            <tbody>
              {workerHours.map((w, i) => (
                <tr key={i} className="border-b border-navy-700/30 table-row-hover transition-colors">
                  <td className="py-3 px-5 font-display font-medium text-slate-200">{w.name}</td>
                  <td className="py-3 px-5 text-xs font-mono text-slate-500">{w.department}</td>
                  <td className="py-3 px-5 font-mono text-xs text-slate-400 tabular-nums">{w.firstIn}</td>
                  <td className="py-3 px-5 font-mono text-xs text-slate-400 tabular-nums">{w.lastOut}</td>
                  <td className="py-3 px-5 font-mono text-sm font-medium text-gold tabular-nums">{w.hours}h</td>
                  <td className="py-3 px-5">
                    {w.late ? (
                      <span className="badge text-[11px] bg-red-400/10 text-red-400 border border-red-400/20">Late</span>
                    ) : (
                      <span className="badge text-[11px] bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">On Time</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
