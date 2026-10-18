import type { PendingPosting } from "../posting/pendingPostingSchema";
import type { BudgetJar } from "./model";

export function postingBudgetImpact({
  jars,
  categoryIds,
  expenseMinorUnits,
}: {
  jars: BudgetJar[];
  categoryIds: string[];
  expenseMinorUnits: number;
}) {
  return jars.flatMap((jar) => {
    const remaining = jar.limitMinorUnits - jar.consumptionMinorUnits;
    return categoryIds.includes(jar.category.id) &&
      remaining >= 0 &&
      expenseMinorUnits > remaining
      ? [
          {
            category: jar.category,
            overMinorUnits: expenseMinorUnits - remaining,
          },
        ]
      : [];
  });
}

export type PostingBudgetImpact = ReturnType<typeof postingBudgetImpact>;

export async function batchPostingBudgetImpact(
  commands: PendingPosting[],
  evaluate: (input: {
    workspaceId: string;
    month: string;
  }) => Promise<{ jars: BudgetJar[] }>,
): Promise<PostingBudgetImpact> {
  const months = new Map<
    string,
    {
      workspaceId: string;
      month: string;
      consumption: Map<string, number>;
    }
  >();
  for (const command of commands) {
    if (command.kind !== "expense") continue;
    const { payload } = command;
    const month = payload.accountingDate.slice(0, 7);
    const key = JSON.stringify([payload.workspaceId, month]);
    const group = months.get(key) ?? {
      workspaceId: payload.workspaceId,
      month,
      consumption: new Map<string, number>(),
    };
    const ids =
      payload.userCategoryIds ??
      (payload.userCategoryId ? [payload.userCategoryId] : []);
    for (const id of new Set(ids))
      group.consumption.set(
        id,
        (group.consumption.get(id) ?? 0) + payload.amount.minorUnits,
      );
    months.set(key, group);
  }
  const hits = await Promise.all(
    [...months.values()].map(async ({ workspaceId, month, consumption }) => {
      const { jars } = await evaluate({ workspaceId, month });
      return jars.flatMap((jar) =>
        postingBudgetImpact({
          jars: [jar],
          categoryIds: [...consumption.keys()],
          expenseMinorUnits: consumption.get(jar.category.id) ?? 0,
        }),
      );
    }),
  );
  return hits.flat();
}
