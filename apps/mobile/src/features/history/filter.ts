import type { Language, MessageKey, Translator } from "../../../../../src/i18n";
import { formatDayMonth, formatLongDate, formatMonthName } from "../../../../../src/i18n/format";
import { toMajorUnits } from "../money";
import type { HistoryRow } from "./types";

export type DateRangeId = "all" | "7d" | `${number}-${string}`;

export type DateRangeEntry = {
  id: DateRangeId;
  label: string;
  from: string | null;
  to: string | null;
};

export type HistoryQuery = {
  search: string;
  profileIds: string[];
  categoryIds: string[];
  range: DateRangeId;
  customFrom: string | null;
  customTo: string | null;
};

export type HistoryFilterContext = {
  today: string;
  language: Language;
  profileNames: Readonly<Record<string, string>>;
};

export type SortKey = "date" | "amount" | "place" | "category";
export type SortDir = "asc" | "desc";

export const sortLabels: Record<SortKey, Record<SortDir, MessageKey>> = {
  date: { desc: "review.sortNewest", asc: "review.sortOldest" },
  amount: { desc: "review.sortBiggest", asc: "review.sortSmallest" },
  place: { asc: "review.sortPlaceAsc", desc: "review.sortPlaceDesc" },
  category: { asc: "review.sortCategoryAsc", desc: "review.sortCategoryDesc" },
};

export const sortDefaults: Record<SortKey, SortDir> = {
  date: "desc",
  amount: "desc",
  place: "asc",
  category: "asc",
};

function calendarAddDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function monthBounds(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function rangeBounds(today: string): Omit<DateRangeEntry, "label">[] {
  const [year, month] = today.split("-").map(Number);
  const ranges: Omit<DateRangeEntry, "label">[] = [
    { id: "all", from: null, to: null },
    { id: "7d", from: calendarAddDays(today, -6), to: today },
  ];
  for (let offset = 0; offset < 3; offset++) {
    const cursor = new Date(Date.UTC(year, month - 1 - offset, 1));
    const monthYear = cursor.getUTCFullYear();
    const monthIndex = cursor.getUTCMonth() + 1;
    const id = `${monthYear}-${String(monthIndex).padStart(2, "0")}` as DateRangeId;
    const { from, to: monthEnd } = monthBounds(monthYear, monthIndex);
    ranges.push({ id, from, to: offset === 0 ? today : monthEnd });
  }
  return ranges;
}

function rangeLabel(id: DateRangeId, { t, language }: Translator) {
  if (id === "all") return t("review.allTime");
  if (id === "7d") return t("review.last7Days");
  const [year, month] = id.split("-").map(Number);
  return formatMonthName(language, Date.UTC(year, month - 1, 1), { timeZone: "UTC" });
}

export function dateRanges(today: string, translator: Translator): DateRangeEntry[] {
  return rangeBounds(today).map(({ id, from, to }) => ({ id, label: rangeLabel(id, translator), from, to }));
}

/** Date keys are workspace calendar days already, so they are read in UTC. */
export function historyDateLabel(dateKey: string, workspaceYear: number, language: Language): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = Date.UTC(year, month - 1, day);
  return year === workspaceYear ? formatDayMonth(language, date, "UTC") : formatLongDate(language, date, "UTC");
}

function profileName(row: HistoryRow, profileNames: Readonly<Record<string, string>>) {
  if (!row.financialAccountProfileId) return "";
  return profileNames[row.financialAccountProfileId] ?? "";
}

function primaryCategoryName(row: HistoryRow) {
  if (row.primaryUserCategoryId) {
    const match = row.userCategories.find(
      (category) => category.id === row.primaryUserCategoryId,
    );
    if (match) return match.name;
  }
  return row.userCategories[0]?.name ?? "";
}

function majorUnitDigits(amount: HistoryRow["amount"]) {
  return String(toMajorUnits(Math.abs(amount.minorUnits), amount.currency));
}

function searchHaystack(
  row: HistoryRow,
  context: HistoryFilterContext,
): string {
  const workspaceYear = Number(context.today.slice(0, 4));
  return [
    row.title,
    row.detail,
    ...row.userCategories.map((category) => category.name),
    profileName(row, context.profileNames),
    majorUnitDigits(row.amount),
    historyDateLabel(row.date, workspaceYear, context.language),
  ]
    .join(" ")
    .toLowerCase();
}

// Empty profileIds/categoryIds mean "everything". A custom span overrides the
// quick range when either end is set.
export function filterHistory(
  rows: HistoryRow[],
  query: HistoryQuery,
  context: HistoryFilterContext,
) {
  const custom = query.customFrom !== null || query.customTo !== null;
  const range = custom
    ? { from: query.customFrom, to: query.customTo }
    : rangeBounds(context.today).find((entry) => entry.id === query.range);
  const needle = query.search.trim().toLowerCase();

  return rows.filter((row) => {
    const profileIds = row.financialAccountProfileIds ??
      (row.financialAccountProfileId ? [row.financialAccountProfileId] : []);
    if (
      query.profileIds.length > 0 &&
      !profileIds.some((id) => query.profileIds.includes(id))
    ) {
      return false;
    }
    if (
      query.categoryIds.length > 0 &&
      !row.userCategories.some((category) =>
        query.categoryIds.includes(category.id),
      )
    ) {
      return false;
    }
    if (range?.from && row.date < range.from) {
      return false;
    }
    if (range?.to && row.date > range.to) {
      return false;
    }
    if (!needle) {
      return true;
    }
    return searchHaystack(row, context).includes(needle);
  });
}

export function sortHistory(
  rows: HistoryRow[],
  key: SortKey,
  dir: SortDir,
  profileNames: Readonly<Record<string, string>> = {},
) {
  const flip = dir === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (key === "amount") {
      const leftAmount = Math.abs(left.amount.minorUnits);
      const rightAmount = Math.abs(right.amount.minorUnits);
      return (leftAmount - rightAmount) * flip;
    }
    if (key === "place") {
      const byName = profileName(left, profileNames).localeCompare(
        profileName(right, profileNames),
      );
      return byName !== 0
        ? byName * flip
        : right.date.localeCompare(left.date);
    }
    if (key === "category") {
      const byName = primaryCategoryName(left).localeCompare(
        primaryCategoryName(right),
      );
      return byName !== 0
        ? byName * flip
        : right.date.localeCompare(left.date);
    }
    return left.date.localeCompare(right.date) * flip;
  });
}
