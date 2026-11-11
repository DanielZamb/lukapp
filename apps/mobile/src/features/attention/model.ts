import type { FunctionReturnType } from "convex/server";
import type { Translator } from "../../../../../src/i18n";
import type { api } from "../api";
import { formatMoney } from "../money";

type BudgetEvaluation = FunctionReturnType<typeof api.budget.evaluate>;
export type AlertDestination = { pathname: "/category-look"; params: { categoryId: string } };

export function budgetAttention({ currency, jars }: Pick<BudgetEvaluation, "currency" | "jars">, { t, tn }: Translator) {
  const over = jars
    .map((jar) => ({ ...jar, overMinorUnits: jar.consumptionMinorUnits - jar.limitMinorUnits }))
    .filter((jar) => jar.overMinorUnits > 0)
    .sort((a, b) => b.overMinorUnits - a.overMinorUnits || a.category.id.localeCompare(b.category.id));
  const money = (minorUnits: number) => formatMoney({ currency, minorUnits }, { hideZeroDecimals: true });
  const first = over[0];
  const excess = money(over.reduce((sum, jar) => sum + jar.overMinorUnits, 0));
  return {
    rows: over.map(({ category, consumptionMinorUnits, limitMinorUnits }) => ({
      id: category.id,
      title: t("home.alertOver", { emoji: category.emoji, name: category.name }),
      detail: limitMinorUnits === 0 ? t("budget.alertSpendNothing", { spent: money(consumptionMinorUnits) })
        : t("home.alertSpent", { spent: money(consumptionMinorUnits), limit: money(limitMinorUnits) }),
      destination: { pathname: "/category-look", params: { categoryId: category.id } } satisfies AlertDestination,
    })),
    home: first ? {
      title: over.length > 1 ? t("home.overMany", { count: over.length })
        : first.limitMinorUnits === 0 ? t("budget.homeOverSpendNothing", { name: first.category.name })
        : t("home.overOne", { name: first.category.name }),
      detail: t(over.length === 1 ? "home.overAmount" : "home.overTotal", { amount: excess }),
    } : null,
    bellLabel: over.length > 0 ? tn("home.bellOver", over.length) : t("home.bellNone"),
  };
}

export type AttentionState = { kind: "loading" } | { kind: "ready"; data: ReturnType<typeof budgetAttention> };
