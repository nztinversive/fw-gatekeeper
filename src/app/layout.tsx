import type { Metadata } from 'next';
import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import './globals.css';
import AppShell from '@/components/AppShell';
import ConvexAuthProvider from '@/components/ConvexAuthProvider';
import { ToastProvider } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'FW Gatekeeper',
  description: 'Fading West Factory Access System',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <ConvexAuthNextjsServerProvider apiRoute="/api/convex-auth">
          <ConvexAuthProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </ConvexAuthProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
