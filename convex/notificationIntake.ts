import { ConvexError, type Infer } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyCurrentSession } from "./lib/session";
import {
  isWipeBearingError,
  requireIntakeBatch,
} from "../src/notificationIntake/policy";
import { runIntake } from "./notificationIntakeErrors";
import {
  confirmCandidatesArgs,
  confirmCandidatesResult,
  confirmOneArgs,
  confirmOneResult,
} from "./notificationIntakeValues";

export const confirmOne = action({
  args: confirmOneArgs,
  returns: confirmOneResult,
  handler: async (ctx, args): Promise<Infer<typeof confirmOneResult>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.notificationIntakeWrites.confirmOne, {
      ...args,
      session,
    });
  },
});

export const confirmCandidates = action({
  args: confirmCandidatesArgs,
  returns: confirmCandidatesResult,
  handler: async (ctx, args): Promise<Infer<typeof confirmCandidatesResult>> => {
    await runIntake(async () => {
      requireIntakeBatch(args.items.length);
    });
    const session = await verifyCurrentSession(ctx.auth);
    const results: Infer<typeof confirmCandidatesResult>["results"] = [];
    for (const item of args.items) {
      if (item.workspaceId !== args.workspaceId) {
        results.push({
          candidateId: item.candidateId,
          ok: false,
          error: "workspace_mismatch",
        });
        continue;
      }
      try {
        const result = await ctx.runMutation(
          internal.notificationIntakeWrites.confirmOne,
          { ...item, session },
        );
        results.push({ candidateId: item.candidateId, ok: true, result });
      } catch (error) {
        if (isWipeBearingError(error)) throw error;
        const data = error instanceof ConvexError ? error.data : null;
        const message =
          data !== null &&
          typeof data === "object" &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : data !== null &&
                typeof data === "object" &&
                "code" in data &&
                typeof data.code === "string"
              ? data.code
              : "confirm_failed";
        results.push({
          candidateId: item.candidateId,
          ok: false,
          error: message,
        });
      }
    }
    return { results };
  },
});
