import { formatMoney } from "../money";
import type { LocalEntryFacts } from "../localEntryDrafts";
import type { IntakeCandidate } from "./candidates";
import { suggestionOf } from "./candidates";

export function factsFromCandidate(candidate: IntakeCandidate): LocalEntryFacts {
  const signed =
    candidate.suggestion.direction === "out"
      ? -Math.abs(candidate.suggestion.amountMinorUnits)
      : Math.abs(candidate.suggestion.amountMinorUnits);
  return {
    workspaceId: candidate.workspaceId,
    currency: candidate.currency,
    entryType: "normal",
    amountText: formatMoney({
      currency: candidate.currency,
      minorUnits: signed,
    }).replace(`${candidate.currency} `, ""),
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

export { suggestionOf };
