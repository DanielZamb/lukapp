import { formatMinorUnits, type AmountFormat } from "../../../../../src/money/amount";
import type { Translator } from "../../i18n";
import type { AmountSession } from "./session";

function examples(format: AmountFormat) {
  const { precision } = format;
  return {
    decimal: precision === 0 ? null : formatMinorUnits(1250 * 10 ** (precision - 2), format),
    full: formatMinorUnits(precision === 0 ? 1234 : 12345 * 10 ** (precision - 1), format),
  };
}

function mark(separator: string, t: Translator["t"]) {
  return t(separator === "," ? "amount.markComma" : "amount.markPoint");
}

/**
 * Why the field cannot be used yet, with an example in the workspace's own format. Text still being typed toward a
 * valid amount has no hint, except a short group after a group mark: that is how the other convention's decimal
 * reads, so the hint names this currency's decimal mark.
 */
export function amountHint(session: AmountSession, t: Translator["t"]): string | null {
  const { editor, currency } = session;
  if (editor.kind === "complete") return null;
  const { convention, precision } = editor.format;
  const example = examples(editor.format);
  const decimalHint = () => example.decimal === null
    ? t("amount.hintGrouping", { mark: mark(convention.group, t), example: example.full })
    : t("amount.hintDecimal", { mark: mark(convention.decimal, t), example: example.decimal });
  const issue = editor.issue;
  switch (issue.code) {
    case "empty":
      return null;
    case "incomplete":
      return issue.expected === "group" ? decimalHint() : null;
    case "bad_grouping": {
      const unsigned = editor.text.trim().replace(/^[+−-]/, "");
      const last = unsigned.split(convention.group).pop() ?? "";
      return !unsigned.includes(convention.decimal) && last.length < convention.primaryGroupSize ? decimalHint()
        : t("amount.hintGrouping", { mark: mark(convention.group, t), example: example.full });
    }
    case "wrong_separator":
      return t("amount.hintFormat", { example: example.full });
    case "too_many_decimals":
      return t("amount.hintTooManyDecimals", { precision, example: example.decimal ?? example.full });
    case "decimals_not_allowed":
      return t("amount.hintNoDecimals", { currency, example: example.full });
    case "too_large":
      return t("amount.hintTooLarge");
    case "not_a_number":
      return issue.character === convention.group || issue.character === convention.decimal
        ? t("amount.hintFormat", { example: example.full })
        : t("amount.hintNotNumber", { example: example.full });
  }
}

/**
 * The hint for text that cannot be used, a request to confirm an amount that awaits confirmation, or a plain example
 * of the format when it is only incomplete.
 */
export function amountRefusal(session: AmountSession, t: Translator["t"]): string {
  if (session.review && session.editor.kind === "complete") return t("amount.reviewRequired");
  return amountHint(session, t) ?? t("amount.hintFormat", { example: examples(session.editor.format).full });
}
