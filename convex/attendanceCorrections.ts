import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function getDateKey(timestamp?: string | null): string | null {
  if (!timestamp) return null;
  const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})T/);
  return match?.[1] || null;
}

function getEventTypeForAction(action: "add_clock_in" | "add_clock_out" | "void_event") {
  if (action === "add_clock_in") return "clock_in";
  if (action === "add_clock_out") return "clock_out";
  return undefined;
}

export const list = query({
  args: {
    date: v.string(),
    workerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const baseQuery = args.workerId
      ? ctx.db
          .query("attendanceCorrections")
          .withIndex("by_worker_date", (q) => q.eq("workerId", args.workerId!).eq("date", args.date))
      : ctx.db
          .query("attendanceCorrections")
          .withIndex("by_date", (q) => q.eq("date", args.date));
    const corrections = await baseQuery.collect();
    corrections.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const rows = [];
    for (const correction of corrections) {
      const worker = correction.workerId ? await ctx.db.get(correction.workerId as any).catch(() => null) : null;
      const original = correction.originalAttendanceId
        ? await ctx.db.get(correction.originalAttendanceId).catch(() => null)
        : null;
      rows.push({
        id: String(correction._id),
        date: correction.date,
        worker_id: correction.workerId,
        worker_name: (worker as any)?.name || "",
        worker_department: (worker as any)?.department || "",
        action: correction.action,
        event_type: correction.eventType || getEventTypeForAction(correction.action) || null,
        corrected_timestamp: correction.correctedTimestamp || null,
        original_attendance_id: correction.originalAttendanceId ? String(correction.originalAttendanceId) : null,
        original_timestamp: original?.timestamp || null,
        original_event_type: original?.eventType || null,
        related_exception_key: correction.relatedExceptionKey || null,
        reason: correction.reason,
        supervisor_name: correction.supervisorName || null,
        created_at: correction.createdAt,
        updated_at: correction.updatedAt,
      });
    }
    return rows;
  },
});

export const create = mutation({
  args: {
    date: v.string(),
    workerId: v.string(),
    action: v.union(v.literal("add_clock_in"), v.literal("add_clock_out"), v.literal("void_event")),
    correctedTimestamp: v.optional(v.string()),
    originalAttendanceId: v.optional(v.id("attendance")),
    relatedExceptionKey: v.optional(v.string()),
    reason: v.string(),
    supervisorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reason = normalizeText(args.reason);
    if (!reason) {
      throw new Error("Correction reason is required.");
    }

    const worker = await ctx.db.get(args.workerId as any).catch(() => null);
    if (!worker) {
      throw new Error("Worker not found.");
    }

    if (args.action === "void_event") {
      if (!args.originalAttendanceId) {
        throw new Error("originalAttendanceId is required when voiding an event.");
      }
      const original = await ctx.db.get(args.originalAttendanceId);
      if (!original) {
        throw new Error("Original attendance event not found.");
      }
      if (original.workerId !== args.workerId) {
        throw new Error("Original attendance event belongs to a different worker.");
      }
      if (getDateKey(original.timestamp) !== args.date) {
        throw new Error("Original attendance event is not on the correction date.");
      }
    } else if (!args.correctedTimestamp) {
      throw new Error("correctedTimestamp is required when adding an event.");
    } else if (getDateKey(args.correctedTimestamp) !== args.date) {
      throw new Error("correctedTimestamp must be on the correction date.");
    }

    const now = new Date().toISOString();
    const eventType = getEventTypeForAction(args.action);
    const id = await ctx.db.insert("attendanceCorrections", {
      date: args.date,
      workerId: args.workerId,
      action: args.action,
      eventType,
      correctedTimestamp: args.action === "void_event" ? undefined : args.correctedTimestamp,
      originalAttendanceId: args.originalAttendanceId,
      relatedExceptionKey: normalizeText(args.relatedExceptionKey),
      reason,
      supervisorName: normalizeText(args.supervisorName),
      createdAt: now,
      updatedAt: now,
    });

    return { id, createdAt: now };
  },
});
