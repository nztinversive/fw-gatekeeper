import { query } from "./_generated/server";
import { v } from "convex/values";
import { listEffectiveAttendanceByTimestampRange } from "./attendance";
import { buildShiftExceptions } from "./shiftExceptions";

type WorkerCoverageStatus = "present" | "late" | "missing" | "clocked_out" | "still_clocked_in";
type DepartmentCoverageStatus = "covered" | "short" | "critical" | "unscheduled";
type ActionPriority = "critical" | "warning" | "info";
type KioskStatus = "online" | "stale" | "offline" | "never_synced";

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000;
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

function getDayOfWeek(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function getMinutesFromTime(value?: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getMinutesFromTimestamp(timestamp?: string | null): number | null {
  if (!timestamp) return null;
  const match = timestamp.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseScheduleDays(days: string): number[] {
  try {
    const parsed = JSON.parse(days);
    return Array.isArray(parsed) ? parsed.filter((day) => Number.isInteger(day)) : [];
  } catch {
    return [];
  }
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || "";
}

function getScheduleForWorker(worker: any, schedules: any[], dayOfWeek: number) {
  const todaysSchedules = schedules.filter((schedule) => parseScheduleDays(schedule.days).includes(dayOfWeek));
  const workerDepartment = normalizeText(worker.department).toLowerCase();
  return (
    todaysSchedules.find(
      (schedule) => normalizeText(schedule.department).toLowerCase() === workerDepartment,
    ) ||
    todaysSchedules.find((schedule) => !normalizeText(schedule.department)) ||
    null
  );
}

function getKioskStatus(lastSync?: string | null): KioskStatus {
  if (!lastSync) return "never_synced";
  const ageMs = Date.now() - new Date(lastSync).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "online";
  if (ageMs <= ONLINE_THRESHOLD_MS) return "online";
  if (ageMs <= STALE_THRESHOLD_MS) return "stale";
  return "offline";
}

function actionRank(priority: ActionPriority) {
  return { critical: 0, warning: 1, info: 2 }[priority];
}

function getWorkerStatus(input: {
  schedule: any;
  firstIn: any | null;
  lastEvent: any | null;
}): WorkerCoverageStatus {
  if (!input.firstIn) return "missing";
  const startMinutes = getMinutesFromTime(input.schedule?.startTime);
  const firstInMinutes = getMinutesFromTimestamp(input.firstIn.timestamp);
  if (input.lastEvent?.eventType === "clock_out") return "clocked_out";
  if (startMinutes !== null && firstInMinutes !== null && firstInMinutes > startMinutes) return "late";
  return "present";
}

export async function buildShiftBriefing(ctx: any, date: string) {
    const dayOfWeek = getDayOfWeek(date);
    const [workers, schedules, attendance, kiosks, exceptions] = await Promise.all([
      ctx.db
        .query("workers")
        .withIndex("by_active", (q: any) => q.eq("active", true))
        .collect(),
      ctx.db
        .query("schedules")
        .withIndex("by_active", (q: any) => q.eq("active", true))
        .collect(),
      listEffectiveAttendanceByTimestampRange(ctx, date),
      ctx.db
        .query("kiosks")
        .withIndex("by_active", (q: any) => q.eq("active", true))
        .collect(),
      buildShiftExceptions(ctx, date),
    ]) as [any[], any[], any[], any[], any[]];

    const todaysSchedules = schedules.filter((schedule) => parseScheduleDays(schedule.days).includes(dayOfWeek));
    const eventsByWorker = new Map<string, any[]>();
    for (const event of attendance) {
      const events = eventsByWorker.get(event.workerId) || [];
      events.push(event);
      eventsByWorker.set(event.workerId, events);
    }

    const workerRows = [];
    const departmentMap = new Map<string, any>();
    let expected = 0;
    let present = 0;
    let late = 0;
    let missing = 0;
    let clockedOut = 0;

    for (const worker of workers) {
      const schedule = getScheduleForWorker(worker, schedules, dayOfWeek);
      if (!schedule) continue;

      expected += 1;
      const workerId = String(worker._id);
      const events = [...(eventsByWorker.get(workerId) || [])].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      );
      const firstIn = events.find((event) => event.eventType === "clock_in") || null;
      const lastEvent = events[events.length - 1] || null;
      const status = getWorkerStatus({ schedule, firstIn, lastEvent });
      const department = normalizeText(worker.department) || "Unassigned";
      const departmentKey = `${department}:${schedule.name}:${schedule.startTime}:${schedule.endTime}`;

      if (status === "late") late += 1;
      if (status === "missing") missing += 1;
      if (status === "clocked_out") clockedOut += 1;
      if (status === "present" || status === "late") present += 1;

      if (!departmentMap.has(departmentKey)) {
        departmentMap.set(departmentKey, {
          department,
          schedule_name: schedule.name,
          scheduled_start: schedule.startTime,
          scheduled_end: schedule.endTime,
          expected: 0,
          present: 0,
          late: 0,
          missing: 0,
          clocked_out: 0,
          status: "covered" as DepartmentCoverageStatus,
        });
      }

      const departmentRow = departmentMap.get(departmentKey);
      departmentRow.expected += 1;
      if (status === "present" || status === "late") departmentRow.present += 1;
      if (status === "late") departmentRow.late += 1;
      if (status === "missing") departmentRow.missing += 1;
      if (status === "clocked_out") departmentRow.clocked_out += 1;

      workerRows.push({
        worker_id: workerId,
        worker_name: worker.name || "Unknown worker",
        department,
        schedule_name: schedule.name,
        scheduled_start: schedule.startTime,
        scheduled_end: schedule.endTime,
        status,
        first_seen: firstIn?.timestamp || null,
        last_seen: lastEvent?.timestamp || null,
        event_count: events.length,
      });
    }

    const departmentRows = [...departmentMap.values()].map((row) => {
      let status: DepartmentCoverageStatus = "covered";
      if (row.missing > 0 || row.late > 0) status = "short";
      if (row.present === 0 && row.expected > 0) status = "critical";
      return { ...row, status };
    });
    departmentRows.sort((a, b) =>
      (b.missing + b.late) - (a.missing + a.late) ||
      a.department.localeCompare(b.department),
    );

    workerRows.sort((a, b) => {
      const order: Record<WorkerCoverageStatus, number> = {
        missing: 0,
        late: 1,
        still_clocked_in: 2,
        present: 3,
        clocked_out: 4,
      };
      return order[a.status] - order[b.status] || a.worker_name.localeCompare(b.worker_name);
    });

    const kioskRows = kiosks.map((kiosk) => ({
      id: String(kiosk._id),
      name: kiosk.name,
      kiosk_id: kiosk.kioskId || null,
      type: kiosk.type,
      location: kiosk.location,
      last_sync: kiosk.lastSync || null,
      status: getKioskStatus(kiosk.lastSync),
    }));
    const kioskCounts = kioskRows.reduce(
      (acc, kiosk) => {
        acc[kiosk.status] += 1;
        return acc;
      },
      { online: 0, stale: 0, offline: 0, never_synced: 0 } as Record<KioskStatus, number>,
    );

    const openExceptions = exceptions.filter((exception) => exception.status === "open");
    const actionItems = [
      ...departmentRows
        .filter((row) => row.status !== "covered")
        .map((row) => ({
          id: `coverage:${row.department}:${row.schedule_name}`,
          priority: row.status === "critical" ? "critical" as ActionPriority : "warning" as ActionPriority,
          label: `${row.department} coverage ${row.status === "critical" ? "critical" : "short"}`,
          description: `${row.present}/${row.expected} expected workers are currently present; ${row.missing} missing and ${row.late} late.`,
          href: `/briefing?date=${date}`,
        })),
      ...openExceptions.slice(0, 8).map((exception) => ({
        id: exception.key,
        priority: exception.severity as ActionPriority,
        label: exception.title,
        description: exception.description,
        href: "/exceptions",
      })),
      ...kioskRows
        .filter((kiosk) => kiosk.status === "offline" || kiosk.status === "never_synced" || kiosk.status === "stale")
        .map((kiosk) => ({
          id: `kiosk:${kiosk.id}`,
          priority: kiosk.status === "stale" ? "warning" as ActionPriority : "critical" as ActionPriority,
          label: `${kiosk.name} is ${kiosk.status === "never_synced" ? "not synced" : kiosk.status}`,
          description: `${kiosk.location || "No location set"} may reduce confidence in today's coverage view.`,
          href: "/kiosks",
        })),
      ...(todaysSchedules.length === 0
        ? [{
            id: "schedules:none-today",
            priority: "warning" as ActionPriority,
            label: "No schedule is active today",
            description: "Coverage risk cannot be calculated until a schedule includes this day.",
            href: "/schedules",
          }]
        : []),
    ].sort((a, b) => actionRank(a.priority) - actionRank(b.priority) || a.label.localeCompare(b.label));

    return {
      date,
      generated_at: new Date().toISOString(),
      summary: {
        expected,
        present,
        late,
        missing,
        clocked_out: clockedOut,
        departments: departmentRows.length,
        open_exceptions: openExceptions.length,
        critical_actions: actionItems.filter((item) => item.priority === "critical").length,
        kiosk_warnings: kioskCounts.stale + kioskCounts.offline + kioskCounts.never_synced,
      },
      departments: departmentRows,
      workers: workerRows,
      action_items: actionItems,
      kiosks: {
        total: kioskRows.length,
        counts: kioskCounts,
        rows: kioskRows,
      },
      schedules: {
        active_today: todaysSchedules.length,
        total_active: schedules.length,
      },
    };
}

export const summary = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const date = args.date || new Date().toISOString().slice(0, 10);
    return buildShiftBriefing(ctx, date);
  },
});
