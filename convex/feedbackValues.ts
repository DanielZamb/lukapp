import { v } from "convex/values";
import type { Infer } from "convex/values";
import { feedbackError } from "./feedbackErrors";

export const audience = v.union(v.literal("public"), v.literal("private"));
export const reportContext = v.object({
  appVersion: v.string(),
  platform: v.union(v.literal("ios"), v.literal("android")),
  osVersion: v.string(),
  language: v.union(v.literal("en"), v.literal("es")),
  screen: v.optional(v.string()),
});
export const submitArgs = {
  reportKey: v.string(),
  kind: v.union(v.literal("bug"), v.literal("feedback")),
  title: v.string(),
  whatHappened: v.string(),
  expected: v.optional(v.string()),
  steps: v.optional(v.string()),
  screenshotStorageId: v.optional(v.id("_storage")),
  context: reportContext,
};
export const reportPayload = v.object(submitArgs);
export type ReportPayload = Infer<typeof reportPayload>;
export const reportResult = v.object({ reference: v.string(), issueNumber: v.number(), url: v.string() });
export type ReportResult = Infer<typeof reportResult>;
export const destinationResult = v.object({ configured: v.boolean(), repository: v.string(), audience });

const keyFields = {
  userId: v.string(), reportKey: v.string(), reservedAt: v.number(),
  repository: v.string(), audience,
};
export const reservationFields = {
  ...keyFields,
  payloadHash: v.optional(v.string()),
  uploadUrl: v.optional(v.string()),
  uploadCreatedAt: v.optional(v.number()),
};
export const reportFields = v.union(
  v.object({
    ...keyFields, payloadHash: v.string(), state: v.literal("pending"),
    screenshotStorageId: v.optional(v.id("_storage")),
    lease: v.optional(v.object({ owner: v.string(), until: v.number() })),
  }),
  v.object({ ...keyFields, payloadHash: v.string(), state: v.literal("created"), result: reportResult }),
);

export function normalizeReportKey(input: string) {
  const value = input.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))
    feedbackError({ code: "invalid_report", field: "reportKey" });
  return value;
}

function text(input: string, field: string, min: number, max: number) {
  const value = input.trim();
  if (value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value))
    feedbackError({ code: "invalid_report", field });
  return value;
}

export function normalizeReport(input: ReportPayload): ReportPayload {
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(input.title))
    feedbackError({ code: "invalid_report", field: "title" });
  return {
    reportKey: normalizeReportKey(input.reportKey), kind: input.kind,
    title: text(input.title, "title", 3, 120),
    whatHappened: text(input.whatHappened, "whatHappened", 1, 4000),
    expected: text(input.expected ?? "", "expected", 0, 4000),
    steps: text(input.steps ?? "", "steps", 0, 4000),
    ...(input.screenshotStorageId ? { screenshotStorageId: input.screenshotStorageId } : {}),
    context: {
      appVersion: text(input.context.appVersion, "context.appVersion", 1, 64),
      platform: input.context.platform,
      osVersion: text(input.context.osVersion, "context.osVersion", 1, 64),
      language: input.context.language,
      screen: text(input.context.screen ?? "", "context.screen", 0, 120),
    },
  };
}

export async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function configuredDestination() {
  const repository = process.env.GITHUB_FEEDBACK_REPOSITORY?.trim() ?? "";
  const visibility = process.env.GITHUB_FEEDBACK_AUDIENCE?.trim() ?? "public";
  return {
    configured: Boolean(process.env.GITHUB_FEEDBACK_TOKEN?.trim()) &&
      /^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(repository) &&
      (visibility === "public" || visibility === "private"),
    repository,
    audience: visibility === "private" ? "private" : "public",
  } satisfies Infer<typeof destinationResult>;
}

export function requireConfiguration() {
  const destination = configuredDestination();
  if (!destination.configured) feedbackError({ code: "not_configured" });
  return destination;
}
