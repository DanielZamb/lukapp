import Constants from "expo-constants";
import { ConvexError } from "convex/values";
import type { ConvexReactClient } from "convex/react";
import { Platform } from "react-native";
import { z } from "zod";
import { api } from "../api";
import type { Language } from "../../i18n";
import {
  ScreenshotNotStored,
  SendTimeout,
  type Destination,
  type FeedbackTransport,
  type ReportContext,
  type SendFailure,
  type SubmitArgs,
  type SubmitResult,
} from "./report";
import type { ReportField } from "./validation";


/**
 * Every backend name the report flow uses lives here, so the merge with the
 * backend worker changes one file.
 */
export function convexFeedbackTransport(client: ConvexReactClient): FeedbackTransport & {
  destination(): Promise<Destination>;
} {
  return {
    destination: () => client.query(api.feedback.destination, {}),
    attachScreenshot: (args) => client.action(api.feedback.attachScreenshot, args),
    removeScreenshot: (args) => client.mutation(api.feedback.removeScreenshot, args),
    submit: (args) => client.action(api.feedback.submit, args),
  };
}

const feedbackError = z.discriminatedUnion("code", [
  z.object({ code: z.literal("not_configured") }),
  z.object({ code: z.literal("invalid_report"), field: z.string().optional() }),
  z.object({ code: z.literal("rate_limited"), retryAfterMs: z.number().nonnegative() }),
  z.object({ code: z.literal("changed_report") }),
  z.object({ code: z.literal("destination_unavailable") }),
  z.object({ code: z.literal("report_expired") }),
]);
type FailureField = ReportField | "screenshot";
const failureFields = new Set<string>(["title", "whatHappened", "expected", "steps", "screenshot"] satisfies FailureField[]);

/**
 * Maps a thrown send error to what the person sees. Errors outside the feedback
 * codes go to the app's access-failure handling; anything it does not take is
 * an outcome the app cannot know, retried later with the same report key.
 */
export function classifySendError(
  error: unknown,
  { now, reportAccessFailure }: { now: number; reportAccessFailure: (error: unknown) => boolean },
): SendFailure {
  const parsed = error instanceof ConvexError ? feedbackError.safeParse(error.data) : null;
  if (parsed?.success) {
    const data = parsed.data;
    switch (data.code) {
      case "not_configured":
        return { code: "not_configured" };
      case "invalid_report":
        return {
          code: "invalid_report",
          field: data.field && failureFields.has(data.field) ? (data.field as FailureField) : null,
        };
      case "rate_limited":
        return { code: "rate_limited", retryAt: now + data.retryAfterMs };
      case "changed_report":
        return { code: "changed_report" };
      case "destination_unavailable":
        return { code: "unknown" };
      case "report_expired":
        return { code: "report_expired" };
    }
  }
  if (error instanceof SendTimeout || error instanceof ScreenshotNotStored) return { code: "unknown" };
  if (reportAccessFailure(error)) return { code: "access" };
  return { code: "unknown" };
}

/** The only context a report carries automatically. */
export function deviceContext(language: Language): Omit<ReportContext, "screen"> {
  return {
    appVersion: Constants.expoConfig?.version ?? "unknown",
    platform: Platform.OS === "ios" ? "ios" : "android",
    osVersion: String(Platform.Version),
    language,
  };
}

/** Route names only: search parameters can carry identifiers, so they never leave the phone. */
export function screenName(pathname: string) {
  const path = pathname.split(/[?#]/)[0] ?? "";
  return path.length > 0 && path.length <= 200 ? path : null;
}
