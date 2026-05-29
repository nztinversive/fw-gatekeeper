import { query } from './_generated/server';
import type { Id } from './_generated/dataModel';

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const member = await ctx.db
      .query('portalMembers')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject as Id<'users'>))
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
