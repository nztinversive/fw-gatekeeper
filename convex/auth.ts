import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';
import type { Value } from 'convex/values';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params: Record<string, Value | undefined>) {
        const flow = String(params.flow ?? 'signIn');
        if (flow === 'signUp') {
          throw new Error('Portal account creation is invite-only. Ask an administrator for access.');
        }

        const email = String(params.email ?? '').trim().toLowerCase();
        if (!email) {
          throw new Error('Email is required');
        }
        return { email };
      },
    }),
  ],
});
