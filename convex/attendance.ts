import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { findActiveKioskByIdentifier } from "./kioskLookup";

function getDateKey(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function getNextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export async function listAttendanceByTimestampRange(
  ctx: any,
  date: string,
  workerId?: string,
) {
  const start = date;
  const end = getNextDateKey(date);
  const query = workerId
    ? ctx.db
        .query("attendance")
        .withIndex("by_timestamp", (q: any) => q.gte("timestamp", start).lt("timestamp", end))
        .filter((q: any) => q.eq(q.field("workerId"), workerId))
    : ctx.db
        .query("attendance")
        .withIndex("by_timestamp", (q: any) => q.gte("timestamp", start).lt("timestamp", end));
  return await query.collect();
}

export const list = query({
  args: { date: v.optional(v.string()), workerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const date = args.date || new Date().toISOString().split("T")[0];
    const records: any[] = await listAttendanceByTimestampRange(ctx, date, args.workerId);
    records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Join worker and kiosk data
    const result: any[] = [];
    for (const a of records) {
      const worker = a.workerId ? await ctx.db.get(a.workerId as any).catch(() => null) : null;
      const kiosk = await findActiveKioskByIdentifier(ctx, a.kioskId);
      result.push({
        id: a._id,
        worker_id: a.workerId,
        event_type: a.eventType,
        kiosk_id: a.kioskId || null,
        timestamp: a.timestamp,
        synced: a.synced ? 1 : 0,
        worker_name: (worker as any)?.name || a.workerName || "",
        worker_department: (worker as any)?.department || "",
        kiosk_name: (kiosk as any)?.name || null,
        confidence: a.confidence || 0,
        liveness_confirmed: a.livenessConfirmed ? 1 : 0,
      });
    }
    return result;
  },
});

export const create = mutation({
  args: {
    workerId: v.string(),
    eventType: v.string(),
    kioskId: v.optional(v.string()),
    timestamp: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("attendance", {
      workerId: args.workerId,
      eventType: args.eventType,
      kioskId: args.kioskId,
      timestamp: args.timestamp || new Date().toISOString(),
      idempotencyKey: args.idempotencyKey,
      synced: false,
    });
    return { id };
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("attendance").collect();
    for (const r of all) {
      await ctx.db.delete(r._id);
    }
    return { deleted: all.length };
  },
});

export const bulkCreate = mutation({
  args: {
    events: v.array(
      v.object({
        id: v.optional(v.string()),
        workerId: v.string(),
        eventType: v.string(),
        kioskId: v.optional(v.string()),
        timestamp: v.string(),
        idempotencyKey: v.optional(v.string()),
        workerName: v.optional(v.string()),
        confidence: v.optional(v.float64()),
        livenessConfirmed: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const seenKeys = new Set<string>();
    let count = 0;
    for (const e of args.events) {
      const dedupeKey = `${e.workerId}:${e.timestamp}`;
      if (seenKeys.has(dedupeKey)) {
        continue;
      }
      seenKeys.add(dedupeKey);

      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_timestamp", (q) => q.eq("timestamp", e.timestamp))
        .filter((q) => q.eq(q.field("workerId"), e.workerId))
        .collect();
      if (existing.length > 0) {
        continue;
      }

      await ctx.db.insert("attendance", {
        workerId: e.workerId,
        eventType: e.eventType,
        kioskId: e.kioskId,
        timestamp: e.timestamp,
        idempotencyKey: e.idempotencyKey || e.id,
        synced: true,
        workerName: e.workerName,
        confidence: e.confidence,
        livenessConfirmed: e.livenessConfirmed,
      });
      count++;
    }
    return { synced: count };
  },
});
