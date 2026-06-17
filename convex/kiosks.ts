import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { findActiveKioskByIdentifier } from "./kioskLookup";

function normalizeOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function serializeKiosk(k: any) {
  return {
    id: k._id,
    name: k.name,
    kiosk_id: k.kioskId || null,
    type: k.type,
    location: k.location,
    last_sync: k.lastSync || null,
    active: 1,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const kiosks = await ctx.db
      .query("kiosks")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return kiosks.map(serializeKiosk);
  },
});

export const create = mutation({
  args: { name: v.string(), kioskId: v.optional(v.string()), type: v.string(), location: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const kioskId = normalizeOptionalText(args.kioskId);
    const id = await ctx.db.insert("kiosks", {
      name: args.name.trim(),
      kioskId,
      type: args.type.trim(),
      location: normalizeOptionalText(args.location) || "",
      active: true,
    });
    return { id, name: args.name, type: args.type };
  },
});

export const findByKioskId = query({
  args: { kioskId: v.string() },
  handler: async (ctx, args) => {
    const match = await findActiveKioskByIdentifier(ctx, args.kioskId);
    return match ? serializeKiosk(match) : null;
  },
});

export const updateLastSync = mutation({
  args: { id: v.id("kiosks"), lastSync: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastSync: args.lastSync });
  },
});
