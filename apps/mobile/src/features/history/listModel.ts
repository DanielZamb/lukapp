import { formatAmount, toMajorUnits } from "../money";
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

export function historyDate(date: string, currentDate: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", timeZone: "UTC",
    ...(date.slice(0, 4) !== currentDate.slice(0, 4) ? { year: "numeric" } : {}),
  }).format(new Date(`${date}T00:00:00Z`));
}

export function historyAmount(amount: HistoryRow["amount"], signed = false) {
  const body = formatAmount(Math.abs(amount.minorUnits), amount.currency, { hideZeroDecimals: true });
  const symbol = amount.currency === "COP" || amount.currency === "USD" ? "$" : `${amount.currency} `;
  return `${amount.minorUnits < 0 ? "−" : signed ? "+" : ""}${symbol}${body}`;
}

export function compactHistoryAmount(minorUnits: number, currency: string) {
  const amount = toMajorUnits(Math.abs(minorUnits), currency);
  const sign = minorUnits < 0 ? "−" : "";
  const scale = amount >= 1_000_000 ? 1_000_000 : amount >= 1000 ? 1000 : 1;
  const value = amount / scale;
  const body = scale === 1 ? String(value) : value.toFixed(value >= 10 || value % 1 === 0 ? 0 : 1);
  return `${sign}${currency === "COP" || currency === "USD" ? "$" : `${currency} `}${body}${scale === 1_000_000 ? "M" : scale === 1000 ? "K" : ""}`;
}

export function historyListRow(row: HistoryRow, categories: HistoryCategory[], places: HistoryPlace[], currentDate: string) {
  const primary = row.userCategories.find((category) => category.id === row.primaryUserCategoryId) ?? row.userCategories[0];
  const category = categories.find((category) => category.id === primary?.id);
  const categoryName = primary?.name ?? row.detail;
  const emoji = category?.style.emoji ?? (row.amount.minorUnits > 0 && !primary ? "💸" : "");
  const placeName = places.find((place) => place.id === row.financialAccountProfileId)?.name ?? "";
  const dateLabel = historyDate(row.date, currentDate);
  const subtitle = [dateLabel, `${emoji} ${categoryName}`.trim(), placeName].filter(Boolean).join(" · ") +
    (row.reversed ? " · Reversed" : "");
  return { ...row, dateLabel, subtitle, placeName, categoryName, emoji,
    categoryStyle: category?.style, amountLabel: historyAmount(row.amount, true) };
}

export function historyDateSections(rows: HistoryListRow[]) {
  const days = new Map<string, { net: number; places: Set<string | undefined> }>();
  for (const row of rows) {
    const day = days.get(row.date) ?? { net: 0, places: new Set<string | undefined>() };
    day.net += row.amount.minorUnits;
    day.places.add(row.financialAccountProfileId);
    days.set(row.date, day);
  }
  const sections: { date: string; dateLabel: string; net: number; place?: string; rows: HistoryListRow[] }[] = [];
  for (const row of rows) {
    const previous = sections[sections.length - 1];
    if (previous?.date === row.date) {
      previous.rows.push(row);
    } else {
      const day = days.get(row.date);
      sections.push({ date: row.date, dateLabel: row.dateLabel, net: day?.net ?? 0,
        place: day?.places.size === 1 && row.placeName ? row.placeName : undefined, rows: [row] });
    }
  }
  return sections;
}

export function historyRowDescription(row: HistoryListRow, sharedPlace?: string) {
  const description = row.transfer ? `${row.transfer.from.name} → ${row.transfer.to.name}` : row.title;
  return [sharedPlace ? "" : row.placeName, description, row.reversed ? "Reversed" : ""].filter(Boolean).join(" · ");
}

export function capitalFlow(rows: HistoryRow[]) {
  const out = rows.reduce((sum, row) => sum + Math.max(0, -row.amount.minorUnits), 0);
  const inn = rows.reduce((sum, row) => sum + Math.max(0, row.amount.minorUnits), 0);
  return { out, inn, net: inn - out };
}
