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

export function recoveryPlansRowDetail(plans: readonly { title: string; remainingMinorUnits: number }[]) {
  const activePlans = plans.filter((plan) => plan.remainingMinorUnits > 0);
  if (activePlans.length === 0) return "Start from an expense";
  if (activePlans.length === 1) return activePlans[0].title;
  return `${activePlans.length} plans`;
}

export function monthLabel(month: string, format: "month" | "monthYear" = "monthYear") {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: format === "monthYear" ? "numeric" : undefined })
    .format(new Date(year, number - 1, 1));
}

type BudgetAction = { kind: "add"; label: string } | { kind: "edit"; label: string; jar: BudgetJar };

export function nextAction(jars: BudgetJar[], month: string): BudgetAction {
  const over = jars.filter((jar) => jar.consumptionMinorUnits > jar.limitMinorUnits)
    .sort((a, b) => (a.limitMinorUnits - a.consumptionMinorUnits) - (b.limitMinorUnits - b.consumptionMinorUnits))[0];
  if (over) return { kind: "edit", label: `Open ${over.category.name}`, jar: over };
  const hot = jars.filter((jar) => jar.consumptionMinorUnits / jar.limitMinorUnits >= 0.8)
    .sort((a, b) => b.consumptionMinorUnits / b.limitMinorUnits - a.consumptionMinorUnits / a.limitMinorUnits)[0];
  if (hot) return { kind: "edit", label: `${hot.category.name} hit 80%`, jar: hot };
  const first = jars[0];
  const name = monthLabel(month, "month");
  return first ? { kind: "edit", label: `Change ${name}'s limit`, jar: first }
    : { kind: "add", label: `Set a ${name} limit` };
}

export function compactAmount(minorUnits: number, currency: string) {
  const amount = toMajorUnits(Math.abs(minorUnits), currency);
  const sign = minorUnits < 0 ? "−" : "";
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const body = millions >= 10 || millions % 1 === 0 ? millions.toFixed(0)
      : Math.round(millions * 100) % 10 === 0 ? millions.toFixed(1) : millions.toFixed(2);
    return `${sign}${body}M`;
  }
  if (amount >= 1000) {
    const thousands = amount / 1000;
    return `${sign}${thousands >= 10 || thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return `${sign}${amount}`;
}
