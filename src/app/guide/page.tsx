'use client';

import { useState } from 'react';
import Link from 'next/link';
import OnboardingChecklist from '@/components/OnboardingChecklist';
import { appGuides, searchAppGuides, type AppGuide, type GuideGroup, type GuideRole } from '@/lib/app-guides';
import { usePortalRole } from '@/hooks/usePortalRole';

const workflowByRole: Record<GuideRole, Array<{ number: string; label: string; title: string; description: string; href: string; cta: string }>> = {
  admin: [
    { number: '01', label: 'Before the shift', title: 'Confirm readiness', description: 'Use Briefing to check expected coverage, enrollment gaps, and kiosk health.', href: '/briefing', cta: 'Open Briefing' },
    { number: '02', label: 'During the shift', title: 'Work what needs attention', description: 'Start on the Dashboard, then resolve evidence-backed items in Exceptions.', href: '/exceptions', cta: 'Open Exceptions' },
    { number: '03', label: 'End of shift', title: 'Close the record', description: 'Clear remaining problems, add supervisor notes, and complete Closeout.', href: '/closeout', cta: 'Open Closeout' },
  ],
  enrollment: [
    { number: '01', label: 'Before the shift', title: 'Find enrollment gaps', description: 'Use Briefing and Workers to identify people who are not recognition-ready.', href: '/briefing', cta: 'Open Briefing' },
    { number: '02', label: 'During the shift', title: 'Keep recognition ready', description: 'Enroll missing faces and investigate repeated low-confidence attempts.', href: '/workers', cta: 'Open Workers' },
    { number: '03', label: 'End of shift', title: 'Confirm the handoff', description: 'Review remaining enrollment risks and send administrative issues to the shift lead.', href: '/closeout', cta: 'Open Closeout' },
  ],
  viewer: [
    { number: '01', label: 'Before the shift', title: 'Review readiness', description: 'Use Briefing to understand expected coverage and anything needing follow-up.', href: '/briefing', cta: 'Open Briefing' },
    { number: '02', label: 'During the shift', title: 'Confirm the evidence', description: 'Inspect the Dashboard, Exceptions, and Activity Log without changing records.', href: '/exceptions', cta: 'Review Exceptions' },
    { number: '03', label: 'End of shift', title: 'Verify the record', description: 'Review closeout readiness and share unresolved evidence with an authorized supervisor.', href: '/closeout', cta: 'Review Closeout' },
  ],
};

const roleCopy: Record<GuideRole, { label: string; description: string }> = {
  admin: {
    label: 'Administrator',
    description: 'You can review operations and manage workers, schedules, kiosks, accounts, corrections, and closeout.',
  },
  enrollment: {
    label: 'Enrollment operator',
    description: 'You can review operations and enroll faces. Administrative setup and worker-detail changes remain with administrators.',
  },
  viewer: {
    label: 'Viewer',
    description: 'You can review operational evidence. Your guides focus on confirming and handing off issues without changing records.',
  },
};

const guideGroups: Array<{ id: GuideGroup; label: string; description: string }> = [
  { id: 'Shift', label: 'Shift workflow', description: 'Prepare, monitor, resolve, and close the daily shift.' },
  { id: 'Evidence', label: 'Evidence & investigation', description: 'Understand attendance and recognition history.' },
  { id: 'Setup', label: 'People & setup', description: 'Manage the records and systems that support each shift.' },
];

function GuideCard({ guide }: { guide: AppGuide }) {
  return (
    <Link href={guide.path} className="glass-card-hover group block p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label text-gold">{guide.eyebrow}</p>
          <h3 className="mt-2 font-display text-lg font-semibold text-slate-100 group-hover:text-gold">{guide.title}</h3>
        </div>
        <svg className="mt-1 h-5 w-5 shrink-0 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-gold" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{guide.purpose}</p>
      <p className="mt-4 text-xs font-semibold text-slate-500 group-hover:text-slate-300">Open page and use Help for your steps</p>
    </Link>
  );
}

export default function GuidePage() {
  const currentRole = usePortalRole();
  const [query, setQuery] = useState('');
  const visibleGuides = searchAppGuides(query, currentRole);
  const normalizedQuery = query.trim();
  const currentRoleCopy = currentRole ? roleCopy[currentRole] : null;
  const workflow = currentRole ? workflowByRole[currentRole] : workflowByRole.viewer;

  return (
    <div className="animate-fade-in space-y-8 pb-24 md:pb-8">
      <header className="max-w-3xl">
        <p className="section-label mb-2">Help &amp; training</p>
        <h1 className="page-title text-slate-100">Gatekeeper <span className="text-gold">Guide Center</span></h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Follow your daily workflow below, search for a task, or open a page guide for focused instructions. The floating Help button explains whichever page you are viewing.
        </p>
      </header>

      {currentRoleCopy && (
        <section className="rounded-2xl border border-gold/20 bg-gold/5 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="section-label text-gold">Your access</p>
              <h2 className="mt-2 font-display text-lg font-semibold text-slate-100">{currentRoleCopy.label}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{currentRoleCopy.description}</p>
            </div>
            <span className="badge self-start border border-gold/20 bg-gold/10 text-gold">Role-aware guides</span>
          </div>
        </section>
      )}

      {currentRole && <OnboardingChecklist role={currentRole} />}

      <section>
        <div className="mb-4">
          <p className="section-label">Daily workflow</p>
          <h2 className="mt-2 font-display text-xl font-semibold text-slate-100">Your Gatekeeper loop</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {workflow.map((item) => (
            <article key={item.number} className="glass-card flex h-full flex-col p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-semibold text-gold">{item.number}</span>
                <span className="section-label">{item.label}</span>
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold text-slate-100">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">{item.description}</p>
              <Link href={item.href} className="btn-secondary mt-5 block text-center text-xs">{item.cta}</Link>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Page directory</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-slate-100">What do you need help with?</h2>
            <p className="mt-2 text-sm text-slate-500">Search by task, problem, worker, or page. Only guidance available to your role is shown.</p>
          </div>
          <div className="relative w-full lg:max-w-md">
            <label htmlFor="guide-search" className="sr-only">Search guides</label>
            <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.35-5.4a6.75 6.75 0 11-13.5 0 6.75 6.75 0 0113.5 0z" />
            </svg>
            <input
              id="guide-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “missed clock-out” or “re-enroll”"
              className="input-field pl-10 pr-10"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear guide search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-slate-200">×</button>
            )}
          </div>
        </div>

        {normalizedQuery ? (
          visibleGuides.length > 0 ? (
            <div>
              <p role="status" className="mb-3 text-xs font-mono text-slate-500">{visibleGuides.length} guide{visibleGuides.length === 1 ? '' : 's'} found for “{normalizedQuery}”</p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleGuides.map((guide) => <GuideCard key={guide.path} guide={guide} />)}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-navy-600/50 bg-navy-900/35 px-5 py-10 text-center">
              <h3 className="font-display text-lg font-semibold text-slate-200">No guide found</h3>
              <p className="mt-2 text-sm text-slate-500">Try a page name or a shorter phrase such as “clock-out,” “face,” or “schedule.”</p>
              <button type="button" onClick={() => setQuery('')} className="btn-secondary mt-5 text-xs">Clear search</button>
            </div>
          )
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {guideGroups.map((group, index) => {
                const guides = visibleGuides.filter((guide) => guide.group === group.id);
                if (guides.length === 0) return null;
                return (
                  <details key={group.id} className="group rounded-2xl border border-navy-600/50 bg-navy-900/35" open={index === 0}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                      <div>
                        <h3 className="font-display font-semibold text-slate-100">{group.label}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{group.description}</p>
                      </div>
                      <svg className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25L12 15.75 4.5 8.25" />
                      </svg>
                    </summary>
                    <div className="grid gap-3 border-t border-navy-600/50 p-3">
                      {guides.map((guide) => <GuideCard key={guide.path} guide={guide} />)}
                    </div>
                  </details>
                );
              })}
            </div>

            <div className="hidden space-y-8 md:block">
              {guideGroups.map((group) => {
                const guides = visibleGuides.filter((guide) => guide.group === group.id);
                if (guides.length === 0) return null;
                return (
                  <div key={group.id}>
                    <div className="mb-3">
                      <h3 className="font-display font-semibold text-slate-200">{group.label}</h3>
                      <p className="mt-1 text-xs text-slate-500">{group.description}</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {guides.map((guide) => <GuideCard key={guide.path} guide={guide} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="glass-card border-l-4 border-cyan-400/60 p-5">
        <p className="section-label text-cyan-300">Reading the interface</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><p className="font-semibold text-red-300">Red · Act now</p><p className="mt-1 text-sm leading-6 text-slate-500">A critical problem can affect attendance or shift readiness.</p></div>
          <div><p className="font-semibold text-amber-300">Amber · Review</p><p className="mt-1 text-sm leading-6 text-slate-500">Something needs confirmation but may not block the shift.</p></div>
          <div><p className="font-semibold text-emerald-300">Green · On track</p><p className="mt-1 text-sm leading-6 text-slate-500">The latest confirmed evidence is healthy.</p></div>
        </div>
      </section>
    </div>
  );
}
