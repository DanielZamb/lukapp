import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { liveSession } from "./lib/securityValues";
import { requireLiveObservation } from "./lib/session";
import { requireDevice } from "./lib/deviceAuthorization";
import { feedbackError } from "./feedbackErrors";
import { audience, reportResult, requireConfiguration } from "./feedbackValues";
import type { ReportResult } from "./feedbackValues";

export const retentionMs = 24 * 60 * 60 * 1000;
// Longer than the Convex runtime's 30-minute action ceiling. A dead action cannot resume after takeover.
export const leaseMs = 31 * 60 * 1000;

export async function reserveKey(ctx: MutationCtx, userId: string, reportKey: string) {
  const configured = requireConfiguration();
  const existing = await ctx.db.query("feedbackReservations").withIndex("by_user_key", (q) => q.eq("userId", userId).eq("reportKey", reportKey)).unique();
  if (existing) {
    if (existing.repository !== configured.repository || existing.audience !== configured.audience)
      feedbackError({ code: "destination_unavailable" });
    return existing;
  }
  const now = Date.now();
  const recent = await ctx.db.query("feedbackReservations").withIndex("by_user_time", (q) => q.eq("userId", userId).gt("reservedAt", now - retentionMs)).order("desc").take(20);
  const hourly = recent.filter((key) => key.reservedAt > now - 60 * 60 * 1000);
  if (hourly.length >= 5 || recent.length >= 20) {
    const hourlyRetry = hourly.length >= 5 ? hourly[4].reservedAt + 60 * 60 * 1000 - now : 0;
    const dailyRetry = recent.length >= 20 ? recent[19].reservedAt + retentionMs - now : 0;
    feedbackError({ code: "rate_limited", retryAfterMs: Math.max(1, hourlyRetry, dailyRetry) });
  }
  const id = await ctx.db.insert("feedbackReservations", { userId, reportKey, reservedAt: now, repository: configured.repository, audience: configured.audience });
  await ctx.scheduler.runAfter(retentionMs, internal.feedbackStore.expire, { reservationId: id });
  const saved = await ctx.db.get(id);
  if (!saved) throw new Error("Feedback reservation was not saved");
  return saved;
}

const claimDetails = { id: v.id("feedbackReports"), userId: v.string(), repository: v.string(), reservedAt: v.number(), audience };
export const claimResult = v.union(
  v.object({ status: v.literal("created"), result: reportResult }),
  v.object({ status: v.literal("busy"), ...claimDetails }),
  v.object({ status: v.literal("acquired"), ...claimDetails }),
);

async function authorize(ctx: Pick<QueryCtx, "auth" | "db">, session: Infer<typeof liveSession>) {
  await requireLiveObservation(ctx.auth, session);
  const { actor, device } = await requireDevice(ctx);
  if (device.clerkClientId !== session.clerkClientId)
    throw new ConvexError({ code: "device_registration_required" });
  return actor;
}

export const check = internalQuery({
  args: { session: liveSession }, returns: v.string(),
  handler: async (ctx, { session }) => (await authorize(ctx, session)).userId,
});

export const claim = internalMutation({
  args: { session: liveSession, reportKey: v.string(), payloadHash: v.string(), owner: v.string(), screenshotStorageId: v.optional(v.id("_storage")) },
  returns: claimResult,
  handler: async (ctx, args): Promise<Infer<typeof claimResult>> => {
    const actor = await authorize(ctx, args.session);
    const key = await reserveKey(ctx, actor.userId, args.reportKey);
    if (key.payloadHash !== undefined && key.payloadHash !== args.payloadHash)
      feedbackError({ code: "changed_report" });
    let row = await ctx.db.query("feedbackReports").withIndex("by_user_key", (q) => q.eq("userId", actor.userId).eq("reportKey", args.reportKey)).unique();
    if (row?.payloadHash !== undefined && row.payloadHash !== args.payloadHash)
      feedbackError({ code: "changed_report" });
    if (row?.state === "created") return { status: "created", result: row.result };
    if (row?.lease && row.lease.until > Date.now()) return { status: "busy", id: row._id, userId: row.userId, repository: row.repository, reservedAt: row.reservedAt, audience: row.audience };
    if (!row) {
      if (args.screenshotStorageId && !key.uploadUrl && !key.payloadHash)
        feedbackError({ code: "invalid_report", field: "screenshotStorageId" });
      const id = await ctx.db.insert("feedbackReports", {
        userId: actor.userId, reportKey: args.reportKey, reservedAt: key.reservedAt,
        repository: key.repository, audience: key.audience, payloadHash: args.payloadHash, state: "pending",
        ...(args.screenshotStorageId ? { screenshotStorageId: args.screenshotStorageId } : {}),
      });
      row = await ctx.db.get(id);
      await ctx.db.patch(key._id, { payloadHash: args.payloadHash });
      if (Date.now() >= key.reservedAt + retentionMs)
        await ctx.scheduler.runAfter(retentionMs, internal.feedbackStore.expire, { reservationId: key._id });
    }
    if (!row || row.state !== "pending") throw new Error("Feedback pending row was not saved");
    await ctx.db.patch(row._id, { lease: { owner: args.owner, until: Date.now() + leaseMs } });
    return { status: "acquired", id: row._id, userId: actor.userId, repository: key.repository, reservedAt: key.reservedAt, audience: key.audience };
  },
});

export const release = internalMutation({
  args: { id: v.id("feedbackReports"), owner: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row?.state === "pending" && row.lease?.owner === args.owner)
      await ctx.db.patch(row._id, { lease: undefined });
    return null;
  },
});

export const complete = internalMutation({
  args: { id: v.id("feedbackReports"), owner: v.string(), result: reportResult }, returns: reportResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) feedbackError({ code: "destination_unavailable" });
    if (row.state === "created") return row.result;
    if (row.lease?.owner !== args.owner || row.lease.until <= Date.now())
      feedbackError({ code: "destination_unavailable" });
    return saveCreated(ctx, row, args.result);
  },
});

async function saveCreated(ctx: MutationCtx, row: Extract<Doc<"feedbackReports">, { state: "pending" }>, result: ReportResult) {
  if (row.screenshotStorageId && await ctx.db.system.get(row.screenshotStorageId))
    await ctx.storage.delete(row.screenshotStorageId);
  await ctx.db.replace(row._id, {
    userId: row.userId, reportKey: row.reportKey, payloadHash: row.payloadHash,
    reservedAt: row.reservedAt, repository: row.repository, audience: row.audience,
    state: "created", result,
  });
  const key = await ctx.db.query("feedbackReservations").withIndex("by_user_key", (q) => q.eq("userId", row.userId).eq("reportKey", row.reportKey)).unique();
  if (key) await ctx.db.patch(key._id, { uploadUrl: undefined, uploadCreatedAt: undefined });
  return result;
}

export const recover = internalMutation({
  args: { session: liveSession, id: v.id("feedbackReports"), payloadHash: v.string(), result: reportResult }, returns: reportResult,
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.session);
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== actor.userId || row.payloadHash !== args.payloadHash)
      feedbackError({ code: "destination_unavailable" });
    if (row.state === "created") return row.result;
    return saveCreated(ctx, row, args.result);
  },
});

export const expire = internalMutation({
  args: { reservationId: v.id("feedbackReservations") }, returns: v.null(),
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.reservationId);
    if (!key) return null;
    const row = await ctx.db.query("feedbackReports").withIndex("by_user_key", (q) => q.eq("userId", key.userId).eq("reportKey", key.reportKey)).unique();
    if (row?.state === "pending") {
      if (row.lease && row.lease.until > Date.now()) {
        await ctx.scheduler.runAfter(row.lease.until - Date.now(), internal.feedbackStore.expire, args);
        return null;
      }
      if (row.screenshotStorageId && await ctx.db.system.get(row.screenshotStorageId))
        await ctx.storage.delete(row.screenshotStorageId);
      await ctx.db.delete(row._id);
    }
    await ctx.db.patch(key._id, { uploadUrl: undefined, uploadCreatedAt: undefined });
    return null;
  },
});

// File storage holds only report screenshots. One that is still stored after the
// retention window and the longest lease was uploaded for a report that was never
// sent, or was dropped from a report before a retry, so no row points at it.
export const unclaimedUploadAgeMs = retentionMs + 2 * leaseMs;

export const sweepUnclaimedUploads = internalMutation({
  args: {}, returns: v.number(),
  handler: async (ctx) => {
    const stale = await ctx.db.system.query("_storage")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", Date.now() - unclaimedUploadAgeMs))
      .take(100);
    for (const blob of stale) await ctx.storage.delete(blob._id);
    if (stale.length === 100) await ctx.scheduler.runAfter(0, internal.feedbackStore.sweepUnclaimedUploads, {});
    return stale.length;
  },
});
