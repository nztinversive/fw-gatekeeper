'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="md:ml-[260px] min-h-screen pb-24 pt-16 md:pb-0 md:pt-0">
        <div className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </>
  );
}
