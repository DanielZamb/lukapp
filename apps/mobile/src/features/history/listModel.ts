import type { Language, Translator } from "../../../../../src/i18n";
import { compactBody } from "../budget/model";
import { formatAmount, toMajorUnits } from "../money";
import { historyDateLabel } from "./filter";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";
import type { HistoryRow } from "./types";

export type HistoryCategory = Pick<FunctionReturnType<typeof api.accounting.listUserCategories>[number], "id" | "name" | "style">;
export type HistoryPlace = Pick<FunctionReturnType<typeof api.accounting.listFinancialAccountProfiles>[number], "id" | "name">;
export type HistoryListRow = ReturnType<typeof historyListRow>;

export function historyMovements(rows: HistoryRow[], profileId?: string): HistoryRow[] {
  return rows.flatMap((row) => {
    if (!row.transfer) return [row];
    const magnitude = Math.abs(row.amount.minorUnits);
    return [
      { place: row.transfer.from, minorUnits: -magnitude },
      { place: row.transfer.to, minorUnits: magnitude },
    ].filter(({ place }) => !profileId || place.id === profileId)
      .map(({ place, minorUnits }) => ({
        ...row,
        financialAccountProfileId: place.id,
        financialAccountProfileIds: [place.id],
        amount: { ...row.amount, minorUnits },
      }));
  });
}

export function historyDate(date: string, currentDate: string, language: Language) {
  return historyDateLabel(date, Number(currentDate.slice(0, 4)), language);
}

export function historyAmount(amount: HistoryRow["amount"], signed = false) {
  const body = formatAmount(Math.abs(amount.minorUnits), amount.currency, { hideZeroDecimals: true });
  const symbol = amount.currency === "COP" || amount.currency === "USD" ? "$" : `${amount.currency} `;
  return `${amount.minorUnits < 0 ? "−" : signed ? "+" : ""}${symbol}${body}`;
}

export function compactHistoryAmount(minorUnits: number, currency: string, language: Language) {
  const amount = toMajorUnits(Math.abs(minorUnits), currency);
  const sign = minorUnits < 0 ? "−" : "";
  const scale = amount >= 1_000_000 ? 1_000_000 : amount >= 1000 ? 1000 : 1;
  const value = amount / scale;
  const symbol = currency === "COP" || currency === "USD" ? "$" : `${currency} `;
  if (scale === 1) return `${sign}${symbol}${language === "es" ? String(value).replace(".", ",") : value}`;
  const body = value.toFixed(value >= 10 || value % 1 === 0 ? 0 : 1);
  return `${sign}${symbol}${compactBody(body, scale === 1_000_000 ? "millions" : "thousands", language)}`;
}

export function historyListRow(row: HistoryRow, categories: HistoryCategory[], places: HistoryPlace[], currentDate: string,
  { t, language }: Translator) {
  const primary = row.userCategories.find((category) => category.id === row.primaryUserCategoryId) ?? row.userCategories[0];
  const category = categories.find((category) => category.id === primary?.id);
  const categoryName = primary?.name ?? row.detail;
  const emoji = category?.style.emoji ?? (row.amount.minorUnits > 0 && !primary ? "💸" : "");
  const placeName = places.find((place) => place.id === row.financialAccountProfileId)?.name ?? "";
  const dateLabel = historyDate(row.date, currentDate, language);
  const subtitle = [dateLabel, `${emoji} ${categoryName}`.trim(), placeName, row.reversed ? t("review.statusReversed") : ""]
    .filter(Boolean).join(" · ");
  return { ...row, dateLabel, subtitle, placeName, amountLabel: historyAmount(row.amount, true) };
}

export function capitalFlow(rows: HistoryRow[]) {
  const out = rows.reduce((sum, row) => sum + Math.max(0, -row.amount.minorUnits), 0);
  const inn = rows.reduce((sum, row) => sum + Math.max(0, row.amount.minorUnits), 0);
  return { out, inn, net: inn - out };
}
