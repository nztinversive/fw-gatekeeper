'use client';

import Link from 'next/link';
import { appGuides, canRoleUseGuide } from '@/lib/app-guides';
import { usePortalRole } from '@/hooks/usePortalRole';

const workflow = [
  { number: '01', label: 'Before the shift', title: 'Confirm readiness', description: 'Use Briefing to check expected coverage, enrollment gaps, and kiosk health.', href: '/briefing', cta: 'Open Briefing' },
  { number: '02', label: 'During the shift', title: 'Work what needs attention', description: 'Start on the Dashboard, then resolve evidence-backed items in Exceptions.', href: '/exceptions', cta: 'Open Exceptions' },
  { number: '03', label: 'End of shift', title: 'Close the record', description: 'Clear remaining problems, add supervisor notes, and complete Closeout.', href: '/closeout', cta: 'Open Closeout' },
];

const roleCopy = {
  admin: {
    label: 'Administrator',
    description: 'You can review operations and manage workers, schedules, kiosks, accounts, corrections, and closeout.',
  },
  enrollment: {
    label: 'Enrollment operator',
    description: 'You can review operations and enroll faces. Administrative setup and attendance changes may be unavailable.',
  },
  viewer: {
    label: 'Viewer',
    description: 'You can review operational evidence. Controls that change records are intentionally unavailable.',
  },
};

export default function GuidePage() {
  const currentRole = usePortalRole();
  const visibleGuides = appGuides.filter((guide) => canRoleUseGuide(guide, currentRole));
  const currentRoleCopy = currentRole ? roleCopy[currentRole] : null;

  return (
    <div className="animate-fade-in space-y-8 pb-24 md:pb-8">
      <header className="max-w-3xl">
        <p className="section-label mb-2">Help &amp; training</p>
        <h1 className="page-title text-slate-100">Gatekeeper <span className="text-gold">Guide Center</span></h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Follow the daily supervisor loop below, or jump to a page guide for a focused walkthrough. The floating Help button also explains the page you are currently viewing.
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

      <section>
        <div className="mb-4">
          <p className="section-label">Daily workflow</p>
          <h2 className="mt-2 font-display text-xl font-semibold text-slate-100">The supervisor loop</h2>
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
        <div className="mb-4">
          <p className="section-label">Page directory</p>
          <h2 className="mt-2 font-display text-xl font-semibold text-slate-100">What each page is for</h2>
          <p className="mt-2 text-sm text-slate-500">Only pages available to your account are shown.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleGuides.map((guide) => (
            <Link key={guide.path} href={guide.path} className="glass-card-hover group p-5">
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
              <p className="mt-4 text-xs font-semibold text-slate-500 group-hover:text-slate-300">Open page and use Help for steps</p>
            </Link>
          ))}
        </div>
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
