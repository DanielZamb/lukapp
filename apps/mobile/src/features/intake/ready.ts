export function isReadyCandidate(candidate: {
  error?: string;
  suggestion: {
    description: string;
    amountMinorUnits: number;
    financialAccountProfileId: string;
  };
}) {
  return (
    !candidate.error &&
    !!candidate.suggestion.description.trim() &&
    candidate.suggestion.amountMinorUnits !== 0 &&
    !!candidate.suggestion.financialAccountProfileId
  );
}
