export function currencyMismatchReason(
  candidateCurrency: string,
  workspaceCurrency: string,
) {
  if (candidateCurrency === workspaceCurrency) return null;
  return `Uses ${candidateCurrency}. This workspace uses ${workspaceCurrency}.`;
}

export function isReadyCandidate(
  candidate: {
    error?: string;
    currency?: string;
    suggestion: {
      description: string;
      amountMinorUnits: number | null;
      direction: "in" | "out" | null;
      financialAccountProfileId: string;
    };
  },
  workspaceCurrency?: string,
) {
  return (
    !candidate.error &&
    !!candidate.suggestion.description.trim() &&
    candidate.suggestion.direction !== null &&
    candidate.suggestion.amountMinorUnits !== null &&
    Number.isSafeInteger(candidate.suggestion.amountMinorUnits) &&
    candidate.suggestion.amountMinorUnits > 0 &&
    !!candidate.suggestion.financialAccountProfileId &&
    (!workspaceCurrency || candidate.currency === workspaceCurrency)
  );
}
