import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-20" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-500/[0.02] rounded-full blur-3xl" />

      <div className="text-center relative z-10 px-6">
        {/* Glitch-style 404 */}
        <div className="relative mb-6">
          <h1 className="text-[120px] md:text-[180px] font-display font-extrabold leading-none text-navy-700 select-none">
            404
          </h1>
          <h1 className="text-[120px] md:text-[180px] font-display font-extrabold leading-none text-gold/20 absolute inset-0 translate-x-1 -translate-y-1 select-none">
            404
          </h1>
        </div>

        <div className="glass-card p-8 max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-red-400/10 border border-red-400/15 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h2 className="text-xl font-display font-bold text-slate-200 mb-2">
            Sector Not Found
          </h2>
          <p className="text-sm text-slate-400 mb-6 font-mono">
            The area you&apos;re looking for doesn&apos;t exist in this facility.
          </p>

          <Link
            href="/"
            className="btn-primary inline-flex items-center gap-2 px-6 py-3"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
            Return to Command Center
          </Link>
        </div>

        <p className="text-[10px] font-mono text-slate-600 mt-8 uppercase tracking-widest">
          FW Gatekeeper &middot; Access Control System
        </p>
      </div>
    </div>
  );
}
