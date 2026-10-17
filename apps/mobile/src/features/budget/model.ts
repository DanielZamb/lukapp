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
    fill: Math.max(0, Math.min(1, left / jar.limitMinorUnits)),
  };
}

export function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" })
    .format(new Date(year, number - 1, 1));
}

export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(year, number - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
