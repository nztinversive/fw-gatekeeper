/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Thursday, so a Mon-Fri schedule applies. Central Daylight Time (UTC-5).
const DATE = "2026-09-03";

async function seedShift() {
  const t = convexTest(schema, modules);
  const adminId = await t.run(async (ctx) => {
    const now = new Date().toISOString();
    const userId = await ctx.db.insert("users", { email: "admin@example.com" });
    await ctx.db.insert("portalMembers", { userId, role: "admin", active: true, createdAt: now });
    const workerId = await ctx.db.insert("workers", {
      name: "Evening Worker",
      department: "Operations",
      enrolledAt: now,
      active: true,
    });
    await ctx.db.insert("schedules", {
      name: "Second shift",
      days: "[1,2,3,4,5]",
      startTime: "06:00",
      endTime: "22:00",
      active: true,
      createdAt: now,
    });
    await ctx.db.insert("attendance", {
      workerId: String(workerId),
      eventType: "clock_in",
      kioskId: "kiosk-entry-1",
      timestamp: `${DATE}T07:00:00`,
      synced: true,
    });
    return userId;
  });
  return t.withIdentity({ subject: adminId });
}

function missingClockOuts(payload: any) {
  return payload.exceptions.filter((exception: any) => exception.type === "missing_clock_out");
}

describe("missing clock-out timing uses the factory-local day", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not flag a worker mid-shift at 20:30 Central even though the UTC date has rolled over", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-09-04T01:30:00Z is still 2026-09-03 20:30 in America/Chicago.
    vi.setSystemTime(new Date("2026-09-04T01:30:00.000Z"));

    const admin = await seedShift();
    const payload = await admin.query(api.shiftExceptions.summary, { date: DATE });

    expect(missingClockOuts(payload)).toHaveLength(0);
  });

  it("flags the worker once the factory-local day has actually passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-09-04 09:00 Central.
    vi.setSystemTime(new Date("2026-09-04T14:00:00.000Z"));

    const admin = await seedShift();
    const payload = await admin.query(api.shiftExceptions.summary, { date: DATE });

    expect(missingClockOuts(payload)).toHaveLength(1);
    expect(missingClockOuts(payload)[0]).toMatchObject({ worker_name: "Evening Worker", severity: "warning" });
  });

  it("flags the worker on the same day once the scheduled end has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-09-03 22:30 Central, after the 22:00 end. The rule keys on the
    // last event's time versus schedule end, so a late-evening clock-in is
    // used to exercise that branch.
    vi.setSystemTime(new Date("2026-09-04T03:30:00.000Z"));

    const admin = await seedShift();
    await admin.run(async (ctx) => {
      const worker = await ctx.db.query("workers").first();
      await ctx.db.insert("attendance", {
        workerId: String(worker!._id),
        eventType: "clock_out",
        kioskId: "kiosk-exit-1",
        timestamp: `${DATE}T12:00:00`,
        synced: true,
      });
      await ctx.db.insert("attendance", {
        workerId: String(worker!._id),
        eventType: "clock_in",
        kioskId: "kiosk-entry-1",
        timestamp: `${DATE}T22:15:00`,
        synced: true,
      });
    });
    const payload = await admin.query(api.shiftExceptions.summary, { date: DATE });

    expect(missingClockOuts(payload)).toHaveLength(1);
  });
});
