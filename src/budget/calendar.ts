import type { PeriodKey } from "../accounting/types";

export function monthIndex(month: PeriodKey) {
  return (month.year - 1) * 12 + month.month - 1;
}
export function compareMonths(a: PeriodKey, b: PeriodKey) {
  return monthIndex(a) - monthIndex(b);
}
