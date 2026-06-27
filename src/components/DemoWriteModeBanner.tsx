'use client';

export default function DemoWriteModeBanner() {
  if (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_FW_DEMO_WRITE_MODE !== '1') {
    return null;
  }

  return (
    <div role="status" className="rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-sm text-amber-100 leading-6">
      <span className="font-display font-semibold text-amber-200">Demo write mode is on.</span>{' '}
      Submits are saved only in this local session and do not change production Convex data.
    </div>
  );
}
