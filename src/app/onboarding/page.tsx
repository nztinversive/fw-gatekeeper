import Link from 'next/link';

const checklist = [
  'Preferred: enroll at the kiosk station using the same camera setup employees will use for daily scans.',
  'If a kiosk camera is not available, use a laptop, tablet, or phone with a clear front-facing camera.',
  'Enroll in a well-lit area with the person facing the camera.',
  'Ask the person to remove sunglasses, face coverings, or low hats.',
  'Capture one straight-on photo, then two slight angle changes.',
  'Wait for the success message before moving to the next person.',
];

const troubleshoot = [
  {
    problem: 'Camera permission is blocked',
    fix: 'Refresh the page and allow camera access when the browser asks. If needed, open browser site settings and allow the camera for fw-gatekeeper.onrender.com.',
  },
  {
    problem: 'Enrollment says no face was detected',
    fix: 'Move to brighter light, center the face in the oval, remove sunglasses/hat brim, and try again.',
  },
  {
    problem: 'Worker name already exists',
    fix: 'Go to Workers and confirm whether the person is already active. Use a consistent legal/preferred full name for every enrollment.',
  },
  {
    problem: 'Kiosk does not recognize someone right away',
    fix: 'Wait for kiosk sync to run, then have the person stand 2–3 feet from the camera and look straight at it. If it still fails, re-enroll with better lighting.',
  },
];

export default function OnboardingGuidePage() {
  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-3xl">
          <p className="section-label mb-2">Fading West onboarding</p>
          <h1 className="page-title text-slate-100">
            Face Enrollment <span className="text-gold">Guide</span>
          </h1>
          <p className="text-slate-400 mt-3 leading-7">
            Use this guide when onboarding employees into FW Gatekeeper facial recognition. The correct path is
            <span className="text-gold font-semibold"> Enroll Face</span>: it captures 3 photos, creates a face
            encoding, saves it to the cloud, and syncs it to the kiosks for recognition.
          </p>
        </div>
        <Link href="/enroll" className="btn-primary flex items-center gap-2">
          Start Enrolling
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>

      <div className="glass-card p-6 border-l-4 border-gold/70">
        <h2 className="font-display text-lg font-semibold text-gold mb-2">Short answer</h2>
        <p className="text-slate-300 leading-7">
          To add someone for facial recognition, use <span className="font-semibold text-slate-100">Enroll Face</span> in
          the portal. For best results, enroll them with the <span className="font-semibold text-slate-100">same kiosk camera setup</span> they
          will use for daily scans. Do <span className="font-semibold text-red-300">not</span> use the Workers page to create new face enrollments;
          that worker-management area is for viewing, editing names/departments, and deactivating people after they are enrolled.
        </p>
      </div>

      <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="glass-card p-6">
          <h2 className="font-display text-xl font-semibold text-slate-100 mb-5">Step-by-step enrollment</h2>
          <ol className="space-y-5">
            {[
              ['Open the portal', 'Go to https://fw-gatekeeper.onrender.com and sign in with the admin PIN.'],
              ['Choose Enroll Face', 'Click Enroll Face in the sidebar. This is the only path that creates the face recognition encoding.'],
              ['Use the kiosk camera when possible', 'For best recognition, enroll the person at the kiosk station with the same camera, height, distance, and lighting they will use for daily clock-in scans.'],
              ['Enter person details', 'Type the employee’s full name and department. Use a consistent spelling so reports stay clean.'],
              ['Allow camera access', 'When the browser asks, allow camera permissions. Confirm the person’s face is centered in the oval guide.'],
              ['Capture 3 photos', 'Click Start Capture. The portal will take 3 photos automatically. Ask the person to look straight ahead and make small angle changes between captures.'],
              ['Wait for success', 'Do not close the page until you see the success message. Success means the face encoding was saved.'],
              ['Verify in Workers', 'Open Workers and confirm the person appears in the active worker list.'],
              ['Let kiosks sync', 'Kiosks periodically pull new enrollments from the server. Recognition may take a short moment after enrollment.'],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/25 text-gold font-display font-bold flex items-center justify-center shrink-0">
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-100">{title}</h3>
                  <p className="text-sm text-slate-400 leading-6 mt-1">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-6">
          <div className="glass-card p-6 bg-emerald-950/10 border-emerald-400/20">
            <h2 className="font-display text-xl font-semibold text-emerald-300 mb-3">Best practice: use the kiosk camera</h2>
            <p className="text-sm text-slate-400 leading-6">
              Recognition is strongest when enrollment photos match the real scan setup. When possible, open the portal from
              the kiosk station or a device connected to the same camera used for clock-in scans. Keep the camera at the same
              height and distance employees will use every day, with normal workplace lighting. If using a shared kiosk,
              only an authorized admin should sign in, keep the PIN and employee details private, and sign out when finished.
            </p>
          </div>

          <div className="glass-card p-6">
            <h2 className="font-display text-xl font-semibold text-slate-100 mb-4">Before you start</h2>
            <ul className="space-y-3">
              {checklist.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-slate-400 leading-6">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card p-6 bg-red-950/10 border-red-400/20">
            <h2 className="font-display text-xl font-semibold text-red-300 mb-3">Important: avoid this mistake</h2>
            <p className="text-sm text-slate-400 leading-6">
              Do not add a new person from <span className="text-slate-200 font-semibold">Workers</span>. That page is for
              managing existing enrolled workers. New face enrollments must start from
              <span className="text-gold font-semibold"> Enroll Face</span> so the recognition encoding is created.
            </p>
          </div>
        </div>
      </section>

      <section className="glass-card p-6">
        <h2 className="font-display text-xl font-semibold text-slate-100 mb-5">Troubleshooting</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {troubleshoot.map((item) => (
            <div key={item.problem} className="rounded-2xl border border-navy-600/40 bg-navy-900/35 p-4">
              <h3 className="font-display font-semibold text-slate-100 mb-2">{item.problem}</h3>
              <p className="text-sm text-slate-400 leading-6">{item.fix}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card p-6">
        <h2 className="font-display text-xl font-semibold text-slate-100 mb-4">Email copy</h2>
        <div className="rounded-2xl border border-navy-600/50 bg-navy-950/60 p-4 text-sm text-slate-300 leading-7">
          <p>Hi team,</p>
          <p className="mt-3">
            Please use the FW Gatekeeper Face Enrollment Guide when adding employees to facial recognition:
          </p>
          <p className="mt-3 font-mono text-gold break-all">https://fw-gatekeeper.onrender.com/onboarding</p>
          <p className="mt-3">
            Short version: sign in, open <span className="font-semibold text-slate-100">Enroll Face</span>, use the same kiosk
            camera setup if possible, enter the person’s name and department, allow camera access, capture 3 photos, and wait
            for the success message. Use Workers only for reviewing, editing, or deactivating people after enrollment.
          </p>
        </div>
      </section>
    </div>
  );
}
