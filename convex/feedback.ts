import type { Infer } from "convex/values";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireDevice } from "./lib/deviceAuthorization";
import { verifyCurrentSession } from "./lib/session";
import { configuredDestination, destinationResult, hash, normalizeReport, normalizeReportKey, reportResult, submitArgs } from "./feedbackValues";
import { feedbackError } from "./feedbackErrors";
import { reserveKey } from "./feedbackStore";
import { GithubFeedback, GithubRejectedCreate, issueBody, reporterId, reportMarker } from "./feedbackGithub";

export const destination = query({
  args: {}, returns: destinationResult,
  handler: async (ctx) => {
    await requireDevice(ctx);
    return configuredDestination();
  },
});

export const prepareScreenshotUpload = mutation({
  args: { reportKey: v.string() }, returns: v.object({ uploadUrl: v.string() }),
  handler: async (ctx, args) => {
    const { actor } = await requireDevice(ctx);
    const key = await reserveKey(ctx, actor.userId, normalizeReportKey(args.reportKey));
    if (key.uploadUrl && key.uploadCreatedAt !== undefined && Date.now() - key.uploadCreatedAt < 55 * 60 * 1000)
      return { uploadUrl: key.uploadUrl };
    if (key.payloadHash) feedbackError({ code: "changed_report" });
    const uploadUrl = await ctx.storage.generateUploadUrl();
    await ctx.db.patch(key._id, { uploadUrl, uploadCreatedAt: Date.now() });
    return { uploadUrl };
  },
});

export const submit = action({
  args: submitArgs, returns: reportResult,
  handler: async (ctx, args): Promise<Infer<typeof reportResult>> => {
    let session = await verifyCurrentSession(ctx.auth);
    const report = normalizeReport(args);
    const payloadHash = await hash(JSON.stringify(report));
    const owner = crypto.randomUUID();
    for (let attempt = 0; attempt < 50; attempt++) {
      if (Date.now() - session.verifiedAt >= 3000) session = await verifyCurrentSession(ctx.auth);
      const claim = await ctx.runMutation(internal.feedbackStore.claim, {
        session, reportKey: report.reportKey, payloadHash, owner,
        ...(report.screenshotStorageId ? { screenshotStorageId: report.screenshotStorageId } : {}),
      });
      if (claim.status === "created") return claim.result;
      const github = new GithubFeedback(claim.repository);
      const reporter = await reporterId(claim.userId);
      if (claim.status === "busy") {
        const existing = await github.find(reportMarker(reporter, report.reportKey), claim.reservedAt);
        if (existing) {
          session = await verifyCurrentSession(ctx.auth);
          return ctx.runMutation(internal.feedbackStore.recover, { id: claim.id, payloadHash, session, result: existing });
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      let createAttempted = false;
      try {
        const existing = await github.find(reportMarker(reporter, report.reportKey), claim.reservedAt);
        if (existing) {
          session = await verifyCurrentSession(ctx.auth);
          return await ctx.runMutation(internal.feedbackStore.recover, { id: claim.id, payloadHash, session, result: existing });
        }
        let screenshotUrl: string | undefined;
        if (report.screenshotStorageId) {
          const blob = await ctx.storage.get(report.screenshotStorageId);
          if (!blob) feedbackError({ code: "invalid_report", field: "screenshotStorageId" });
          screenshotUrl = await github.screenshot(report.reportKey, blob);
        }
        session = await verifyCurrentSession(ctx.auth);
        const checked = await ctx.runQuery(internal.feedbackStore.check, { session });
        if (checked !== claim.userId) feedbackError({ code: "destination_unavailable" });
        createAttempted = true;
        const result = await github.create(report, issueBody(report, reporter, screenshotUrl));
        return await ctx.runMutation(internal.feedbackStore.complete, { id: claim.id, owner, result });
      } catch (error) {
        if (error instanceof GithubRejectedCreate) createAttempted = false;
        // A failed create response may hide a committed issue. Keep its lease until reconciliation is safe.
        if (!createAttempted) await ctx.runMutation(internal.feedbackStore.release, { id: claim.id, owner });
        throw error;
      }
    }
    feedbackError({ code: "destination_unavailable" });
  },
});
