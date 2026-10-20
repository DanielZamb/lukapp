import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";
import { formatMoney } from "../money";

type BudgetEvaluation = FunctionReturnType<typeof api.budget.evaluate>;
export type AlertDestination = { pathname: "/category-look"; params: { categoryId: string } };

export function budgetAttention({ currency, jars }: Pick<BudgetEvaluation, "currency" | "jars">) {
  const over = jars
    .map((jar) => ({ ...jar, overMinorUnits: jar.consumptionMinorUnits - jar.limitMinorUnits }))
    .filter((jar) => jar.overMinorUnits > 0)
    .sort((a, b) => b.overMinorUnits - a.overMinorUnits || a.category.id.localeCompare(b.category.id));
  const money = (minorUnits: number) => formatMoney({ currency, minorUnits }, { hideZeroDecimals: true });
  const first = over[0];
  return {
    rows: over.map(({ category, consumptionMinorUnits, limitMinorUnits }) => ({
      id: category.id,
      title: `${category.emoji}  ${category.name} is over`,
      detail: `${money(consumptionMinorUnits)} of ${money(limitMinorUnits)}`,
      destination: { pathname: "/category-look", params: { categoryId: category.id } } satisfies AlertDestination,
    })),
    home: first ? {
      title: over.length === 1 ? `${first.category.name} is over its limit`
        : `${over.length} categories are over their limits`,
      detail: `${money(over.reduce((sum, jar) => sum + jar.overMinorUnits, 0))} ${over.length === 1 ? "over" : "over in total"}`,
    } : null,
    bellLabel: over.length > 0 ? `Alerts, ${over.length} over the limit` : "Alerts, nothing needs attention",
  };
}

export type AttentionState = { kind: "loading" } | { kind: "ready"; data: ReturnType<typeof budgetAttention> };
