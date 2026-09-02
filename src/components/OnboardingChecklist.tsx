'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { GuideRole } from '@/lib/app-guides';

type OnboardingTask = {
  id: string;
  label: string;
  description: string;
  href: string;
};

const tasksByRole: Record<GuideRole, OnboardingTask[]> = {
  admin: [
    { id: 'briefing', label: 'Review a shift briefing', description: 'Confirm expected coverage and the first actions.', href: '/briefing' },
    { id: 'workers', label: 'Check worker readiness', description: 'Find missing or invalid face enrollments.', href: '/workers' },
    { id: 'kiosks', label: 'Confirm kiosk readiness', description: 'Review sync and attendance-upload health.', href: '/kiosks' },
    { id: 'exceptions', label: 'Work an exception', description: 'Inspect evidence before making a correction.', href: '/exceptions' },
    { id: 'closeout', label: 'Review shift closeout', description: 'Learn the checklist and supervisor signoff.', href: '/closeout' },
  ],
  enrollment: [
    { id: 'briefing', label: 'Review a shift briefing', description: 'Identify enrollment gaps before the shift.', href: '/briefing' },
    { id: 'workers', label: 'Find a worker', description: 'Confirm identity and face-readiness status.', href: '/workers' },
    { id: 'enroll', label: 'Learn face enrollment', description: 'Review capture quality and duplicate prevention.', href: '/enroll' },
    { id: 'recognition', label: 'Inspect recognition evidence', description: 'Understand low-confidence and ambiguous matches.', href: '/calibration/recognition' },
    { id: 'closeout', label: 'Review shift closeout', description: 'See how enrollment issues affect signoff.', href: '/closeout' },
  ],
  viewer: [
    { id: 'dashboard', label: 'Read the dashboard', description: 'Find the current readiness status and first action.', href: '/' },
    { id: 'briefing', label: 'Review a shift briefing', description: 'Confirm expected coverage and evidence.', href: '/briefing' },
    { id: 'exceptions', label: 'Review an exception', description: 'Learn what to capture for an authorized supervisor.', href: '/exceptions' },
    { id: 'log', label: 'Inspect the activity log', description: 'Trace attendance events and correction history.', href: '/log' },
    { id: 'closeout', label: 'Review shift closeout', description: 'Understand the end-of-shift readiness record.', href: '/closeout' },
  ],
};

type StoredChecklist = {
  completed: string[];
  dismissed: boolean;
};

function storageKey(role: GuideRole) {
  return `fw-gatekeeper:guide-onboarding:v1:${role}`;
}

export default function OnboardingChecklist({ role }: { role: GuideRole }) {
  const tasks = useMemo(() => tasksByRole[role], [role]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey(role));
      const parsed = saved ? JSON.parse(saved) as StoredChecklist : null;
      const validTaskIds = new Set(tasks.map((task) => task.id));
      setCompleted(parsed?.completed.filter((id) => validTaskIds.has(id)) || []);
      setDismissed(Boolean(parsed?.dismissed));
    } catch {
      setCompleted([]);
      setDismissed(false);
    }
    setLoaded(true);
  }, [role, tasks]);

  function save(nextCompleted: string[], nextDismissed: boolean) {
    setCompleted(nextCompleted);
    setDismissed(nextDismissed);
    try {
      window.localStorage.setItem(storageKey(role), JSON.stringify({ completed: nextCompleted, dismissed: nextDismissed }));
    } catch {
      // The checklist remains usable for this session when storage is unavailable.
    }
  }

  function toggleTask(id: string) {
    const next = completed.includes(id) ? completed.filter((taskId) => taskId !== id) : [...completed, id];
    save(next, false);
  }

  if (!loaded) {
    return <section aria-label="Loading onboarding checklist" className="glass-card h-28 animate-pulse bg-navy-800/50" />;
  }

  if (dismissed) {
    return (
      <section className="rounded-xl border border-navy-600/50 bg-navy-900/35 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-300">Getting-started checklist hidden</p>
            <p className="mt-1 text-xs text-slate-500">Your {completed.length} completed item{completed.length === 1 ? '' : 's'} are still saved.</p>
          </div>
          <button type="button" onClick={() => save(completed, false)} className="btn-secondary shrink-0 text-xs">Show checklist</button>
        </div>
      </section>
    );
  }

  const percent = Math.round((completed.length / tasks.length) * 100);
  const allComplete = completed.length === tasks.length;

  return (
    <section className="glass-card overflow-hidden" aria-labelledby="onboarding-title">
      <div className="border-b border-navy-600/50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-label text-gold">Getting started</p>
            <h2 id="onboarding-title" className="mt-2 font-display text-xl font-semibold text-slate-100">
              {allComplete ? 'You know the essentials' : 'Learn your Gatekeeper workflow'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Mark each item complete after you have tried it. Progress is saved on this device.</p>
          </div>
          <button type="button" onClick={() => save(completed, true)} className="btn-ghost self-start text-xs">Hide checklist</button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-navy-950" aria-hidden="true">
            <div className="h-full rounded-full bg-gold transition-all duration-300" style={{ width: `${percent}%` }} />
          </div>
          <span className="font-mono text-xs text-slate-400">{completed.length}/{tasks.length}</span>
        </div>
      </div>
      <ul className="divide-y divide-navy-700/50">
        {tasks.map((task) => {
          const checked = completed.includes(task.id);
          return (
            <li key={task.id} className="flex items-start gap-3 px-5 py-4">
              <button
                type="button"
                onClick={() => toggleTask(task.id)}
                aria-label={`${checked ? 'Mark incomplete' : 'Mark complete'}: ${task.label}`}
                aria-pressed={checked}
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${checked ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300' : 'border-navy-500 bg-navy-950/50 text-transparent hover:border-gold/40'}`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4 4L19 7" />
                </svg>
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${checked ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{task.label}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{task.description}</p>
              </div>
              <Link href={task.href} className="btn-secondary shrink-0 px-3 py-2 text-xs">Open</Link>
            </li>
          );
        })}
      </ul>
      {completed.length > 0 && (
        <div className="border-t border-navy-600/50 px-5 py-3 text-right">
          <button type="button" onClick={() => save([], false)} className="btn-ghost text-xs">Reset progress</button>
        </div>
      )}
    </section>
  );
}
