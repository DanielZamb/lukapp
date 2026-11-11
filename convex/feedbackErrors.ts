import { ConvexError } from "convex/values";

export type FeedbackErrorData =
  | { code: "not_configured" | "changed_report" | "destination_unavailable" | "report_expired" }
  | { code: "invalid_report"; field: string }
  | { code: "rate_limited"; retryAfterMs: number };

export function feedbackError(data: FeedbackErrorData): never {
  throw new ConvexError(data);
}
