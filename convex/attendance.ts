import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { findActiveKioskByIdentifier } from "./kioskLookup";
import {
  buildConservativeFactoryLocalTimestampRanges,
  getFactoryLocalTimestamp,
  timestampBelongsToFactoryLocalDate,
} from "./localDate";

function withFactoryLocalTimestamp(record: any) {
  const timestamp = getFactoryLocalTimestamp(record?.timestamp);
  if (!timestamp || timestamp === record?.timestamp) {
    return record;
  }
  return { ...record, timestamp };
}

export async function listAttendanceByTimestampRange(
  ctx: any,
  date: string,
  workerId?: string,
) {
  const rowsById = new Map<string, any>();
  for (const range of buildConservativeFactoryLocalTimestampRanges(date)) {
    const query = workerId
      ? ctx.db
          .query("attendance")
          .withIndex("by_timestamp", (q: any) => q.gte("timestamp", range.startTimestamp).lt("timestamp", range.endTimestamp))
          .filter((q: any) => q.eq(q.field("workerId"), workerId))
      : ctx.db
          .query("attendance")
          .withIndex("by_timestamp", (q: any) => q.gte("timestamp", range.startTimestamp).lt("timestamp", range.endTimestamp));
    const rows = await query.collect();
    for (const row of rows) {
      if (timestampBelongsToFactoryLocalDate(row.timestamp, date)) {
        rowsById.set(String(row._id), withFactoryLocalTimestamp(row));
      }
    }
  }
  return Array.from(rowsById.values());
}

export async function listEffectiveAttendanceByTimestampRange(
  ctx: any,
  date: string,
  workerId?: string,
) {
  const [rawRecords, corrections] = await Promise.all([
    listAttendanceByTimestampRange(ctx, date, workerId),
    workerId
      ? ctx.db
          .query("attendanceCorrections")
          .withIndex("by_worker_date", (q: any) => q.eq("workerId", workerId).eq("date", date))
          .collect()
      : ctx.db
          .query("attendanceCorrections")
          .withIndex("by_date", (q: any) => q.eq("date", date))
          .collect(),
  ]);

  const voidedIds = new Set(
    corrections
      .filter((correction: any) => correction.action === "void_event" && correction.originalAttendanceId)
      .map((correction: any) => String(correction.originalAttendanceId)),
  );

  const effective = rawRecords
    .filter((record: any) => !voidedIds.has(String(record._id)))
    .map((record: any) => ({
      ...record,
      correctionId: undefined,
      corrected: false,
      source: "kiosk",
    }));

  for (const correction of corrections) {
    if (correction.action !== "add_clock_in" && correction.action !== "add_clock_out") continue;
    if (!correction.correctedTimestamp || !correction.eventType) continue;
    effective.push({
      _id: `correction:${String(correction._id)}`,
      workerId: correction.workerId,
      eventType: correction.eventType,
      kioskId: "supervisor_correction",
      timestamp: getFactoryLocalTimestamp(correction.correctedTimestamp) || correction.correctedTimestamp,
      idempotencyKey: `correction:${String(correction._id)}`,
      synced: true,
      workerName: undefined,
      confidence: undefined,
      livenessConfirmed: undefined,
      correctionId: String(correction._id),
      correctionReason: correction.reason,
      correctionSupervisorName: correction.supervisorName,
      corrected: true,
      source: "correction",
    });
  }

  effective.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
  return effective;
}

export const list = query({
  args: {
    date: v.optional(v.string()),
    workerId: v.optional(v.string()),
    includeCorrections: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const date = args.date || new Date().toISOString().split("T")[0];
    const records: any[] = args.includeCorrections === false
      ? await listAttendanceByTimestampRange(ctx, date, args.workerId)
      : await listEffectiveAttendanceByTimestampRange(ctx, date, args.workerId);
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
        kiosk_name: a.source === "correction" ? "Supervisor correction" : (kiosk as any)?.name || null,
        confidence: a.confidence || 0,
        liveness_confirmed: a.livenessConfirmed ? 1 : 0,
        source: a.source || "kiosk",
        corrected: Boolean(a.corrected),
        correction_id: a.correctionId || null,
        correction_reason: a.correctionReason || null,
        correction_supervisor_name: a.correctionSupervisorName || null,
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
