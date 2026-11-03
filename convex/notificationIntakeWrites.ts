import { internalMutation } from "./_generated/server";
import { requireSubmission } from "./lib/deviceAuthorization";
import { liveSession } from "./lib/securityValues";
import { createAccountingCore } from "../src/accounting/core";
import { confirmCandidate } from "../src/notificationIntake/confirmCandidate";
import { AccountingError } from "../src/accounting/errors";
import { IntakeError } from "../src/notificationIntake/policy";
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
            const posted = await (
              body.kind === "out"
                ? accounting.recordCashExpense({
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
                : accounting.recordCashIncome({
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
            ).catch((error: unknown) => {
              if (error instanceof AccountingError && error.code === "idempotency_key_conflict") {
                throw new IntakeError("candidate_confirmation_conflict",
                  "This notification was already confirmed with different details. Review the original entry.");
              }
              throw error;
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
