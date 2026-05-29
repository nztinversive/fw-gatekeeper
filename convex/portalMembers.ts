import { getAuthUserId } from '@convex-dev/auth/server';

import { query } from './_generated/server';

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }

    const member = await ctx.db
      .query('portalMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();

    if (!member?.active) {
      return null;
    }

    return {
      userId: member.userId,
      role: member.role,
      active: member.active,
    };
  },
});
