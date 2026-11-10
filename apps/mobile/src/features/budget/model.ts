import type { Language, Translator } from "../../../../../src/i18n";
import { formatMonthName } from "../../../../../src/i18n/format";
import { toMajorUnits } from "../money";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";

type Evaluation = FunctionReturnType<typeof api.budget.evaluate>;
export type BudgetCategory = Evaluation["availableCategories"][number];
export type BudgetJar = Omit<Evaluation["jars"][number], "revisionId">;

export function jarPresentation(jar: BudgetJar) {
  const left = jar.limitMinorUnits - jar.consumptionMinorUnits;
  return {
    over: left < 0,
    amount: Math.abs(left),
    fill: jar.limitMinorUnits > 0 ? Math.max(0, Math.min(1, left / jar.limitMinorUnits)) : 0,
  };
}

export function recoveryPlansRowDetail(plans: readonly Pick<
  FunctionReturnType<typeof api.savingsRecovery.evaluate>["plans"][number],
  "title" | "remainingMinorUnits" | "status"
>[]) {
  const activePlans = plans.filter((plan) => plan.status === "active" && plan.remainingMinorUnits > 0);
  if (activePlans.length === 0) return "Start from an expense";
  if (activePlans.length === 1) return activePlans[0].title;
  return `${activePlans.length} plans`;
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
  const hot = jars.filter((jar) => jar.consumptionMinorUnits / jar.limitMinorUnits >= 0.8)
    .sort((a, b) => b.consumptionMinorUnits / b.limitMinorUnits - a.consumptionMinorUnits / a.limitMinorUnits)[0];
  if (hot) return { kind: "edit", label: t("budget.nextHot", { name: hot.category.name }), jar: hot };
  const first = jars[0];
  const name = monthInSentence(month, language);
  return first ? { kind: "edit", label: t("budget.nextChange", { month: name }), jar: first }
    : { kind: "add", label: t("budget.nextSet", { month: name }) };
}

/** "1.23M" / "354K" in English; "1,23 M" / "354 mil" in Spanish. Rounding is the same in both. */
export function compactAmount(minorUnits: number, currency: string, language: Language) {
  const amount = toMajorUnits(Math.abs(minorUnits), currency);
  const sign = minorUnits < 0 ? "−" : "";
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const body = millions >= 10 || millions % 1 === 0 ? millions.toFixed(0)
      : Math.round(millions * 100) % 10 === 0 ? millions.toFixed(1) : millions.toFixed(2);
    return `${sign}${compactBody(body, "millions", language)}`;
  }
  if (amount >= 1000) {
    const thousands = amount / 1000;
    const body = thousands >= 10 || thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1);
    return `${sign}${compactBody(body, "thousands", language)}`;
  }
  return `${sign}${language === "es" ? String(amount).replace(".", ",") : amount}`;
}

export function compactBody(body: string, scale: "thousands" | "millions", language: Language) {
  if (language === "es") return `${body.replace(".", ",")} ${scale === "millions" ? "M" : "mil"}`;
  return `${body}${scale === "millions" ? "M" : "K"}`;
}
