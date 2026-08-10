import { internalQuery, query, mutation } from "./_generated/server";
import { v } from "convex/values";

const SUPPORTED_ENCODING_LENGTHS = new Set([128, 512]);

function isSupportedFaceEncoding(encoding?: number[]) {
  return (
    encoding === undefined ||
    (SUPPORTED_ENCODING_LENGTHS.has(encoding.length) && encoding.every((value) => Number.isFinite(value)))
  );
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeDepartment(department?: string) {
  return department?.trim() || "";
}

function normalizeEmployeeId(employeeId?: string) {
  return employeeId?.trim() || undefined;
}

function getEncodingStatus(encoding?: number[]) {
  if (!encoding || encoding.length === 0) return "missing" as const;
  return isSupportedFaceEncoding(encoding) ? "valid" as const : "invalid" as const;
}

async function findWorkerByName(ctx: any, name: string) {
  const normalizedLower = normalizeName(name).toLocaleLowerCase();
  if (!normalizedLower) {
    return null;
  }
  const workers = await ctx.db.query("workers").collect();
  return workers.find((worker: any) => worker.name.trim().toLocaleLowerCase() === normalizedLower) || null;
}

export const list = query({
  args: { includeEncodings: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const workers = await ctx.db
      .query("workers")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return workers.map((w) => {
      const encodingStatus = getEncodingStatus(w.faceEncoding);
      return {
        id: w._id,
        name: w.name,
        employee_id: w.employeeId || "",
        department: w.department,
        photo_url: null,
        ...(args.includeEncodings ? { face_encoding: w.faceEncoding || null } : {}),
        has_face_encoding: encodingStatus === "valid",
        encoding_status: encodingStatus,
        enrolled_at: w.enrolledAt,
        active: 1,
      };
    });
  },
});

export const get = query({
  args: { id: v.id("workers") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.id);
    if (!w || !w.active) return null;
    return {
      id: w._id,
      name: w.name,
      employee_id: w.employeeId || "",
      department: w.department,
      photo_url: null,
      face_encoding: w.faceEncoding || null,
      has_face_encoding: getEncodingStatus(w.faceEncoding) === "valid",
      encoding_status: getEncodingStatus(w.faceEncoding),
      enrolled_at: w.enrolledAt,
      active: 1,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    employeeId: v.optional(v.string()),
    department: v.optional(v.string()),
    faceEncoding: v.array(v.float64()),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    if (!name) {
      throw new Error("Worker name is required");
    }
    if (!isSupportedFaceEncoding(args.faceEncoding)) {
      throw new Error("faceEncoding must contain 128 or 512 finite values");
    }
    const now = new Date().toISOString();
    const employeeId = normalizeEmployeeId(args.employeeId);
    const department = normalizeDepartment(args.department);
    const existing = await findWorkerByName(ctx, name);

    if (existing?.active) {
      throw new Error("Worker name already exists");
    }

    if (existing && !existing.active) {
      await ctx.db.patch(existing._id, {
        name,
        employeeId,
        department,
        faceEncoding: args.faceEncoding,
        photoStorageIds: args.photoStorageIds,
        enrolledAt: now,
        updatedAt: now,
        active: true,
      });
      return { id: existing._id, name, employeeId, department };
    }

    const id = await ctx.db.insert("workers", {
      name,
      employeeId,
      department,
      faceEncoding: args.faceEncoding,
      photoStorageIds: args.photoStorageIds,
      enrolledAt: now,
      updatedAt: now,
      active: true,
    });
    return { id, name, employeeId, department };
  },
});

export const findByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const worker = await findWorkerByName(ctx, args.name);
    if (!worker) {
      return null;
    }
    return {
      id: worker._id,
      name: worker.name,
      active: worker.active ? 1 : 0,
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("workers"),
    name: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    department: v.optional(v.string()),
    faceEncoding: v.optional(v.array(v.float64())),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
    enrolledAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (!isSupportedFaceEncoding(fields.faceEncoding)) {
      throw new Error("faceEncoding must contain 128 or 512 finite values");
    }
    if (fields.name !== undefined) {
      const trimmedName = normalizeName(fields.name);
      if (!trimmedName) {
        throw new Error("Worker name is required");
      }
      const existing = await findWorkerByName(ctx, trimmedName);
      if (existing && existing._id !== id && existing.active) {
        throw new Error("Worker name already exists");
      }
      updates.name = trimmedName;
    }
    if (fields.employeeId !== undefined) updates.employeeId = normalizeEmployeeId(fields.employeeId);
    if (fields.department !== undefined) updates.department = normalizeDepartment(fields.department);
    if (fields.faceEncoding !== undefined) updates.faceEncoding = fields.faceEncoding;
    if (fields.photoStorageIds !== undefined) updates.photoStorageIds = fields.photoStorageIds;
    if (fields.enrolledAt !== undefined) updates.enrolledAt = fields.enrolledAt;
    updates.updatedAt = new Date().toISOString();
    await ctx.db.patch(id, updates);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("workers") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: false, updatedAt: new Date().toISOString() });
    return { ok: true };
  },
});

const workerSyncResult = v.array(v.object({
  id: v.id("workers"),
  name: v.string(),
  employee_id: v.string(),
  department: v.string(),
  photo_url: v.union(v.string(), v.null()),
  face_encoding: v.union(v.array(v.float64()), v.null()),
  enrolled_at: v.string(),
  updated_at: v.string(),
  active: v.number(),
}));

async function listWorkersForSync(ctx: any, args: { since?: string }) {
  const all = await ctx.db.query("workers").collect();
  const since = args.since || "1970-01-01T00:00:00.000Z";
  const filtered = all.filter((w: any) => {
    const updatedAt = w.updatedAt || w.enrolledAt;
    return Boolean(updatedAt) && updatedAt > since;
  });
  const result = [];
  for (const w of filtered) {
    let photoUrls: string[] = [];
    if (w.photoStorageIds) {
      for (const sid of w.photoStorageIds) {
        const url = await ctx.storage.getUrl(sid);
        if (url) photoUrls.push(url);
      }
    }
    result.push({
      id: w._id,
      name: w.name,
      employee_id: w.employeeId || "",
      department: w.department,
      photo_url: photoUrls[0] || null,
      face_encoding: w.faceEncoding || null,
      enrolled_at: w.enrolledAt,
      updated_at: w.updatedAt || w.enrolledAt,
      active: w.active ? 1 : 0,
    });
  }
  return result;
}

export const listForSync = query({
  args: { since: v.optional(v.string()) },
  returns: workerSyncResult,
  handler: listWorkersForSync,
});

export const listForSyncFromHttp = internalQuery({
  args: { since: v.optional(v.string()) },
  returns: workerSyncResult,
  handler: listWorkersForSync,
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getPhotoUrls = query({
  args: { id: v.id("workers") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.id);
    if (!w || !w.active) return null;
    const photos: string[] = [];
    if (w.photoStorageIds) {
      for (const sid of w.photoStorageIds) {
        const url = await ctx.storage.getUrl(sid);
        if (url) photos.push(url);
      }
    }
    return { worker_id: w._id, name: w.name, photos, count: photos.length };
  },
});
