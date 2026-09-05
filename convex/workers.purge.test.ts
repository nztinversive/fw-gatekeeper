/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const encoding = Array.from({ length: 512 }, () => 0.1);

type Role = "admin" | "enrollment" | "viewer";

async function setup(role: Role) {
  const test = convexTest(schema, modules);
  const { userId, workerId, storageIds } = await test.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email: `${role}@example.com` });
    await ctx.db.insert("portalMembers", { userId, role, active: true, createdAt: new Date().toISOString() });
    const storageIds = [
      await ctx.storage.store(new Blob(["photo-1"], { type: "image/jpeg" })),
      await ctx.storage.store(new Blob(["photo-2"], { type: "image/jpeg" })),
    ];
    const workerId = await ctx.db.insert("workers", {
      name: "Purge Target",
      employeeId: "F-77",
      department: "Operations",
      faceEncoding: encoding,
      photoStorageIds: storageIds,
      enrolledAt: new Date().toISOString(),
      consentAt: new Date().toISOString(),
      active: true,
    });
    return { userId, workerId, storageIds };
  });
  return { test, actor: test.withIdentity({ subject: userId }), userId, workerId, storageIds };
}

describe("workers.purgeBiometrics", () => {
  it("removes the template and photos, deactivates the worker, and writes an audit row", async () => {
    const { test, actor, userId, workerId, storageIds } = await setup("admin");

    await test.run(async (ctx) => {
      for (const id of storageIds) {
        expect(await ctx.storage.getUrl(id)).not.toBeNull();
      }
    });

    await expect(actor.mutation(api.workers.purgeBiometrics, { id: workerId, reason: "  Terminated  " }))
      .resolves.toMatchObject({ ok: true });

    await test.run(async (ctx) => {
      const worker = await ctx.db.get(workerId);
      expect(worker).not.toBeNull();
      expect(worker!.faceEncoding).toBeUndefined();
      expect(worker!.photoStorageIds).toBeUndefined();
      expect(worker!.active).toBe(false);
      expect(typeof worker!.biometricsPurgedAt).toBe("string");
      expect(worker!.updatedAt).toBe(worker!.biometricsPurgedAt);
      // Non-biometric identity metadata is retained for attendance history.
      expect(worker!.name).toBe("Purge Target");

      for (const id of storageIds) {
        expect(await ctx.storage.getUrl(id)).toBeNull();
      }

      const audit = await ctx.db
        .query("auditLog")
        .withIndex("by_target", (q) => q.eq("targetTable", "workers").eq("targetId", workerId))
        .collect();
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorUserId: userId,
        action: "workers.purgeBiometrics",
        reason: "Terminated",
      });
      expect(audit[0].details).toContain("photosDeleted");
    });
  });

  it("drops the worker from the kiosk sync feed as inactive so cached templates are removed", async () => {
    const { test, actor, workerId } = await setup("admin");
    await actor.mutation(api.workers.purgeBiometrics, { id: workerId, reason: "Worker requested deletion" });

    const rows = await test.run(async (ctx) => {
      const worker = await ctx.db.get(workerId);
      return { active: worker!.active, faceEncoding: worker!.faceEncoding ?? null };
    });
    expect(rows.active).toBe(false);
    expect(rows.faceEncoding).toBeNull();
  });

  it("rejects an empty or whitespace-only reason", async () => {
    const { actor, workerId } = await setup("admin");
    await expect(actor.mutation(api.workers.purgeBiometrics, { id: workerId, reason: "" }))
      .rejects.toThrow("A reason is required to purge face data");
    await expect(actor.mutation(api.workers.purgeBiometrics, { id: workerId, reason: "   " }))
      .rejects.toThrow("A reason is required to purge face data");
  });

  it("rejects enrollment and viewer roles", async () => {
    for (const role of ["enrollment", "viewer"] as const) {
      const { test, actor, workerId, storageIds } = await setup(role);
      await expect(actor.mutation(api.workers.purgeBiometrics, { id: workerId, reason: "Not allowed" }))
        .rejects.toThrow("Insufficient permissions");
      await test.run(async (ctx) => {
        const worker = await ctx.db.get(workerId);
        expect(worker!.faceEncoding).toEqual(encoding);
        expect(worker!.active).toBe(true);
        for (const id of storageIds) {
          expect(await ctx.storage.getUrl(id)).not.toBeNull();
        }
      });
    }
  });

  it("records an audit row when a worker is deactivated", async () => {
    const { test, actor, userId, workerId } = await setup("admin");
    await actor.mutation(api.workers.remove, { id: workerId });
    await test.run(async (ctx) => {
      const audit = await ctx.db
        .query("auditLog")
        .withIndex("by_target", (q) => q.eq("targetTable", "workers").eq("targetId", workerId))
        .collect();
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorUserId: userId, action: "workers.remove" });
      // Deactivation alone keeps the template; only purge deletes it.
      const worker = await ctx.db.get(workerId);
      expect(worker!.faceEncoding).toEqual(encoding);
    });
  });

  it("stores consentAt on create and refreshes it on re-enrollment", async () => {
    const { actor, test } = await setup("admin");
    const created = await actor.mutation(api.workers.create, {
      name: "Consent Worker",
      employeeId: "F-88",
      department: "Operations",
      faceEncoding: encoding,
      consentAt: "2026-01-01T00:00:00.000Z",
    });
    const createdId = created.id as Id<"workers">;
    await test.run(async (ctx) => {
      expect((await ctx.db.get(createdId))!.consentAt).toBe("2026-01-01T00:00:00.000Z");
    });
    await actor.mutation(api.workers.update, { id: createdId, faceEncoding: encoding, consentAt: "2026-02-01T00:00:00.000Z" });
    await test.run(async (ctx) => {
      expect((await ctx.db.get(createdId))!.consentAt).toBe("2026-02-01T00:00:00.000Z");
    });
  });
});
