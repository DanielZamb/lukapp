import { internalMutation } from "./_generated/server";
import { requireSubmission } from "./lib/deviceAuthorization";
import { liveSession } from "./lib/securityValues";
import { createAccountingCore } from "../src/accounting/core";
import { confirmCandidate } from "../src/notificationIntake/confirmCandidate";
import { convexStore } from "./store";
import { intakeWriteStore } from "./notificationIntakeStore";
import { run } from "./accountingErrors";
import { runIntake } from "./notificationIntakeErrors";
import { confirmOneArgs, confirmOneResult } from "./notificationIntakeValues";

export const confirmOne = internalMutation({
  args: { ...confirmOneArgs, session: liveSession },
  returns: confirmOneResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, {
      session,
      workspaceId: args.workspaceId,
      permission: "accounting:post",
    });
    const accounting = createAccountingCore(convexStore(ctx.db));
    return run(() =>
      runIntake(() =>
        confirmCandidate(
          intakeWriteStore(ctx),
          async (body) => {
            const posted =
              body.kind === "out"
                ? await accounting.recordCashExpense({
                    actor,
                    workspaceId: body.workspaceId,
                    financialAccountProfileId: body.financialAccountProfileId,
                    amount: body.amount,
                    accountingDate: body.accountingDate,
                    description: body.description,
                    idempotencyKey: body.idempotencyKey,
                    ...(body.userCategoryIds
                      ? { userCategoryIds: body.userCategoryIds }
                      : {}),
                    ...(body.primaryUserCategoryId
                      ? { primaryUserCategoryId: body.primaryUserCategoryId }
                      : {}),
                  })
                : await accounting.recordCashIncome({
                    actor,
                    workspaceId: body.workspaceId,
                    financialAccountProfileId: body.financialAccountProfileId,
                    amount: body.amount,
                    accountingDate: body.accountingDate,
                    description: body.description,
                    idempotencyKey: body.idempotencyKey,
                    ...(body.userCategoryIds
                      ? { userCategoryIds: body.userCategoryIds }
                      : {}),
                    ...(body.primaryUserCategoryId
                      ? { primaryUserCategoryId: body.primaryUserCategoryId }
                      : {}),
                  });
            return {
              id: posted.id,
              description: posted.description,
              amount: posted.amount,
              replay: posted.replay,
            };
          },
          { ...args, actorId: actor.userId, now: Date.now() },
        ),
      ),
    );
  },
});
