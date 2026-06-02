import { createAccount, getAuthUserId, invalidateSessions, modifyAccountCredentials } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';

import { action, internalMutation, internalQuery, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import type { ActionCtx } from './_generated/server';

const portalMemberRole = v.union(v.literal('admin'), v.literal('enrollment'), v.literal('viewer'));
type PortalMemberRole = Doc<'portalMembers'>['role'];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertValidPassword(password: string) {
  if (password.length < 8) {
    throw new ConvexError('Temporary password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/.test(password)) {
    throw new ConvexError('Temporary password must include uppercase, lowercase, and a number or symbol');
  }
}

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

export const list = query({
  args: {},
  handler: async (ctx) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!currentUserId) {
      throw new ConvexError('Unauthorized');
    }

    const currentMember = await ctx.db
      .query('portalMembers')
      .withIndex('by_user', (q) => q.eq('userId', currentUserId))
      .unique();

    if (!currentMember?.active || currentMember.role !== 'admin') {
      throw new ConvexError('Admin access required');
    }

    const members = await ctx.db.query('portalMembers').collect();
    const rows = [];
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      rows.push({
        id: member._id,
        userId: member.userId,
        email: typeof user?.email === 'string' ? user.email : 'Unknown email',
        role: member.role,
        active: member.active,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      });
    }

    return rows.sort((a, b) => a.email.localeCompare(b.email));
  },
});

export const getActiveMemberByUserId = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query('portalMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
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

export const getPasswordAccountByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) => q.eq('provider', 'password').eq('providerAccountId', args.email))
      .first();

    return account ? { userId: account.userId } : null;
  },
});

export const upsertMember = internalMutation({
  args: {
    userId: v.id('users'),
    role: portalMemberRole,
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query('portalMembers')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        active: args.active,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert('portalMembers', {
      userId: args.userId,
      role: args.role,
      active: args.active,
      createdAt: now,
      updatedAt: now,
    });
  },
});

async function assertAdminUser(ctx: ActionCtx) {
  const adminUserId = await getAuthUserId(ctx);
  if (!adminUserId) {
    throw new ConvexError('Unauthorized');
  }

  const adminMember = await ctx.runQuery(internal.portalMembers.getActiveMemberByUserId, {
    userId: adminUserId,
  });

  if (adminMember?.role !== 'admin') {
    throw new ConvexError('Admin access required');
  }
}

export const createPortalAccount = action({
  args: {
    email: v.string(),
    password: v.string(),
    role: portalMemberRole,
  },
  handler: async (ctx, args): Promise<{ email: string; role: PortalMemberRole; active: boolean }> => {
    await assertAdminUser(ctx);

    const email = normalizeEmail(args.email);
    if (!email || !email.includes('@')) {
      throw new ConvexError('A valid email address is required');
    }
    assertValidPassword(args.password);

    const existing = await ctx.runQuery(internal.portalMembers.getPasswordAccountByEmail, { email });

    if (existing) {
      throw new ConvexError('An account with this email already exists. Use Reset Password / Update Role instead.');
    }

    const created = await createAccount(ctx, {
      provider: 'password',
      account: { id: email, secret: args.password },
      profile: { email },
    });

    await ctx.runMutation(internal.portalMembers.upsertMember, {
      userId: created.user._id,
      role: args.role,
      active: true,
    });

    return { email, role: args.role, active: true };
  },
});

export const resetPortalAccountPassword = action({
  args: {
    email: v.string(),
    password: v.string(),
    role: portalMemberRole,
  },
  handler: async (ctx, args): Promise<{ email: string; role: PortalMemberRole; active: boolean }> => {
    await assertAdminUser(ctx);

    const email = normalizeEmail(args.email);
    if (!email || !email.includes('@')) {
      throw new ConvexError('A valid email address is required');
    }
    assertValidPassword(args.password);

    const existing = await ctx.runQuery(internal.portalMembers.getPasswordAccountByEmail, { email });
    if (!existing) {
      throw new ConvexError('No existing password account was found for this email. Create the account first.');
    }

    await modifyAccountCredentials(ctx, {
      provider: 'password',
      account: { id: email, secret: args.password },
    });
    await invalidateSessions(ctx, { userId: existing.userId });

    await ctx.runMutation(internal.portalMembers.upsertMember, {
      userId: existing.userId,
      role: args.role,
      active: true,
    });

    return { email, role: args.role, active: true };
  },
});
