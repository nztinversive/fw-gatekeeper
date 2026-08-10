/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Convex authorization", () => {
  it("rejects an unauthenticated dashboard mutation", async () => {
    const t = convexTest(schema, modules);

    await expect(t.mutation(api.schedules.create, {
      name: "Unauthorized test schedule",
      days: "[1]",
      startTime: "08:00",
      endTime: "17:00",
    })).rejects.toThrow("Unauthorized");
  });

  it("allows an active admin and blocks viewer biometric access", async () => {
    const t = convexTest(schema, modules);
    const { adminId, viewerId } = await t.run(async (ctx) => {
      const adminId = await ctx.db.insert("users", { email: "admin@example.com" });
      const viewerId = await ctx.db.insert("users", { email: "viewer@example.com" });
      const now = new Date().toISOString();
      await ctx.db.insert("portalMembers", { userId: adminId, role: "admin", active: true, createdAt: now });
      await ctx.db.insert("portalMembers", { userId: viewerId, role: "viewer", active: true, createdAt: now });
      return { adminId, viewerId };
    });

    const admin = t.withIdentity({ subject: adminId });
    await expect(admin.mutation(api.schedules.create, {
      name: "Authorized test schedule",
      days: "[1]",
      startTime: "08:00",
      endTime: "17:00",
    })).resolves.toMatchObject({ id: expect.any(String) });

    const viewer = t.withIdentity({ subject: viewerId });
    await expect(viewer.query(api.workers.list, { includeEncodings: false })).resolves.toEqual([]);
    await expect(viewer.query(api.workers.list, { includeEncodings: true })).rejects.toThrow("Insufficient permissions");
  });
});
