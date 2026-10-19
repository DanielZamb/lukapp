import { formatMoney } from "../money";
import type { HistoryRow } from "./types";

export function formatActivityAmount(amount: HistoryRow["amount"]) {
  return `${amount.minorUnits > 0 ? "+" : ""}${formatMoney(amount)}`;
}
