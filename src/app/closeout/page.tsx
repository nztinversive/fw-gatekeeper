'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import DemoWriteModeBanner from '@/components/DemoWriteModeBanner';
import { getLocalDateString } from '@/lib/date';
import {
  ShiftCloseoutChecklistItem,
  ShiftCloseoutResponse,
  ShiftCloseoutStatus,
} from '@/lib/types';

const closeoutStyles: Record<ShiftCloseoutStatus, string> = {
  open: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
  completed: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  reopened: 'bg-blue-400/10 text-blue-300 border-blue-400/20',
};

const checklistStyles: Record<string, string> = {
  clear: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
  blocked: 'bg-red-400/10 text-red-300 border-red-400/20',
};

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function exportText(payload: ShiftCloseoutResponse, supervisorName: string, notes: string) {
  const lines = [
    `FW Gatekeeper shift closeout - ${payload.date}`,
    `Status: ${payload.closeout?.status || 'open'}`,
    `Supervisor: ${supervisorName || payload.closeout?.supervisor_name || 'Not set'}`,
    `Completed: ${formatDateTime(payload.closeout?.completed_at)}`,
    '',
    'Summary',
    `Expected: ${payload.summary.expected}`,
    `Present: ${payload.summary.present}`,
    `Late: ${payload.summary.late}`,
    `Missing: ${payload.summary.missing}`,
    `Open exceptions: ${payload.summary.open_exceptions}`,
    `Critical exceptions: ${payload.summary.critical_exceptions}`,
    `Kiosk warnings: ${payload.summary.kiosk_warnings}`,
    `Attendance corrections: ${payload.summary.attendance_corrections}`,
    '',
    'Checklist',
    ...payload.checklist.map((item) => `- ${item.label}: ${item.status} (${item.count}) - ${item.description}`),
    '',
    'Notes',
    notes || payload.closeout?.notes || 'No notes recorded.',
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gatekeeper-shift-closeout-${payload.date}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function checklistTone(item: ShiftCloseoutChecklistItem) {
  return checklistStyles[item.status] || checklistStyles.blocked;
}

export default function ShiftCloseoutPage() {
  const { toast } = useToast();
  const [date, setDate] = useState(getLocalDateString());
  const [payload, setPayload] = useState<ShiftCloseoutResponse | null>(null);
  const [supervisorName, setSupervisorName] = useState('');
  const [notes, setNotes] = useState('');
  const [acknowledgedBlockers, setAcknowledgedBlockers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const fetchCloseout = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/shift-closeout?date=${date}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Failed to load shift closeout');
      setPayload(body);
      setSupervisorName(body.closeout?.supervisor_name || '');
      setNotes(body.closeout?.notes || '');
      setAcknowledgedBlockers(Boolean(body.closeout?.acknowledged_blockers));
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : 'Failed to load shift closeout');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchCloseout();
  }, [fetchCloseout]);

  const status = payload?.closeout?.status || 'open';
  const completed = status === 'completed';
  const blockerCount = payload?.blockers.length || 0;
  const canComplete = Boolean(payload?.can_complete || (acknowledgedBlockers && notes.trim()));
  const closeoutLabel = completed ? 'Shift closeout complete' : blockerCount ? 'Closeout needs acknowledgement' : 'Ready to close shift';
  const closeoutDescription = completed
    ? `Completed ${formatDateTime(payload?.closeout?.completed_at)}. Reopen if a supervisor needs to correct the record.`
    : blockerCount
      ? 'Review the blocked checklist items or add an acknowledgement note before completing the closeout.'
      : 'Checklist is clear. Add supervisor notes and complete the daily record.';

  const summaryRows = useMemo(() => {
    const summary = payload?.summary;
    return [
      ['Expected', summary?.expected ?? 0, 'text-slate-100'],
      ['Present', summary?.present ?? 0, 'text-emerald-300'],
      ['Late', summary?.late ?? 0, 'text-amber-300'],
      ['Missing', summary?.missing ?? 0, 'text-red-300'],
      ['Open Exceptions', summary?.open_exceptions ?? 0, 'text-gold'],
      ['Kiosk Warnings', summary?.kiosk_warnings ?? 0, 'text-blue-300'],
      ['Corrections', summary?.attendance_corrections ?? 0, 'text-gold'],
    ];
  }, [payload]);

  function updateCloseout(action: 'save' | 'complete' | 'reopen') {
    if (action === 'complete' && !canComplete) {
      toast('Add an acknowledgement note before completing with blockers.', 'error');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/shift-closeout', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            action,
            supervisor_name: supervisorName,
            notes,
            acknowledged_blockers: acknowledgedBlockers,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || 'Failed to update closeout');
        const suffix = body?.demo_write ? ' locally' : '';
        toast(action === 'complete' ? `Shift closeout completed${suffix}` : action === 'reopen' ? `Shift closeout reopened${suffix}` : `Closeout notes saved${suffix}`);
        await fetchCloseout();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to update closeout', 'error');
      }
    });
  }

  return (
    <div className="animate-fade-in space-y-6 pb-24 md:pb-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="section-label mb-2">Supervisor record</p>
          <h1 className="page-title text-slate-100">
            Shift <span className="text-gold">Closeout</span>
          </h1>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl leading-6">
            End-of-shift signoff for coverage, exceptions, kiosk trust signals, and supervisor notes.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={fetchCloseout} className="btn-secondary" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={() => window.print()} className="btn-secondary">
            Print
          </button>
          <button type="button" onClick={() => payload && exportText(payload, supervisorName, notes)} className="btn-primary" disabled={!payload}>
            Export
          </button>
        </div>
      </div>

      <DemoWriteModeBanner />

      {error && (
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {payload?.backend_unavailable && (
        <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
          {payload.warning || 'Shift closeout is waiting for deployment.'}
        </div>
      )}

      <section className="glass-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="section-label mb-2">Closeout status</p>
            <h2 className="font-display text-2xl text-slate-100">{closeoutLabel}</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-3xl leading-6">{closeoutDescription}</p>
          </div>
          <span className={`badge border ${closeoutStyles[status]}`}>{titleCase(status)}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6 mt-5">
          {summaryRows.map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-navy-600/50 bg-navy-900/35 p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`mt-1 font-display text-2xl ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display font-semibold text-slate-100">Closeout checklist</h2>
            <span className="text-xs font-mono text-slate-500">{blockerCount} blockers</span>
          </div>
          {loading && !payload ? (
            <div className="glass-card p-6 text-sm text-slate-400">Loading closeout checklist...</div>
          ) : payload?.checklist.length ? (
            <div className="grid gap-3">
              {payload.checklist.map((item) => (
                <article key={item.id} className="glass-card-hover p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display font-semibold text-slate-100">{item.label}</h3>
                      <p className="text-sm text-slate-400 mt-2 leading-6">{item.description}</p>
                      <Link href={item.href} className="mt-3 inline-flex text-xs font-semibold text-gold hover:text-gold-light">
                        Open source view →
                      </Link>
                    </div>
                    <span className={`badge border ${checklistTone(item)}`}>{titleCase(item.status)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="glass-card p-6 text-sm text-slate-400">No checklist is available for this date yet.</div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="glass-card p-5 space-y-4">
            <div>
              <h2 className="font-display font-semibold text-slate-100">Supervisor signoff</h2>
              <p className="text-sm text-slate-400 mt-2">Save notes during the shift, then complete the record at close.</p>
            </div>
            <label className="space-y-1.5 block">
              <span className="section-label block">Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input-field" />
            </label>
            <label className="space-y-1.5 block">
              <span className="section-label block">Supervisor</span>
              <input value={supervisorName} onChange={(event) => setSupervisorName(event.target.value)} placeholder="Supervisor name" className="input-field" />
            </label>
            <label className="space-y-1.5 block">
              <span className="section-label block">Closeout notes</span>
              <textarea
                rows={7}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Document exceptions reviewed, kiosk caveats, or follow-up needed."
                className="input-field min-h-[180px] resize-y"
              />
            </label>
            {blockerCount > 0 && !completed && (
              <label className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100">
                <input
                  type="checkbox"
                  checked={acknowledgedBlockers}
                  onChange={(event) => setAcknowledgedBlockers(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-navy-500 bg-navy-900"
                />
                <span>I acknowledge the blocked closeout items and documented the reason in notes.</span>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => updateCloseout('save')} disabled={isPending || !payload}>
                Save notes
              </button>
              {completed ? (
                <button type="button" className="btn-primary" onClick={() => updateCloseout('reopen')} disabled={isPending || !payload}>
                  Reopen
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => updateCloseout('complete')} disabled={isPending || !payload || !canComplete}>
                  Complete closeout
                </button>
              )}
            </div>
          </section>

          <section className="glass-card p-5">
            <h2 className="font-display font-semibold text-slate-100">Source views</h2>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {(payload?.action_links.length ? payload.action_links : [
                { label: 'Briefing', href: `/briefing?date=${date}` },
                { label: 'Exceptions', href: `/exceptions?date=${date}` },
                { label: 'Kiosks', href: '/kiosks' },
                { label: 'Recognition Lab', href: `/calibration/recognition?date=${date}` },
              ]).map((link) => (
                <Link key={link.href} href={link.href} className="rounded-xl border border-navy-600/50 bg-navy-900/35 px-4 py-3 text-sm text-slate-300 hover:text-gold hover:border-gold/25 transition-all">
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
