// STUB for the mobile worktree (SEN-120). The backend worker owns the real module;
// the coordinator replaces this file and regenerates `_generated/api.d.ts` at merge.
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

const stub = () => {
  throw new Error("feedback stub: replaced by the backend implementation at merge");
};

export const destination = query({
  args: {},
  handler: async (): Promise<{ configured: boolean; repository: string; audience: "public" | "private" }> => stub(),
});

export const prepareScreenshotUpload = mutation({
  args: { reportKey: v.string() },
  handler: async (): Promise<{ uploadUrl: string }> => stub(),
});

export const submit = action({
  args: {
    reportKey: v.string(),
    kind: v.union(v.literal("bug"), v.literal("feedback")),
    title: v.string(),
    whatHappened: v.string(),
    expected: v.optional(v.string()),
    steps: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
    context: v.object({
      appVersion: v.string(),
      platform: v.union(v.literal("ios"), v.literal("android")),
      osVersion: v.string(),
      language: v.union(v.literal("en"), v.literal("es")),
      screen: v.optional(v.string()),
    }),
  },
  handler: async (): Promise<{ reference: string; issueNumber: number; url: string }> => stub(),
});
