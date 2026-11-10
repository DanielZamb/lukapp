import { formatMoney } from "../money";
import { currentAmountTextFormat } from "../amount/currencyFormat";
import type { LocalEntryFacts } from "../localEntryDrafts";
import type { IntakeCandidate } from "./candidates";
import { reviewSuggestionOf } from "./candidates";

export function factsFromCandidate(candidate: IntakeCandidate): LocalEntryFacts {
  const known = candidate.suggestion.amountMinorUnits;
  const signed = known === null ? null :
    candidate.suggestion.direction === "out"
      ? -Math.abs(known)
      : Math.abs(known);
  const typed = candidate.reviewAmount;
  return {
    workspaceId: candidate.workspaceId,
    currency: candidate.currency,
    entryType: "normal",
    ...(typed ? {
      amountText: typed.text, amountFormat: typed.format, ...(typed.reenter ? { amountReenter: true } : {}),
    } : {
      amountText: signed === null || candidate.suggestion.direction === null ? "" : formatMoney({
        currency: candidate.currency,
        minorUnits: signed,
      }).replace(`${candidate.currency} `, ""),
      amountFormat: currentAmountTextFormat(candidate.currency),
    }),
    accountingDate: candidate.suggestion.accountingDate,
    description: candidate.suggestion.description,
    profileId: candidate.suggestion.financialAccountProfileId,
    destinationId: null,
    categories: {
      ids: [...candidate.suggestion.userCategoryIds],
      primaryId: candidate.suggestion.primaryUserCategoryId,
    },
  };
}

export { reviewSuggestionOf };
