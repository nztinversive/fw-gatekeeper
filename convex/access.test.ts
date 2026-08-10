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
});
