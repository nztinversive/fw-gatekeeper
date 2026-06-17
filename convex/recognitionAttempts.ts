import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const attemptInput = v.object({
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
  reviewed: v.optional(v.boolean()),
  reviewedLabel: v.optional(v.string()),
  reviewedNote: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
});

function normalizeOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeRequiredText(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function getNextDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function clampLimit(limit?: number) {
  if (!limit || !Number.isFinite(limit)) return 250;
  return Math.max(1, Math.min(1000, Math.floor(limit)));
}

function getScoreMargin(attempt: {
  bestScore?: number;
  secondBestScore?: number;
  scoreMargin?: number;
}) {
  if (attempt.scoreMargin !== undefined) return attempt.scoreMargin;
  if (attempt.bestScore !== undefined && attempt.secondBestScore !== undefined) {
    return attempt.bestScore - attempt.secondBestScore;
  }
  return undefined;
}

function serializeAttempt(attempt: any) {
  return {
    id: attempt._id,
    timestamp: attempt.timestamp,
    kiosk_id: attempt.kioskId,
    source_attempt_id: attempt.sourceAttemptId || null,
    face_detected: attempt.faceDetected ? 1 : 0,
    candidate_worker_id: attempt.candidateWorkerId || null,
    candidate_worker_name: attempt.candidateWorkerName || null,
    best_score: attempt.bestScore ?? null,
    second_best_score: attempt.secondBestScore ?? null,
    score_margin: attempt.scoreMargin ?? null,
    decision: attempt.decision,
    threshold: attempt.threshold,
    liveness_confirmed:
      attempt.livenessConfirmed === undefined ? null : attempt.livenessConfirmed ? 1 : 0,
    model_version: attempt.modelVersion || null,
    image_quality: attempt.imageQuality ?? null,
    face_quality: attempt.faceQuality ?? null,
    brightness: attempt.brightness ?? null,
    blur: attempt.blur ?? null,
    reviewed: attempt.reviewed ? 1 : 0,
    reviewed_label: attempt.reviewedLabel || null,
    reviewed_note: attempt.reviewedNote || null,
    reviewed_at: attempt.reviewedAt || null,
    created_at: attempt.createdAt,
    updated_at: attempt.updatedAt || null,
  };
}

function normalizeAttempt(attempt: {
  timestamp: string;
  kioskId: string;
  sourceAttemptId?: string;
  faceDetected: boolean;
  candidateWorkerId?: string;
  candidateWorkerName?: string;
  bestScore?: number;
  secondBestScore?: number;
  scoreMargin?: number;
  decision: string;
  threshold: number;
  livenessConfirmed?: boolean;
  modelVersion?: string;
  imageQuality?: number;
  faceQuality?: number;
  brightness?: number;
  blur?: number;
  reviewed?: boolean;
  reviewedLabel?: string;
  reviewedNote?: string;
  reviewedAt?: string;
}) {
  const reviewed = attempt.reviewed ?? false;
  return {
    timestamp: normalizeRequiredText(attempt.timestamp, "timestamp"),
    kioskId: normalizeRequiredText(attempt.kioskId, "kioskId"),
    sourceAttemptId: normalizeOptionalText(attempt.sourceAttemptId),
    faceDetected: attempt.faceDetected,
    candidateWorkerId: normalizeOptionalText(attempt.candidateWorkerId),
    candidateWorkerName: normalizeOptionalText(attempt.candidateWorkerName),
    bestScore: attempt.bestScore,
    secondBestScore: attempt.secondBestScore,
    scoreMargin: getScoreMargin(attempt),
    decision: normalizeRequiredText(attempt.decision, "decision"),
    threshold: attempt.threshold,
    livenessConfirmed: attempt.livenessConfirmed,
    modelVersion: normalizeOptionalText(attempt.modelVersion),
    imageQuality: attempt.imageQuality,
    faceQuality: attempt.faceQuality,
    brightness: attempt.brightness,
    blur: attempt.blur,
    reviewed,
    reviewedLabel: normalizeOptionalText(attempt.reviewedLabel),
    reviewedNote: normalizeOptionalText(attempt.reviewedNote),
    reviewedAt: reviewed ? normalizeOptionalText(attempt.reviewedAt) : undefined,
  };
}

async function listRangeInternal(
  ctx: any,
  args: {
    startTimestamp: string;
    endTimestamp: string;
    kioskId?: string;
    reviewed?: boolean;
    limit?: number;
  },
) {
  const kioskId = normalizeOptionalText(args.kioskId);
  const limit = clampLimit(args.limit);
  const start = args.startTimestamp;
  const end = args.endTimestamp;

  let builder;
  if (kioskId && args.reviewed !== undefined) {
    builder = ctx.db
      .query("recognitionAttempts")
      .withIndex("by_kiosk_reviewed_timestamp", (q: any) =>
        q.eq("kioskId", kioskId).eq("reviewed", args.reviewed).gte("timestamp", start).lt("timestamp", end),
      );
  } else if (kioskId) {
    builder = ctx.db
      .query("recognitionAttempts")
      .withIndex("by_kiosk_timestamp", (q: any) =>
        q.eq("kioskId", kioskId).gte("timestamp", start).lt("timestamp", end),
      );
  } else if (args.reviewed !== undefined) {
    builder = ctx.db
      .query("recognitionAttempts")
      .withIndex("by_reviewed_timestamp", (q: any) =>
        q.eq("reviewed", args.reviewed).gte("timestamp", start).lt("timestamp", end),
      );
  } else {
    builder = ctx.db
      .query("recognitionAttempts")
      .withIndex("by_timestamp", (q: any) => q.gte("timestamp", start).lt("timestamp", end));
  }

  const attempts = await builder.order("desc").take(limit);
  return attempts.map(serializeAttempt);
}

export const bulkIngest = mutation({
  args: { attempts: v.array(attemptInput) },
  handler: async (ctx, args) => {
    const seenKeys = new Set<string>();
    const insertedIds = [];
    let skipped = 0;
    const now = new Date().toISOString();

    for (const attempt of args.attempts) {
      const normalized = normalizeAttempt(attempt);
      const dedupeKey =
        normalized.sourceAttemptId ||
        `${normalized.kioskId}:${normalized.timestamp}:${normalized.candidateWorkerId || ""}:${normalized.decision}`;
      if (seenKeys.has(dedupeKey)) {
        skipped++;
        continue;
      }
      seenKeys.add(dedupeKey);

      if (normalized.sourceAttemptId) {
        const existing = await ctx.db
          .query("recognitionAttempts")
          .withIndex("by_source_attempt_id", (q) => q.eq("sourceAttemptId", normalized.sourceAttemptId))
          .first();
        if (existing) {
          skipped++;
          continue;
        }
      }

      const id = await ctx.db.insert("recognitionAttempts", {
        ...normalized,
        reviewedAt: normalized.reviewed ? normalized.reviewedAt || now : undefined,
        createdAt: now,
      });
      insertedIds.push(id);
    }

    return { ingested: insertedIds.length, skipped, ids: insertedIds };
  },
});

export const listByDate = query({
  args: {
    date: v.optional(v.string()),
    kioskId: v.optional(v.string()),
    reviewed: v.optional(v.boolean()),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const date = args.date || new Date().toISOString().slice(0, 10);
    return await listRangeInternal(ctx, {
      startTimestamp: date,
      endTimestamp: getNextDateKey(date),
      kioskId: args.kioskId,
      reviewed: args.reviewed,
      limit: args.limit,
    });
  },
});

export const listRange = query({
  args: {
    startTimestamp: v.string(),
    endTimestamp: v.string(),
    kioskId: v.optional(v.string()),
    reviewed: v.optional(v.boolean()),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    return await listRangeInternal(ctx, args);
  },
});

export const listForReview = query({
  args: {
    reviewed: v.optional(v.boolean()),
    kioskId: v.optional(v.string()),
    startTimestamp: v.optional(v.string()),
    endTimestamp: v.optional(v.string()),
    limit: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    return await listRangeInternal(ctx, {
      startTimestamp: args.startTimestamp || "1970-01-01T00:00:00.000Z",
      endTimestamp: args.endTimestamp || "9999-12-31T23:59:59.999Z",
      kioskId: args.kioskId,
      reviewed: args.reviewed ?? false,
      limit: args.limit,
    });
  },
});

export const updateReview = mutation({
  args: {
    id: v.id("recognitionAttempts"),
    reviewed: v.optional(v.boolean()),
    reviewedLabel: v.optional(v.string()),
    reviewedNote: v.optional(v.string()),
    reviewedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Recognition attempt not found");
    }

    const reviewed = args.reviewed ?? true;
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      reviewed,
      updatedAt: now,
    };
    if (args.reviewedLabel !== undefined) {
      updates.reviewedLabel = normalizeOptionalText(args.reviewedLabel);
    }
    if (args.reviewedNote !== undefined) {
      updates.reviewedNote = normalizeOptionalText(args.reviewedNote);
    }
    updates.reviewedAt = reviewed ? normalizeOptionalText(args.reviewedAt) || existing.reviewedAt || now : undefined;

    await ctx.db.patch(args.id, updates);

    const updated = await ctx.db.get(args.id);
    return updated ? serializeAttempt(updated) : null;
  },
});
