'use client';

import { useEffect, useState } from 'react';
import AttendanceTable from '@/components/AttendanceTable';
import { AttendanceCorrection, AttendanceCorrectionsResponse, AttendanceWithWorker } from '@/lib/types';
import { getLocalDateString } from '@/lib/date';

function correctionLabel(action: string) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function correctionTimestamp(correction: AttendanceCorrection) {
  return correction.corrected_timestamp || correction.original_timestamp || correction.created_at;
}

export default function LogPage() {
  const [date, setDate] = useState(getLocalDateString());
  const [events, setEvents] = useState<AttendanceWithWorker[]>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/attendance?date=${date}`).then((r) => r.json()),
      fetch(`/api/attendance-corrections?date=${date}`).then((r) => r.json()),
    ])
      .then(([eventRows, correctionPayload]: [AttendanceWithWorker[], AttendanceCorrectionsResponse]) => {
        setEvents(Array.isArray(eventRows) ? eventRows : []);
        setCorrections(Array.isArray(correctionPayload.corrections) ? correctionPayload.corrections : []);
      })
      .catch(console.error);
  }, [date]);

  const exportCSV = () => {
    const header = 'Time,Worker,Department,Event,Kiosk,Source,Correction Reason\n';
    const rows = events.map((e) =>
      `${e.timestamp},${e.worker_name},${e.worker_department},${e.event_type},${e.kiosk_name || ''},${e.source || 'kiosk'},${e.correction_reason || ''}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gatekeeper-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="page-title text-slate-100">
            Activity <span className="text-gold">Log</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-mono">{events.length} effective events · {corrections.length} correction{corrections.length === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field w-auto"
          />
          <button onClick={exportCSV} className="btn-primary flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <AttendanceTable events={events} />
      </div>

      <section className="glass-card mt-6 overflow-hidden">
        <div className="border-b border-navy-600/50 px-5 py-4">
          <h2 className="font-display font-semibold text-slate-100">Correction history</h2>
          <p className="mt-1 text-xs text-slate-500">Audited supervisor changes applied to the effective attendance record.</p>
        </div>
        {corrections.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">No attendance corrections recorded for this date.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-600/50">
                  <th className="px-5 py-3.5 text-left section-label">Correction</th>
                  <th className="px-5 py-3.5 text-left section-label">Worker</th>
                  <th className="px-5 py-3.5 text-left section-label">Effective Time</th>
                  <th className="px-5 py-3.5 text-left section-label">Reason</th>
                  <th className="px-5 py-3.5 text-left section-label">Supervisor</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((correction) => (
                  <tr key={correction.id} className="border-b border-navy-700/30 table-row-hover">
                    <td className="px-5 py-3">
                      <span className="badge border border-gold/20 bg-gold/10 text-gold text-[11px]">{correctionLabel(correction.action)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-display font-medium text-slate-200">{correction.worker_name || correction.worker_id}</div>
                      <div className="text-[11px] font-mono text-slate-500">{correction.worker_department}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">
                      {new Date(correctionTimestamp(correction)).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{correction.reason}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{correction.supervisor_name || 'Not recorded'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
