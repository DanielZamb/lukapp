import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";
import { formatMoney, parseMoney } from "../money";

export type Place = FunctionReturnType<typeof api.accounting.postedActivity>["accounts"][number];
export const placeKinds = ["Checking", "Savings", "Wallet"] as const;
export type PlaceKind = typeof placeKinds[number];
export const kindDetails = {
  Checking: { productKind: "bankAccount", emoji: "💰" },
  Savings: { productKind: "savingsAccount", emoji: "🏦" },
  Wallet: { productKind: "cash", emoji: "👛" },
} as const;
export const accountKinds = {
  bankAccount: "Checking", savingsAccount: "Savings", cash: "Wallet",
  creditCard: "Credit card", loan: "Loan",
};
export function accountEmoji(account: Pick<Place, "emoji" | "productKind">) {
  return account.emoji ?? {
    bankAccount: "💰", savingsAccount: "🏦", cash: "👛", creditCard: "💳", loan: "🏠",
  }[account.productKind];
}
export function placesTotal(accounts: Pick<Place, "nature" | "balance">[], currency: string) {
  return { currency, minorUnits: accounts.reduce((sum, account) =>
    sum + (account.nature === "Liability" ? -account.balance.minorUnits : account.balance.minorUnits), 0) };
}
export function placeBalanceInput(value: string, currency: string) {
  let minorUnits = 0;
  try { minorUnits = parseMoney(value); } catch { minorUnits = 0; }
  return formatMoney({ currency, minorUnits }).replace(`${currency} `, "");
}
export function trackingDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`)) : "Not started yet";
}
