import { formatMoney } from "../money";
import { currentAmountTextFormat } from "../amount/currencyFormat";
import { savedAmountAsOpened } from "../amount/session";
import type { StoredAmountText } from "../amount/storedText";

type CandidateAmount = {
  currency: string;
  /** The amount text saved from the single-entry review, which may still await confirmation or re-entry. */
  reviewAmount?: StoredAmountText | null;
  suggestion: { amountMinorUnits: number | null; direction: "in" | "out" | null };
};

/** The amount text the single-entry form opens for a Candidate: the review text saved from it, else its suggestion. */
export function candidateAmountText(candidate: CandidateAmount): StoredAmountText {
  if (candidate.reviewAmount) return candidate.reviewAmount;
  const { amountMinorUnits: known, direction } = candidate.suggestion;
  const signed = known === null ? null : direction === "out" ? -Math.abs(known) : Math.abs(known);
  return {
    text: signed === null || direction === null ? "" : formatMoney({ currency: candidate.currency, minorUnits: signed })
      .replace(`${candidate.currency} `, ""),
    format: currentAmountTextFormat(candidate.currency),
  };
}

/**
 * Whether a Candidate may be confirmed with the money it holds without the person opening it: its amount text opens in
 * the single-entry form as a whole amount that asks for no confirmation or re-entry, and reads exactly the saved
 * amount and direction a confirmation sends.
 */
export function candidateSendsAsSaved(candidate: CandidateAmount): boolean {
  const { amountMinorUnits, direction } = candidate.suggestion;
  if (amountMinorUnits === null || direction === null) return false;
  return savedAmountAsOpened(candidate.currency, candidateAmountText(candidate)) === (direction === "out" ? -amountMinorUnits : amountMinorUnits);
}
