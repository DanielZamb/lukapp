import type { Language, Translator } from "../../../../../src/i18n";
import { formatMonthName } from "../../../../../src/i18n/format";
import { compactMoney } from "../amount/compact";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";

type Evaluation = FunctionReturnType<typeof api.budget.evaluate>;
export type BudgetCategory = Evaluation["availableCategories"][number];
export type BudgetJar = Omit<Evaluation["jars"][number], "revisionId">;
export type RemovedLimit = Evaluation["removedLimits"][number];

/**
 * A zero limit means spend nothing. Any net spending is over by that amount. No spending, or a net
 * refund, reads as calm rather than as room left to spend.
 */
export function jarPresentation(jar: BudgetJar) {
  const spendNothing = jar.limitMinorUnits === 0;
  const left = jar.limitMinorUnits - jar.consumptionMinorUnits;
  const status: "left" | "over" | "clear" = left < 0 ? "over" : spendNothing ? "clear" : "left";
  return {
    status,
    spendNothing,
    amount: status === "clear" ? 0 : Math.abs(left),
    fill: status === "left" ? Math.max(0, Math.min(1, left / jar.limitMinorUnits)) : 0,
  };
}

function monthDate(month: string) {
  const [year, number] = month.split("-").map(Number);
  return Date.UTC(year, number - 1, 1);
}

/** A stand-alone month label: "October 2026" / "Octubre de 2026", or the month alone. */
export function monthLabel(month: string, format: "month" | "monthYear" = "monthYear", language: Language = "en") {
  return formatMonthName(language, monthDate(month), { timeZone: "UTC", year: format === "monthYear" });
}

/** The month name as it reads inside a sentence: "October" / "octubre". */
export function monthInSentence(month: string, language: Language) {
  return formatMonthName(language, monthDate(month), { timeZone: "UTC", capitalize: false });
}

type BudgetAction = { kind: "add"; label: string } | { kind: "edit"; label: string; jar: BudgetJar };

export function nextAction(jars: BudgetJar[], month: string, { t, language }: Translator): BudgetAction {
  const over = jars.filter((jar) => jar.consumptionMinorUnits > jar.limitMinorUnits)
    .sort((a, b) => (a.limitMinorUnits - a.consumptionMinorUnits) - (b.limitMinorUnits - b.consumptionMinorUnits))[0];
  if (over) return { kind: "edit", label: t("budget.nextOpen", { name: over.category.name }), jar: over };
  const hot = jars.filter((jar) => jar.limitMinorUnits > 0 && jar.consumptionMinorUnits / jar.limitMinorUnits >= 0.8)
    .sort((a, b) => b.consumptionMinorUnits / b.limitMinorUnits - a.consumptionMinorUnits / a.limitMinorUnits)[0];
  if (hot) return { kind: "edit", label: t("budget.nextHot", { name: hot.category.name }), jar: hot };
  const first = jars[0];
  const name = monthInSentence(month, language);
  return first ? { kind: "edit", label: t("budget.nextChange", { month: name }), jar: first }
    : { kind: "add", label: t("budget.nextSet", { month: name }) };
}

/** "1.23M" / "354K" in English; "1,23 M" / "354 mil" in Spanish. Rounding is the same in both. */
export function compactAmount(minorUnits: number, currency: string, language: Language) {
  return compactMoney(minorUnits, currency, language, "budget");
}
