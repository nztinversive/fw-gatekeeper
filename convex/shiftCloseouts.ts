import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { buildShiftExceptions } from "./shiftExceptions";
import { buildShiftBriefing } from "./shiftBriefing";

type CloseoutStatus = "open" | "completed" | "reopened";

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function buildChecklist(input: {
  openExceptions: any[];
  criticalExceptions: any[];
  missingClockOuts: any[];
  recognitionReviews: any[];
  kioskWarnings: number;
  acknowledgedBlockers: boolean;
}) {
  const criticalClear = input.criticalExceptions.length === 0 || input.acknowledgedBlockers;
  const missingClockOutsClear = input.missingClockOuts.length === 0 || input.acknowledgedBlockers;
  const kioskWarningsClear = input.kioskWarnings === 0 || input.acknowledgedBlockers;
  const recognitionReviewsClear = input.recognitionReviews.length === 0 || input.acknowledgedBlockers;

  return [
    {
      id: "critical_exceptions",
      label: "Critical exceptions reviewed",
      status: criticalClear ? "clear" : "blocked",
      count: input.criticalExceptions.length,
      href: "/exceptions",
      description: input.criticalExceptions.length
        ? `${input.criticalExceptions.length} critical exception${input.criticalExceptions.length === 1 ? "" : "s"} still need supervisor review.`
        : "No open critical exceptions.",
    },
    {
      id: "missing_clock_outs",
      label: "Missing clock-outs reviewed",
      status: missingClockOutsClear ? "clear" : "blocked",
      count: input.missingClockOuts.length,
      href: "/exceptions",
      description: input.missingClockOuts.length
        ? `${input.missingClockOuts.length} missing clock-out exception${input.missingClockOuts.length === 1 ? "" : "s"} still need acknowledgement.`
        : "No missing clock-out exceptions are open.",
    },
    {
      id: "kiosk_warnings",
      label: "Kiosk trust acknowledged",
      status: kioskWarningsClear ? "clear" : "blocked",
      count: input.kioskWarnings,
      href: "/kiosks",
      description: input.kioskWarnings
        ? `${input.kioskWarnings} kiosk trust warning${input.kioskWarnings === 1 ? "" : "s"} may affect shift confidence.`
        : "All kiosk trust signals are clear.",
    },
    {
      id: "recognition_reviews",
      label: "Recognition review issues acknowledged",
      status: recognitionReviewsClear ? "clear" : "blocked",
      count: input.recognitionReviews.length,
      href: "/calibration/recognition",
      description: input.recognitionReviews.length
        ? `${input.recognitionReviews.length} recognition review item${input.recognitionReviews.length === 1 ? "" : "s"} remain open.`
        : "No recognition review exceptions are open.",
    },
  ];
}

async function buildCloseoutPayload(ctx: any, date: string) {
  const [briefing, exceptions, closeout] = await Promise.all([
    buildShiftBriefing(ctx, date),
    buildShiftExceptions(ctx, date),
    ctx.db
      .query("shiftCloseouts")
      .withIndex("by_date", (q: any) => q.eq("date", date))
      .first(),
  ]);
  const attendanceCorrections = await ctx.db
    .query("attendanceCorrections")
    .withIndex("by_date", (q: any) => q.eq("date", date))
    .collect();

  const openExceptions = exceptions.filter((exception: any) => exception.status === "open");
  const criticalExceptions = openExceptions.filter((exception: any) => exception.severity === "critical");
  const missingClockOuts = openExceptions.filter((exception: any) => exception.type === "missing_clock_out");
  const recognitionReviews = openExceptions.filter((exception: any) => exception.type === "recognition_review");
  const kioskWarnings = briefing.summary.kiosk_warnings || 0;
  const acknowledgedBlockers = closeout?.acknowledgedBlockers ?? false;
  const checklist = buildChecklist({
    openExceptions,
    criticalExceptions,
    missingClockOuts,
    recognitionReviews,
    kioskWarnings,
    acknowledgedBlockers,
  });
  const blockers = checklist.filter((item) => item.status === "blocked");
  const canComplete = blockers.length === 0;

  return {
    date,
    generated_at: new Date().toISOString(),
    closeout: closeout
      ? {
          id: String(closeout._id),
          date: closeout.date,
          status: closeout.status as CloseoutStatus,
          supervisor_name: closeout.supervisorName || null,
          notes: closeout.notes || "",
          acknowledged_blockers: closeout.acknowledgedBlockers,
          completed_at: closeout.completedAt || null,
          reopened_at: closeout.reopenedAt || null,
          updated_at: closeout.updatedAt,
          snapshot: {
            expected: closeout.expected,
            present: closeout.present,
            late: closeout.late,
            missing: closeout.missing,
            open_exceptions: closeout.openExceptions,
            critical_exceptions: closeout.criticalExceptions,
            kiosk_warnings: closeout.kioskWarnings,
          },
        }
      : null,
    summary: {
      expected: briefing.summary.expected,
      present: briefing.summary.present,
      late: briefing.summary.late,
      missing: briefing.summary.missing,
      open_exceptions: openExceptions.length,
      critical_exceptions: criticalExceptions.length,
      missing_clock_outs: missingClockOuts.length,
      recognition_reviews: recognitionReviews.length,
      kiosk_warnings: kioskWarnings,
      attendance_corrections: attendanceCorrections.length,
    },
    checklist,
    blockers,
    can_complete: canComplete,
    action_links: [
      { label: "Briefing", href: `/briefing?date=${date}` },
      { label: "Exceptions", href: `/exceptions?date=${date}` },
      { label: "Activity Log", href: `/log?date=${date}` },
      { label: "Kiosks", href: "/kiosks" },
      { label: "Recognition Lab", href: `/calibration/recognition?date=${date}` },
    ],
  };
}

export const get = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const date = args.date || new Date().toISOString().slice(0, 10);
    return buildCloseoutPayload(ctx, date);
  },
});

export const save = mutation({
  args: {
    date: v.string(),
    action: v.union(v.literal("save"), v.literal("complete"), v.literal("reopen")),
    supervisorName: v.optional(v.string()),
    notes: v.optional(v.string()),
    acknowledgedBlockers: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const current = await buildCloseoutPayload(ctx, args.date);
    const existing = await ctx.db
      .query("shiftCloseouts")
      .withIndex("by_date", (q: any) => q.eq("date", args.date))
      .first();
    const now = new Date().toISOString();
    const supervisorName = normalizeText(args.supervisorName);
    const notes = normalizeText(args.notes);
    const acknowledgedBlockers = args.acknowledgedBlockers ?? existing?.acknowledgedBlockers ?? false;

    if (args.action === "complete" && !current.can_complete && (!acknowledgedBlockers || !notes)) {
      throw new Error("Closeout has blockers. Add an acknowledgement note before completing.");
    }

    const status: CloseoutStatus =
      args.action === "complete" ? "completed" : args.action === "reopen" ? "reopened" : existing?.status || "open";

    const patch = {
      date: args.date,
      status,
      supervisorName,
      notes,
      acknowledgedBlockers,
      expected: current.summary.expected,
      present: current.summary.present,
      late: current.summary.late,
      missing: current.summary.missing,
      openExceptions: current.summary.open_exceptions,
      criticalExceptions: current.summary.critical_exceptions,
      kioskWarnings: current.summary.kiosk_warnings,
      completedAt: args.action === "complete" ? now : existing?.completedAt,
      reopenedAt: args.action === "reopen" ? now : existing?.reopenedAt,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { id: existing._id, ...patch };
    }

    const id = await ctx.db.insert("shiftCloseouts", {
      ...patch,
      createdAt: now,
    });
    return { id, ...patch };
  },
});
