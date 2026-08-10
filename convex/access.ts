import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type PortalMemberRole = Doc<"portalMembers">["role"];

export async function assertPortalRole(
  ctx: QueryCtx | MutationCtx,
  allowedRoles: readonly PortalMemberRole[],
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Unauthorized");
  }

  const member = await ctx.db
    .query("portalMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  if (!member?.active) {
    throw new ConvexError("Unauthorized");
  }
  if (!allowedRoles.includes(member.role)) {
    throw new ConvexError("Insufficient permissions");
  }

  return member;
}
