import type { LocalEntryFacts } from "../localEntryDrafts";
import { candidateAmountText } from "./amountText";
import type { IntakeCandidate } from "./candidates";
import { reviewSuggestionOf } from "./candidates";

export function factsFromCandidate(candidate: IntakeCandidate): LocalEntryFacts {
  const typed = candidateAmountText(candidate);
  return {
    workspaceId: candidate.workspaceId,
    currency: candidate.currency,
    entryType: "normal",
    amountText: typed.text,
    amountFormat: typed.format,
    ...(typed.reenter ? { amountReenter: true } : {}),
    ...(typed.review ? { amountReview: typed.review } : {}),
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
