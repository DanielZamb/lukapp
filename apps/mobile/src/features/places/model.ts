import type { FunctionReturnType } from "convex/server";
import { languages, translate } from "../../../../../src/i18n";
import { formatLongDate, type MessageKey, type Translator } from "../../i18n";
import type { api } from "../api";
import { formatMoney, parseMoney } from "../money";

export type Place = FunctionReturnType<typeof api.accounting.postedActivity>["accounts"][number];
export const placeKinds = ["Checking", "Savings", "DigitalWallet", "Cash"] as const;
export type PlaceKind = typeof placeKinds[number];
export const kindDetails = {
  Checking: { productKind: "bankAccount", emoji: "💰" },
  Savings: { productKind: "savingsAccount", emoji: "🏦" },
  DigitalWallet: { productKind: "savingsAccount", emoji: "📱" },
  Cash: { productKind: "cash", emoji: "👛" },
} as const;
export const accountKinds: Record<Place["productKind"], MessageKey> = {
  bankAccount: "places.kindBankAccount", savingsAccount: "places.kindSavingsAccount", cash: "places.kindCash",
  creditCard: "places.kindCreditCard", loan: "places.kindLoan",
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
  try { minorUnits = parseMoney(value, "es-CO", currency); } catch { minorUnits = 0; }
  return formatMoney({ currency, minorUnits }).replace(`${currency} `, "");
}
export function trackingDate(value: string | null, { t, language }: Translator) {
  return value ? formatLongDate(language, new Date(`${value}T12:00:00Z`), "UTC") : t("places.accountNotStarted");
}
const setupPlaceNames: ReadonlySet<string> = new Set(languages.map((language) => translate(language, "planning.myMoney")));
export function placeTitle(name: string, placeCount: number, t: Translator["t"]) {
  return placeCount === 1 && setupPlaceNames.has(name) ? t("planning.myMoney") : name;
}
