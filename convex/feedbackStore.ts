import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { liveSession } from "./lib/securityValues";
import { requireLiveObservation } from "./lib/session";
import { requireDevice } from "./lib/deviceAuthorization";
import { feedbackError } from "./feedbackErrors";
import { audience, reportResult, requireConfiguration, screenshotRetentionMs } from "./feedbackValues";
import type { ReportResult } from "./feedbackValues";

export const retentionMs = 24 * 60 * 60 * 1000;
// Longer than the Convex runtime's 30-minute action ceiling. A dead action cannot resume after takeover.
export const leaseMs = 31 * 60 * 1000;
export const unclaimedUploadAgeMs = retentionMs + 2 * leaseMs;
const hourMs = 60 * 60 * 1000;
const nextCleanupAt = (deadline: number) => Math.min(deadline, Date.now() + 365 * retentionMs);
type Reservation = Doc<"feedbackReservations">;

function checkQuota(times: number[], now: number) {
  const hourly = times.filter((time) => time > now - hourMs).sort((a, b) => b - a);
  const daily = times.filter((time) => time > now - retentionMs).sort((a, b) => b - a);
  if (hourly.length >= 5 || daily.length >= 20)
    feedbackError({ code: "rate_limited", retryAfterMs: Math.max(1,
      hourly.length >= 5 ? hourly[4] + hourMs - now : 0,
      daily.length >= 20 ? daily[19] + retentionMs - now : 0) });
}

async function findReport(ctx: Pick<QueryCtx, "db">, key: Pick<Reservation, "userId" | "reportKey">) {
  return ctx.db.query("feedbackReports").withIndex("by_user_key", (q) => q.eq("userId", key.userId).eq("reportKey", key.reportKey)).unique();
}

async function reserveKey(ctx: MutationCtx, userId: string, reportKey: string, nonce: string) {
  const configured = requireConfiguration();
  const existing = await ctx.db.query("feedbackReservations").withIndex("by_user_key", (q) => q.eq("userId", userId).eq("reportKey", reportKey)).unique();
  if (existing) {
    if (existing.repository !== configured.repository || existing.audience !== configured.audience)
      feedbackError({ code: "destination_unavailable" });
    return existing;
  }
  const now = Date.now();
  const recent = await ctx.db.query("feedbackReservations").withIndex("by_user_time", (q) => q.eq("userId", userId).gt("reservedAt", now - retentionMs)).collect();
  checkQuota(recent.map((key) => key.reservedAt), now);
  const id = await ctx.db.insert("feedbackReservations", { userId, reportKey, nonce, reservedAt: now, repository: configured.repository, audience: configured.audience });
  await ctx.scheduler.runAfter(retentionMs, internal.feedbackStore.expire, { reservationId: id });
  const saved = await ctx.db.get(id);
  if (!saved) throw new Error("Feedback reservation was not saved");
  return saved;
}

async function authorize(ctx: Pick<QueryCtx, "auth" | "db">, session: Infer<typeof liveSession>) {
  await requireLiveObservation(ctx.auth, session);
  const { actor, device } = await requireDevice(ctx);
  if (device.clerkClientId !== session.clerkClientId)
    throw new ConvexError({ code: "device_registration_required" });
  return actor;
}

export const prepareCreate = internalMutation({
  args: { session: liveSession, id: v.id("feedbackReports"), owner: v.string() },
  returns: v.object({ screenshotStorageId: v.optional(v.id("_storage")), screenshotDeleteAt: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.session);
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== actor.userId || row.state !== "pending" || row.lease?.owner !== args.owner || row.lease.until <= Date.now())
      feedbackError({ code: "destination_unavailable" });
    if (row.reservedAt + retentionMs <= Date.now()) feedbackError({ code: "report_expired" });
    const screenshotDeleteAt = row.screenshotStorageId ? Date.now() + screenshotRetentionMs() : undefined;
    await ctx.db.patch(row._id, { screenshotDeleteAt });
    return { screenshotStorageId: row.screenshotStorageId, screenshotDeleteAt };
  },
});

async function requireEditable(ctx: MutationCtx, key: Reservation) {
  const row = await findReport(ctx, key);
  if (row?.state !== "created" && Date.now() >= key.reservedAt + retentionMs)
    feedbackError({ code: "report_expired" });
  if (key.payloadHash || row) feedbackError({ code: "changed_report" });
}

export const reserveScreenshot = internalMutation({
  args: { session: liveSession, reportKey: v.string(), nonce: v.string() }, returns: v.id("feedbackReservations"),
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.session);
    const key = await reserveKey(ctx, actor.userId, args.reportKey, args.nonce);
    await requireEditable(ctx, key);
    return key._id;
  },
});

async function deleteBlob(ctx: MutationCtx, storageId: Id<"_storage"> | undefined) {
  if (storageId && await ctx.db.system.get(storageId)) await ctx.storage.delete(storageId);
}

export const attach = internalMutation({
  args: { session: liveSession, reservationId: v.id("feedbackReservations"), screenshot: v.object({ storageId: v.id("_storage"), sha256: v.string() }) }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.session);
    const key = await ctx.db.get(args.reservationId);
    if (!key || key.userId !== actor.userId) feedbackError({ code: "destination_unavailable" });
    await requireEditable(ctx, key);
    const active = await ctx.db.query("feedbackReservations").withIndex("by_user_time", (q) => q.eq("userId", actor.userId).gt("reservedAt", Date.now() - retentionMs)).collect();
    const attached = active.filter((row) => row.screenshot && row._id !== key._id);
    if (attached.length >= 5)
      feedbackError({ code: "rate_limited", retryAfterMs: Math.max(1, Math.min(...attached.map((row) => row.reservedAt)) + retentionMs - Date.now()) });
    await deleteBlob(ctx, key.screenshot?.storageId);
    await ctx.db.patch(key._id, { screenshot: args.screenshot });
    return null;
  },
});

export async function removeAttachedScreenshot(ctx: MutationCtx, userId: string, reportKey: string) {
  const key = await ctx.db.query("feedbackReservations").withIndex("by_user_key", (q) => q.eq("userId", userId).eq("reportKey", reportKey)).unique();
  if (!key) return null;
  await requireEditable(ctx, key);
  await deleteBlob(ctx, key.screenshot?.storageId);
  await ctx.db.patch(key._id, { screenshot: undefined });
  return null;
}

const claimDetails = {
  reservationId: v.id("feedbackReservations"), userId: v.string(), repository: v.string(),
  reservedAt: v.number(), audience, nonce: v.string(),
};
const sendingDetails = {
  ...claimDetails, id: v.id("feedbackReports"),
};
export const claimResult = v.union(
  v.object({ status: v.literal("created"), result: reportResult }),
  v.object({ status: v.literal("expired"), ...claimDetails }),
  v.object({ status: v.literal("busy"), ...sendingDetails }),
  v.object({ status: v.literal("acquired"), ...sendingDetails }),
);

export const claim = internalMutation({
  args: { session: liveSession, reportKey: v.string(), payloadHash: v.string(), owner: v.string(), nonce: v.string(), screenshotSha256: v.optional(v.string()) },
  returns: claimResult,
  handler: async (ctx, args): Promise<Infer<typeof claimResult>> => {
    const actor = await authorize(ctx, args.session);
    const key = await reserveKey(ctx, actor.userId, args.reportKey, args.nonce);
    if (key.payloadHash !== undefined && key.payloadHash !== args.payloadHash)
      feedbackError({ code: "changed_report" });
    let row = await findReport(ctx, key);
    if (row?.state === "created") return { status: "created", result: row.result };
    const details = { reservationId: key._id, userId: key.userId, repository: key.repository, reservedAt: key.reservedAt, audience: key.audience, nonce: key.nonce };
    if (Date.now() >= key.reservedAt + retentionMs) return { status: "expired", ...details };
    if (row?.lease && row.lease.until > Date.now())
      return { status: "busy", ...details, id: row._id };
    if (!row) {
      if (args.screenshotSha256 !== undefined && args.screenshotSha256 !== key.screenshot?.sha256)
        feedbackError({ code: "invalid_report", field: "screenshot" });
      if (key.sentAt === undefined) {
        const sent = await ctx.db.query("feedbackReservations").withIndex("by_user_sent", (q) => q.eq("userId", actor.userId).gt("sentAt", Date.now() - retentionMs)).collect();
        checkQuota(sent.flatMap((r) => r.sentAt === undefined ? [] : [r.sentAt]), Date.now());
        await ctx.db.patch(key._id, { sentAt: Date.now() });
      }
      const id = await ctx.db.insert("feedbackReports", {
        userId: actor.userId, reportKey: args.reportKey, reservedAt: key.reservedAt,
        repository: key.repository, audience: key.audience, payloadHash: args.payloadHash, state: "pending",
        ...(args.screenshotSha256 !== undefined && key.screenshot ? {
          screenshotStorageId: key.screenshot.storageId,
        } : {}),
      });
      row = await ctx.db.get(id);
      await ctx.db.patch(key._id, { payloadHash: args.payloadHash });
    }
    if (!row || row.state !== "pending") throw new Error("Feedback pending row was not saved");
    await ctx.db.patch(row._id, { lease: { owner: args.owner, until: Date.now() + leaseMs } });
    return { status: "acquired", ...details, id: row._id };
  },
});

export const release = internalMutation({
  args: { id: v.id("feedbackReports"), owner: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row?.state === "pending" && row.lease?.owner === args.owner) await ctx.db.patch(row._id, { lease: undefined, screenshotDeleteAt: undefined });
    return null;
  },
});

async function saveCreated(ctx: MutationCtx, key: Reservation, row: Doc<"feedbackReports"> | null, payloadHash: string, result: ReportResult) {
  if (row?.state === "created") return row.result;
  const screenshotStorageId = row?.screenshotStorageId;
  if (key.screenshot && key.screenshot.storageId !== screenshotStorageId) await deleteBlob(ctx, key.screenshot.storageId);
  const created = {
    userId: key.userId, reportKey: key.reportKey, payloadHash, reservedAt: key.reservedAt,
    repository: key.repository, audience: key.audience, state: "created" as const, result,
    ...(screenshotStorageId ? { screenshotStorageId, screenshotDeleteAt: row.screenshotDeleteAt } : {}),
  };
  const id = row ? row._id : await ctx.db.insert("feedbackReports", created);
  if (row) await ctx.db.replace(id, created);
  await ctx.db.patch(key._id, { payloadHash, screenshot: undefined });
  if (created.screenshotDeleteAt !== undefined)
    await ctx.scheduler.runAt(Math.max(Date.now(), nextCleanupAt(created.screenshotDeleteAt)), internal.feedbackStore.deleteScreenshot, { id });
  return result;
}

export const complete = internalMutation({
  args: { id: v.id("feedbackReports"), owner: v.string(), result: reportResult }, returns: reportResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) feedbackError({ code: "destination_unavailable" });
    if (row.state === "created") return row.result;
    if (row.lease?.owner !== args.owner || row.lease.until <= Date.now()) feedbackError({ code: "destination_unavailable" });
    const key = await ctx.db.query("feedbackReservations").withIndex("by_user_key", (q) => q.eq("userId", row.userId).eq("reportKey", row.reportKey)).unique();
    if (!key) feedbackError({ code: "destination_unavailable" });
    return saveCreated(ctx, key, row, row.payloadHash, args.result);
  },
});

export const recover = internalMutation({
  args: { session: liveSession, reservationId: v.id("feedbackReservations"), payloadHash: v.string(), result: reportResult }, returns: reportResult,
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.session);
    const key = await ctx.db.get(args.reservationId);
    if (!key || key.userId !== actor.userId || key.payloadHash !== args.payloadHash) feedbackError({ code: "destination_unavailable" });
    return saveCreated(ctx, key, await findReport(ctx, key), args.payloadHash, args.result);
  },
});

export const deleteScreenshot = internalMutation({
  args: { id: v.id("feedbackReports") }, returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row?.state !== "created" || !row.screenshotStorageId || row.screenshotDeleteAt === undefined) return null;
    if (row.screenshotDeleteAt > Date.now()) {
      await ctx.scheduler.runAt(nextCleanupAt(row.screenshotDeleteAt), internal.feedbackStore.deleteScreenshot, { id });
      return null;
    }
    await deleteBlob(ctx, row.screenshotStorageId);
    await ctx.db.patch(id, { screenshotStorageId: undefined, screenshotDeletedAt: Date.now() });
    return null;
  },
});

export const expire = internalMutation({
  args: { reservationId: v.id("feedbackReservations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.reservationId);
    if (!key || key.reservedAt + retentionMs > Date.now()) return null;
    const row = await findReport(ctx, key);
    if (row?.state === "created") return null;
    if (row?.lease && row.lease.until > Date.now()) {
      await ctx.scheduler.runAt(row.lease.until, internal.feedbackStore.expire, args);
      return null;
    }
    // An unknown create outcome may already have published this URL. Preserve its promised retention.
    if (row?.screenshotDeleteAt !== undefined && row.screenshotDeleteAt > Date.now()) {
      await ctx.scheduler.runAt(nextCleanupAt(row.screenshotDeleteAt), internal.feedbackStore.expire, args);
      return null;
    }
    await deleteBlob(ctx, key.screenshot?.storageId);
    if (row) {
      if (row.screenshotStorageId !== key.screenshot?.storageId) await deleteBlob(ctx, row.screenshotStorageId);
      await ctx.db.delete(row._id);
    }
    await ctx.db.patch(key._id, { screenshot: undefined });
    return null;
  },
});

export const sweepUnclaimedUploads = internalMutation({
  args: { cursor: v.optional(v.string()) }, returns: v.number(),
  handler: async (ctx, args) => {
    const batch = await ctx.db.system.query("_storage")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", Date.now() - unclaimedUploadAgeMs))
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });
    let deleted = 0;
    for (const blob of batch.page) {
      const key = await ctx.db.query("feedbackReservations").withIndex("by_screenshot", (q) => q.eq("screenshot.storageId", blob._id)).first();
      const row = await ctx.db.query("feedbackReports").withIndex("by_screenshot", (q) => q.eq("screenshotStorageId", blob._id)).first();
      if (!key && !row) { await ctx.storage.delete(blob._id); deleted++; }
    }
    if (!batch.isDone) await ctx.scheduler.runAfter(0, internal.feedbackStore.sweepUnclaimedUploads, { cursor: batch.continueCursor });
    return deleted;
  },
});
