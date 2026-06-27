import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { listEffectiveAttendanceByTimestampRange } from "./attendance";
import { findActiveKioskByIdentifier } from "./kioskLookup";
import { listRecognitionAttemptsByFactoryDate } from "./recognitionAttempts";

const LOW_MARGIN_THRESHOLD = 0.08;

type ExceptionStatus = "open" | "reviewed" | "ignored" | "resolved";
type ExceptionSeverity = "critical" | "warning" | "info";
type ShiftException = {
  key: string;
  date: string;
  type: string;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  title: string;
  description: string;
  worker_id: string | null;
  worker_name: string | null;
  department: string | null;
  kiosk_id: string | null;
  kiosk_name: string | null;
  first_seen: string | null;
  last_seen: string | null;
  schedule_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  event_count: number;
  attendance_id?: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  links: {
    activity_log?: string;
    worker?: string;
    recognition_lab?: string;
    kiosk?: string;
    schedules?: string;
  };
};

function getDayOfWeek(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function getMinutesFromTime(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getMinutesFromTimestamp(timestamp?: string | null): number | null {
  if (!timestamp) return null;
  const match = timestamp.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function dateHasPassed(date: string) {
  return date < new Date().toISOString().slice(0, 10);
}

function formatTime(value?: string | null) {
  return value || "not set";
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function buildHref(path: string, params: Record<string, string | null | undefined>) {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== undefined && entry[1] !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `${path}?${query}` : path;
}

function parseScheduleDays(days: string): number[] {
  try {
    const parsed = JSON.parse(days);
    return Array.isArray(parsed) ? parsed.filter((day) => Number.isInteger(day)) : [];
  } catch {
    return [];
  }
}

function getScheduleForWorker(worker: any, schedules: any[], dayOfWeek: number) {
  const todaysSchedules = schedules.filter((schedule) => parseScheduleDays(schedule.days).includes(dayOfWeek));
  const workerDepartment = String(worker.department || "").trim().toLowerCase();
  return (
    todaysSchedules.find(
      (schedule) => String(schedule.department || "").trim().toLowerCase() === workerDepartment,
    ) ||
    todaysSchedules.find((schedule) => !normalizeText(schedule.department)) ||
    null
  );
}

function getReviewStatus(review: any): ExceptionStatus {
  if (review?.status === "reviewed" || review?.status === "ignored" || review?.status === "resolved") {
    return review.status;
  }
  return "open";
}

function withReview(exception: ShiftException, review: any): ShiftException {
  return {
    ...exception,
    status: getReviewStatus(review),
    review_note: review?.note || null,
    reviewed_at: review?.reviewedAt || null,
  };
}

function createException(input: Omit<ShiftException, "status" | "review_note" | "reviewed_at">): ShiftException {
  return {
    ...input,
    status: "open",
    review_note: null,
    reviewed_at: null,
  };
}

function summarize(exceptions: ShiftException[]) {
  const open = exceptions.filter((exception) => exception.status === "open");
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  const byType: Record<string, number> = {};
  const byStatus = { open: 0, reviewed: 0, ignored: 0, resolved: 0 };

  for (const exception of exceptions) {
    bySeverity[exception.severity] += 1;
    byType[exception.type] = (byType[exception.type] || 0) + 1;
    byStatus[exception.status] += 1;
  }

  return {
    total: exceptions.length,
    open: open.length,
    critical: open.filter((exception) => exception.severity === "critical").length,
    warning: open.filter((exception) => exception.severity === "warning").length,
    info: open.filter((exception) => exception.severity === "info").length,
    by_severity: bySeverity,
    by_type: byType,
    by_status: byStatus,
  };
}

export async function buildShiftExceptions(ctx: any, date: string) {
  const dayOfWeek = getDayOfWeek(date);
  const [workers, attendance, schedules, reviews, recognitionAttempts] = await Promise.all([
    ctx.db
      .query("workers")
      .withIndex("by_active", (q: any) => q.eq("active", true))
      .collect(),
    listEffectiveAttendanceByTimestampRange(ctx, date),
    ctx.db
      .query("schedules")
      .withIndex("by_active", (q: any) => q.eq("active", true))
      .collect(),
    ctx.db
      .query("exceptionReviews")
      .withIndex("by_date", (q: any) => q.eq("date", date))
      .collect(),
    listRecognitionAttemptsByFactoryDate(ctx, { date, limit: 1000 }),
  ]);

  const reviewsByKey = new Map(reviews.map((review: any) => [review.exceptionKey, review]));
  const eventsByWorker = new Map<string, any[]>();
  const exceptions: ShiftException[] = [];

  for (const event of attendance) {
    const events = eventsByWorker.get(event.workerId) || [];
    events.push(event);
    eventsByWorker.set(event.workerId, events);
  }

  for (const worker of workers) {
    const schedule = getScheduleForWorker(worker, schedules, dayOfWeek);
    const workerId = String(worker._id);
    const workerEvents = [...(eventsByWorker.get(workerId) || [])].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    const clockIns = workerEvents.filter((event) => event.eventType === "clock_in");
    const clockOuts = workerEvents.filter((event) => event.eventType === "clock_out");
    const firstIn = clockIns[0] || null;
    const lastEvent = workerEvents[workerEvents.length - 1] || null;
    const lastOut = clockOuts[clockOuts.length - 1] || null;
    const workerName = worker.name || "Unknown worker";
    const department = worker.department || null;
    const baseLinks = {
      activity_log: `/log?date=${date}`,
      worker: `/workers`,
      schedules: "/schedules",
    };

    if (schedule && !firstIn) {
      const key = `${date}:missing_arrival:${workerId}`;
      exceptions.push(createException({
        key,
        date,
        type: "missing_arrival",
        severity: "critical",
        title: `${workerName} has not arrived`,
        description: `${workerName} is expected for ${schedule.name} starting at ${formatTime(schedule.startTime)}, but has no clock-in scan.`,
        worker_id: workerId,
        worker_name: workerName,
        department,
        kiosk_id: null,
        kiosk_name: null,
        first_seen: null,
        last_seen: null,
        schedule_name: schedule.name,
        scheduled_start: schedule.startTime,
        scheduled_end: schedule.endTime,
        event_count: 0,
        attendance_id: null,
        links: baseLinks,
      }));
    }

    if (schedule && firstIn) {
      const startMinutes = getMinutesFromTime(schedule.startTime);
      const firstInMinutes = getMinutesFromTimestamp(firstIn.timestamp);
      if (startMinutes !== null && firstInMinutes !== null && firstInMinutes > startMinutes) {
        const key = `${date}:late_arrival:${workerId}`;
        exceptions.push(createException({
          key,
          date,
          type: "late_arrival",
          severity: firstInMinutes - startMinutes >= 30 ? "critical" : "warning",
          title: `${workerName} arrived late`,
          description: `${workerName} clocked in at ${firstIn.timestamp.slice(11, 16)}, after the ${formatTime(schedule.startTime)} scheduled start.`,
          worker_id: workerId,
          worker_name: workerName,
          department,
          kiosk_id: firstIn.kioskId || null,
          kiosk_name: null,
          first_seen: firstIn.timestamp,
          last_seen: firstIn.timestamp,
          schedule_name: schedule.name,
          scheduled_start: schedule.startTime,
          scheduled_end: schedule.endTime,
          event_count: clockIns.length,
          attendance_id: String(firstIn._id).startsWith("correction:") ? null : String(firstIn._id),
          links: baseLinks,
        }));
      }
    }

    if (schedule && lastEvent?.eventType === "clock_in") {
      const endMinutes = getMinutesFromTime(schedule.endTime);
      const lastEventMinutes = getMinutesFromTimestamp(lastEvent.timestamp);
      const shouldFlagMissingClockOut =
        endMinutes !== null &&
        (dateHasPassed(date) || (lastEventMinutes !== null && lastEventMinutes > endMinutes));
      if (shouldFlagMissingClockOut) {
        const key = `${date}:missing_clock_out:${workerId}`;
        exceptions.push(createException({
          key,
          date,
          type: "missing_clock_out",
          severity: "warning",
          title: `${workerName} is still clocked in`,
          description: `${workerName} last scanned in at ${lastEvent.timestamp.slice(11, 16)} and has no clock-out after the ${formatTime(schedule.endTime)} scheduled end.`,
          worker_id: workerId,
          worker_name: workerName,
          department,
          kiosk_id: lastEvent.kioskId || null,
          kiosk_name: null,
          first_seen: firstIn?.timestamp || lastEvent.timestamp,
          last_seen: lastEvent.timestamp,
          schedule_name: schedule.name,
          scheduled_start: schedule.startTime,
          scheduled_end: schedule.endTime,
          event_count: workerEvents.length,
          attendance_id: String(lastEvent._id).startsWith("correction:") ? null : String(lastEvent._id),
          links: baseLinks,
        }));
      }
    }

    for (let index = 0; index < workerEvents.length; index += 1) {
      const event = workerEvents[index];
      const previous = workerEvents[index - 1];
      const repeated = previous && previous.eventType === event.eventType;
      const firstEventIsOut = index === 0 && event.eventType === "clock_out";
      if (!repeated && !firstEventIsOut) continue;

      const key = `${date}:scan_sequence:${workerId}:${event.timestamp}:${event.eventType}`;
      exceptions.push(createException({
        key,
        date,
        type: "scan_sequence",
        severity: firstEventIsOut ? "critical" : "warning",
        title: `${workerName} has a scan sequence issue`,
        description: firstEventIsOut
          ? `${workerName} clocked out without a prior clock-in scan today.`
          : `${workerName} has repeated ${event.eventType.replace("_", " ")} scans without the opposite event between them.`,
        worker_id: workerId,
        worker_name: workerName,
        department,
        kiosk_id: event.kioskId || null,
        kiosk_name: null,
        first_seen: previous?.timestamp || event.timestamp,
        last_seen: event.timestamp,
        schedule_name: schedule?.name || null,
        scheduled_start: schedule?.startTime || null,
        scheduled_end: schedule?.endTime || null,
        event_count: workerEvents.length,
        attendance_id: String(event._id).startsWith("correction:") ? null : String(event._id),
        links: baseLinks,
      }));
    }
  }

  const kioskNameCache = new Map<string, string | null>();
  async function resolveKioskName(kioskId?: string | null) {
    if (!kioskId) return null;
    if (kioskNameCache.has(kioskId)) return kioskNameCache.get(kioskId) || null;
    const kiosk = await findActiveKioskByIdentifier(ctx, kioskId);
    const name = kiosk?.name || null;
    kioskNameCache.set(kioskId, name);
    return name;
  }

  for (const attempt of recognitionAttempts) {
    const decision = String(attempt.decision || "unknown");
    const lowMarginAccepted = decision.startsWith("accepted") && typeof attempt.scoreMargin === "number" && attempt.scoreMargin <= LOW_MARGIN_THRESHOLD;
    const riskyDecision =
      decision === "near_miss" ||
      decision === "rejected_unknown" ||
      decision === "unknown" ||
      decision.startsWith("rejected");
    if (attempt.reviewed && !lowMarginAccepted && !riskyDecision) continue;
    if (!riskyDecision && !lowMarginAccepted && attempt.reviewed) continue;

    const attemptId = String(attempt.id);
    const key = `${date}:recognition_review:${attemptId}`;
    const candidate = attempt.candidateWorkerName || "Unknown person";
    const kioskName = await resolveKioskName(attempt.kioskId);
    exceptions.push(createException({
      key,
      date,
      type: "recognition_review",
      severity: decision === "near_miss" || lowMarginAccepted ? "warning" : "info",
      title: `${candidate} needs recognition review`,
      description: `${decision.replace(/_/g, " ")} at ${attempt.kioskId || "unknown kiosk"}${typeof attempt.scoreMargin === "number" ? ` with ${attempt.scoreMargin.toFixed(3)} score margin` : ""}.`,
      worker_id: attempt.candidateWorkerId || null,
      worker_name: attempt.candidateWorkerName || null,
      department: null,
      kiosk_id: attempt.kioskId || null,
      kiosk_name: kioskName,
      first_seen: attempt.timestamp,
      last_seen: attempt.timestamp,
      schedule_name: null,
      scheduled_start: null,
      scheduled_end: null,
      event_count: 1,
      attendance_id: null,
      links: {
        activity_log: `/log?date=${date}`,
        recognition_lab: buildHref("/calibration/recognition", {
          date,
          review_status: "all",
          attempt_id: attemptId,
        }),
        kiosk: "/kiosks",
      },
    }));
  }

  const hydrated = exceptions.map((exception) => withReview(exception, reviewsByKey.get(exception.key)));
  hydrated.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const statusOrder = { open: 0, reviewed: 1, resolved: 2, ignored: 3 };
    return (
      statusOrder[a.status] - statusOrder[b.status] ||
      severityOrder[a.severity] - severityOrder[b.severity] ||
      (a.first_seen || "").localeCompare(b.first_seen || "") ||
      a.title.localeCompare(b.title)
    );
  });

  return hydrated;
}

export const summary = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const date = args.date || new Date().toISOString().slice(0, 10);
    const exceptions = await buildShiftExceptions(ctx, date);
    return {
      date,
      generated_at: new Date().toISOString(),
      exceptions,
      summary: summarize(exceptions),
    };
  },
});

export const review = mutation({
  args: {
    exceptionKey: v.string(),
    date: v.string(),
    type: v.string(),
    status: v.union(v.literal("open"), v.literal("reviewed"), v.literal("ignored"), v.literal("resolved")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("exceptionReviews")
      .withIndex("by_key", (q) => q.eq("exceptionKey", args.exceptionKey))
      .first();
    const patch = {
      date: args.date,
      type: args.type,
      status: args.status,
      note: normalizeText(args.note),
      reviewedAt: args.status === "open" ? undefined : now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { id: existing._id, ...patch };
    }

    const id = await ctx.db.insert("exceptionReviews", {
      exceptionKey: args.exceptionKey,
      ...patch,
    });
    return { id, exceptionKey: args.exceptionKey, ...patch };
  },
});
