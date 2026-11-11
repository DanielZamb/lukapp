import { z } from "zod";
import {
  copAmountConvention,
  currencyMinorUnitDigits,
  legacyAmountConvention,
  usdAmountConvention,
  type AmountConvention,
} from "../../../../../src/accounting/currencies";
import { formatMinorUnits, parseAmount, type AmountFormat } from "../../../../../src/money/amount";
import { readPreCurrencyAmount } from "./preCurrency";

/**
 * How a saved amount text must be read. `pre-currency` is text saved before amounts followed the workspace
 * currency; it is read only by the frozen pre-currency parser. The others name the convention the text was typed in.
 */
export const amountTextFormats = ["pre-currency", "cop/1", "usd/1", "legacy-es-CO/1"] as const;
export type AmountTextFormat = (typeof amountTextFormats)[number];
export const amountTextFormatSchema = z.enum(amountTextFormats);

type ConventionFormat = Exclude<AmountTextFormat, "pre-currency">;
const conventions: Readonly<Record<ConventionFormat, AmountConvention>> = {
  "cop/1": copAmountConvention,
  "usd/1": usdAmountConvention,
  "legacy-es-CO/1": legacyAmountConvention,
};

export function amountTextFormatOf(convention: AmountConvention): ConventionFormat {
  const format = (Object.keys(conventions) as ConventionFormat[]).find((key) => conventions[key] === convention);
  if (!format) throw new RangeError("Amount convention has no stored text format");
  return format;
}

export const amountReviewReasons = ["converted", "pasted"] as const;
export type AmountReviewReason = (typeof amountReviewReasons)[number];
/** A saved amount that still awaits the person's confirmation, and the text it was saved as before the app rewrote it. */
export type StoredAmountReview = Readonly<{ reason: AmountReviewReason; previous: string | null }>;
export const storedAmountReviewSchema = z.object({ reason: z.enum(amountReviewReasons), previous: z.string().max(256).nullable() }).strict();

/**
 * A saved amount text and the grammar it was written in. `reenter` marks text whose meaning could not be confirmed;
 * `review` marks text the person has not yet confirmed.
 */
export type StoredAmountText = Readonly<{ text: string; format: AmountTextFormat; reenter?: true; review?: StoredAmountReview }>;

export type AmountNotice =
  | Readonly<{ kind: "converted"; previous: string }>
  | Readonly<{ kind: "reenter"; previous: string }>;

function leadingSign(text: string) {
  const sign = text.trim().match(/^[+−-]/)?.[0];
  return sign === undefined ? "" : sign === "+" ? "+" : "-";
}

function isBlank(text: string) {
  return /^[+−-]?$/.test(text.trim());
}

/** The signed minor units a saved text meant under its own grammar, or null when it has no readable amount. */
export function storedAmountMinorUnits(stored: StoredAmountText, currency: string): number | null {
  if (stored.reenter) return null;
  if (stored.format === "pre-currency") {
    const reading = readPreCurrencyAmount(stored.text, currency);
    return reading.kind === "parsed" ? reading.minorUnits : null;
  }
  const precision = currencyMinorUnitDigits(currency);
  const parsed = parseAmount(stored.text, { convention: conventions[stored.format], precision });
  return parsed.kind === "parsed" ? parsed.minorUnits : null;
}

/**
 * The text an editor opens for a saved amount, in the `current` format. Text already in that format opens verbatim,
 * including incomplete text. Other text keeps its original meaning: it opens verbatim when it reads the same in the
 * current format, is rewritten from its own reading otherwise, and opens blank for re-entry when it cannot be read.
 */
export function openStoredAmountText(stored: StoredAmountText, currency: string, current: AmountFormat): {
  text: string;
  notice: AmountNotice | null;
} {
  const reenter = { text: leadingSign(stored.text), notice: { kind: "reenter", previous: stored.text } } as const;
  if (stored.reenter) return reenter;
  if (isBlank(stored.text)) return { text: stored.text, notice: null };
  if (stored.format !== "pre-currency" && conventions[stored.format] === current.convention) return { text: stored.text, notice: null };
  const minorUnits = storedAmountMinorUnits(stored, currency);
  if (minorUnits === null) return reenter;
  const same = parseAmount(stored.text, current);
  if (same.kind === "parsed" && same.minorUnits === minorUnits) return { text: stored.text, notice: null };
  return {
    text: `${leadingSign(stored.text)}${formatMinorUnits(Math.abs(minorUnits), current)}`,
    notice: { kind: "converted", previous: stored.text },
  };
}

/** Whether pre-currency review text and the review's saved amount describe the same money. */
export function preCurrencyReviewAgrees(
  text: string,
  currency: string,
  review: { amountMinorUnits: number | null; direction: "in" | "out" | null },
) {
  const reading = readPreCurrencyAmount(text, currency);
  if (reading.kind === "refused") return review.amountMinorUnits === null;
  if (review.amountMinorUnits !== Math.abs(reading.minorUnits)) return false;
  return reading.minorUnits === 0 || review.direction === (reading.minorUnits < 0 ? "out" : "in");
}
