import type { Metadata } from 'next';
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import './globals.css';
import AppShell from '@/components/AppShell';
import ConvexAuthProvider from '@/components/ConvexAuthProvider';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'FW Gateway',
  description: 'Fading West Factory Access System',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const useConvexAuthServerProvider = Boolean(
    process.env.NODE_ENV === 'production' ||
      process.env.NEXT_PUBLIC_FW_DEMO_WRITE_MODE !== '1',
  );
  const app = (
    <ConvexAuthProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </ConvexAuthProvider>
  );

  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {useConvexAuthServerProvider ? (
          <ConvexAuthNextjsServerProvider apiRoute="/api/convex-auth">
            {app}
          </ConvexAuthNextjsServerProvider>
        ) : app}
      </body>
    </html>
  );
}
