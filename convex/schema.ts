import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  portalMembers: defineTable({
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("enrollment"), v.literal("viewer")),
    active: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_active", ["active"]),

  workers: defineTable({
    name: v.string(),
    employeeId: v.optional(v.string()),
    department: v.string(),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
    faceEncoding: v.optional(v.array(v.float64())),
    enrolledAt: v.string(),
    updatedAt: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_active", ["active"]),

  attendance: defineTable({
    workerId: v.string(),
    eventType: v.string(),
    kioskId: v.optional(v.string()),
    timestamp: v.string(),
    idempotencyKey: v.optional(v.string()),
    synced: v.boolean(),
    workerName: v.optional(v.string()),
    confidence: v.optional(v.float64()),
    livenessConfirmed: v.optional(v.boolean()),
  }).index("by_timestamp", ["timestamp"])
    .index("by_worker", ["workerId"]),

  recognitionAttempts: defineTable({
    timestamp: v.string(),
    kioskId: v.string(),
    sourceAttemptId: v.optional(v.string()),
    faceDetected: v.boolean(),
    candidateWorkerId: v.optional(v.string()),
    candidateWorkerName: v.optional(v.string()),
    bestScore: v.optional(v.float64()),
    secondBestScore: v.optional(v.float64()),
    scoreMargin: v.optional(v.float64()),
    decision: v.string(),
    threshold: v.float64(),
    livenessConfirmed: v.optional(v.boolean()),
    modelVersion: v.optional(v.string()),
    imageQuality: v.optional(v.float64()),
    faceQuality: v.optional(v.float64()),
    brightness: v.optional(v.float64()),
    blur: v.optional(v.float64()),
    reviewed: v.boolean(),
    reviewedLabel: v.optional(v.string()),
    reviewedNote: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.optional(v.string()),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_kiosk_timestamp", ["kioskId", "timestamp"])
    .index("by_reviewed_timestamp", ["reviewed", "timestamp"])
    .index("by_kiosk_reviewed_timestamp", ["kioskId", "reviewed", "timestamp"])
    .index("by_source_attempt_id", ["sourceAttemptId"]),

  kiosks: defineTable({
    name: v.string(),
    kioskId: v.optional(v.string()),
    type: v.string(),
    location: v.string(),
    lastSync: v.optional(v.string()),
    active: v.boolean(),
  }).index("by_active", ["active"])
    .index("by_kiosk_id", ["kioskId"]),

  schedules: defineTable({
    name: v.string(),
    days: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    department: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.string(),
  }).index("by_active", ["active"]),
});
