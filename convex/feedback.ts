import type { Infer } from "convex/values";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireDevice } from "./lib/deviceAuthorization";
import { verifyCurrentSession } from "./lib/session";
import { configuredDestination, destinationResult, hash, normalizeReport, normalizeReportKey, reportResult, submitArgs } from "./feedbackValues";
import { feedbackError } from "./feedbackErrors";
import { removeAttachedScreenshot } from "./feedbackStore";
import { screenshotType } from "./feedbackImage";
import { GithubFeedback, GithubRejectedCreate, issueBody, reportMarker } from "./feedbackGithub";

export const destination = query({
  args: {}, returns: destinationResult,
  handler: async (ctx) => {
    await requireDevice(ctx);
    return configuredDestination();
  },
});

export const attachScreenshot = action({
  args: { reportKey: v.string(), image: v.bytes() }, returns: v.object({ sha256: v.string() }),
  handler: async (ctx, args): Promise<{ sha256: string }> => {
    const session = await verifyCurrentSession(ctx.auth);
    const reportKey = normalizeReportKey(args.reportKey);
    const reservationId = await ctx.runMutation(internal.feedbackStore.reserveScreenshot, { session, reportKey, nonce: crypto.randomUUID() });
    const type = screenshotType(args.image);
    const sha256 = await hash(args.image);
    const storageId = await ctx.storage.store(new Blob([args.image], { type }));
    try {
      const currentSession = await verifyCurrentSession(ctx.auth);
      await ctx.runMutation(internal.feedbackStore.attach, { session: currentSession, reservationId, screenshot: { storageId, sha256 } });
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
    return { sha256 };
  },
});

export const removeScreenshot = mutation({
  args: { reportKey: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const { actor } = await requireDevice(ctx);
    return removeAttachedScreenshot(ctx, actor.userId, normalizeReportKey(args.reportKey));
  },
});

export const submit = action({
  args: submitArgs, returns: reportResult,
  handler: async (ctx, args): Promise<Infer<typeof reportResult>> => {
    let session = await verifyCurrentSession(ctx.auth);
    const report = normalizeReport(args);
    const payloadHash = await hash(JSON.stringify(report));
    const owner = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    let github: GithubFeedback | undefined;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (Date.now() - session.verifiedAt >= 3000) session = await verifyCurrentSession(ctx.auth);
      const claim = await ctx.runMutation(internal.feedbackStore.claim, {
        session, reportKey: report.reportKey, payloadHash, owner, nonce,
        ...(report.screenshotSha256 !== undefined ? { screenshotSha256: report.screenshotSha256 } : {}),
      });
      if (claim.status === "created") return claim.result;
      github ??= new GithubFeedback(claim.repository);
      let createAttempted = false;
      try {
        const existing = await github.find(reportMarker(claim.nonce), claim.reservedAt);
        if (existing) {
          session = await verifyCurrentSession(ctx.auth);
          return await ctx.runMutation(internal.feedbackStore.recover, { reservationId: claim.reservationId, payloadHash, session, result: existing });
        }
        if (claim.status === "expired") feedbackError({ code: "report_expired" });
        if (claim.status === "busy") {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        session = await verifyCurrentSession(ctx.auth);
        const checked = await ctx.runMutation(internal.feedbackStore.prepareCreate, { session, id: claim.id, owner });
        let screenshot: { url: string; deleteAt: number } | undefined;
        if (checked.screenshotStorageId) {
          const url = await ctx.storage.getUrl(checked.screenshotStorageId);
          if (!url || checked.screenshotDeleteAt === undefined) feedbackError({ code: "invalid_report", field: "screenshot" });
          screenshot = { url, deleteAt: checked.screenshotDeleteAt };
        }
        createAttempted = true;
        const result = await github.create(report, issueBody(report, claim.nonce, screenshot));
        return await ctx.runMutation(internal.feedbackStore.complete, { id: claim.id, owner, result });
      } catch (error) {
        if (error instanceof GithubRejectedCreate) createAttempted = false;
        // A failed create response may hide a committed issue. Keep its lease until reconciliation is safe.
        if (!createAttempted && claim.status === "acquired") await ctx.runMutation(internal.feedbackStore.release, { id: claim.id, owner });
        throw error;
      }
    }
    feedbackError({ code: "destination_unavailable" });
  },
});
