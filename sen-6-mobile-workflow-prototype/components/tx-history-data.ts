// Seeded history corpus for the tx history prototype. Amounts are
// N(500000, 4500000), folded to a positive money amount.

export type TxKind = "normal" | "opening" | "transfer";

export type Activity = {
  id: string;
  description: string;
  amount: number;
  accountId: string;
  category: string;
  direction: "in" | "out";
  date: string;
  dateKey: string;
  kind?: TxKind;
};

export const historyPlaces = [
  { id: "pool", name: "My money", emoji: "💰" },
  { id: "savings", name: "Savings", emoji: "🏦" },
  { id: "wallet", name: "Wallet", emoji: "👛" },
] as const;

export function placeEmoji(accountId: string) {
  return historyPlaces.find((place) => place.id === accountId)?.emoji ?? "💰";
}

export const historyCategories = [
  "Food",
  "Transport",
  "Dining",
  "Home",
  "Health",
  "Fun",
  "Shopping",
  "Bills",
  "Family",
  "Other",
] as const;

const spendCopy: Record<string, string[]> = {
  Food: ["Groceries", "Market run", "Corner shop", "Bakery", "Fruit stand"],
  Transport: ["Bus fare", "Taxi", "Metro", "Gas", "Parking"],
  Dining: ["Dinner out", "Coffee", "Lunch", "Delivery", "Breakfast out"],
  Home: ["Cleaning stuff", "Hardware", "Utilities top-up", "Repairs"],
  Health: ["Pharmacy", "Clinic", "Vitamins", "Dental"],
  Fun: ["Cinema", "Game", "Concert", "Streaming"],
  Shopping: ["Clothes", "Shoes", "Marketplace", "Gift"],
  Bills: ["Phone bill", "Internet", "Electricity", "Water"],
  Family: ["School stuff", "Allowance", "Shared dinner"],
  Other: ["Misc", "ATM fee", "Adjustment"],
};

const inCopy = ["Payday", "Refund", "Transfer in", "Interest"];

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number, mean: number, std: number) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + std * z;
}

function pick<T>(rand: () => number, items: readonly T[]) {
  return items[Math.floor(rand() * items.length)] ?? items[0];
}

function formatDay(year: number, month: number, day: number) {
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    dateKey,
    date: `${monthNames[month - 1]} ${day}`,
  };
}

function dayOnSpan(offset: number) {
  const start = new Date(2026, 5, 1);
  const next = new Date(start);
  next.setDate(start.getDate() + offset);
  return formatDay(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

export function generateHistory(count = 150, seed = 22): Activity[] {
  const rand = mulberry32(seed);
  const items: Activity[] = [];
  const spanDays = 84;

  for (let index = 0; index < count; index += 1) {
    const incoming = rand() < 0.12;
    const raw = normal(rand, 500000, 4500000);
    const amount = Math.max(2000, Math.round(Math.abs(raw) / 100) * 100);
    const placeRoll = rand();
    const accountId =
      placeRoll < 0.6 ? "pool" : placeRoll < 0.85 ? "savings" : "wallet";
    const category = incoming ? "Other" : pick(rand, historyCategories);
    const descriptions = incoming ? inCopy : spendCopy[category];
    const { date, dateKey } = dayOnSpan(Math.floor(rand() * spanDays));
    items.push({
      id: `tx-${index + 1}`,
      description: pick(rand, descriptions),
      amount,
      accountId,
      category: incoming ? "Income" : category,
      direction: incoming ? "in" : "out",
      date,
      dateKey,
    });
  }

  return items.sort((left, right) => right.dateKey.localeCompare(left.dateKey));
}

export const generatedHistory = generateHistory();

export function placeName(accountId: string) {
  return (
    historyPlaces.find((place) => place.id === accountId)?.name ?? "My money"
  );
}

export function inThisMonth(item: Activity) {
  return item.dateKey.startsWith("2026-08");
}

export function spentInMonth(
  activity: Activity[],
  category?: string,
  month = "2026-08",
) {
  return activity
    .filter(
      (item) =>
        item.direction === "out" &&
        (item.kind ?? "normal") === "normal" &&
        item.dateKey.startsWith(month) &&
        (category == null || item.category === category),
    )
    .reduce((sum, item) => sum + item.amount, 0);
}

export function inInMonth(activity: Activity[], month = "2026-08") {
  return activity
    .filter(
      (item) =>
        item.direction === "in" &&
        (item.kind ?? "normal") === "normal" &&
        item.dateKey.startsWith(month),
    )
    .reduce((sum, item) => sum + item.amount, 0);
}

export type DateRangeId = "all" | "7d" | "august" | "july" | "june";

export const dateRanges: {
  id: DateRangeId;
  label: string;
  from: string | null;
  to: string | null;
}[] = [
  { id: "all", label: "All time", from: null, to: null },
  { id: "7d", label: "Last 7 days", from: "2026-08-17", to: "2026-08-23" },
  { id: "august", label: "August", from: "2026-08-01", to: "2026-08-23" },
  { id: "july", label: "July", from: "2026-07-01", to: "2026-07-31" },
  { id: "june", label: "June", from: "2026-06-01", to: "2026-06-30" },
];

// Empty accountIds/categories mean "everything". A custom span overrides the
// quick range when both of its ends are set.
export type HistoryQuery = {
  search: string;
  accountIds: string[];
  categories: string[];
  range: DateRangeId;
  customFrom: string | null;
  customTo: string | null;
};

export function filterHistory(activity: Activity[], query: HistoryQuery) {
  const custom = query.customFrom !== null || query.customTo !== null;
  const range = custom
    ? { from: query.customFrom, to: query.customTo }
    : dateRanges.find((entry) => entry.id === query.range);
  const needle = query.search.trim().toLowerCase();

  return activity.filter((item) => {
    if (
      query.accountIds.length > 0 &&
      !query.accountIds.includes(item.accountId)
    ) {
      return false;
    }
    if (
      query.categories.length > 0 &&
      !query.categories.includes(item.category)
    ) {
      return false;
    }
    if (range?.from && item.dateKey < range.from) {
      return false;
    }
    if (range?.to && item.dateKey > range.to) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const hay = [
      item.description,
      item.category,
      placeName(item.accountId),
      String(item.amount),
      item.date,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(needle);
  });
}

export type SortKey = "date" | "amount" | "place" | "category";
export type SortDir = "asc" | "desc";

export function sortHistory(rows: Activity[], key: SortKey, dir: SortDir) {
  const flip = dir === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (key === "amount") {
      return (left.amount - right.amount) * flip;
    }
    if (key === "place") {
      const byName = placeName(left.accountId).localeCompare(
        placeName(right.accountId),
      );
      return byName !== 0
        ? byName * flip
        : right.dateKey.localeCompare(left.dateKey);
    }
    if (key === "category") {
      const byName = left.category.localeCompare(right.category);
      return byName !== 0
        ? byName * flip
        : right.dateKey.localeCompare(left.dateKey);
    }
    return left.dateKey.localeCompare(right.dateKey) * flip;
  });
}
