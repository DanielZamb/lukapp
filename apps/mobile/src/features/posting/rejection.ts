import { accountingErrorMessages, type AccountingErrorCode } from "../../../../../src/accounting/errors";
import type { MessageKey, Translator } from "../../i18n";

const rejectionKeys: Record<string, MessageKey> = {
  account_name_too_long: "posting.rejectAccountNameTooLong",
  account_name_conflict: "posting.rejectAccountNameConflict",
  account_emoji_required: "posting.rejectAccountEmojiRequired",
  transfer_profiles_must_differ: "posting.rejectTransferProfilesMustDiffer",
  opening_already_exists: "posting.rejectOpeningAlreadyExists",
  activity_before_opening: "posting.rejectActivityBeforeOpening",
  opening_after_activity: "posting.rejectOpeningAfterActivity",
  opening_amount_invalid: "posting.rejectOpeningAmountInvalid",
  account_setup_conflict: "posting.rejectAccountSetupConflict",
  category_selection_invalid: "posting.rejectCategorySelectionInvalid",
  category_limit_exceeded: "posting.rejectCategoryLimitExceeded",
  category_primary_invalid: "posting.rejectCategoryPrimaryInvalid",
  category_primary_required: "posting.rejectCategoryPrimaryRequired",
  category_not_found: "posting.rejectCategoryNotFound",
  category_nature_required: "posting.rejectCategoryNatureRequired",
  category_nature_mismatch: "posting.rejectCategoryNatureMismatch",
  currency_mismatch: "posting.rejectCurrencyMismatch",
  amount_must_be_positive: "posting.rejectAmountMustBePositive",
  locked_period: "posting.rejectLockedPeriod",
  financial_account_profile_not_found: "posting.rejectProfileNotFound",
  financial_account_profile_ended: "placeEnding.rejectEnded",
  place_undo_in_progress: "placeEnding.rejectUndoing",
  name_required: "posting.rejectNameRequired",
  workspace_membership_required: "posting.rejectMembershipRequired",
  idempotency_key_conflict: "posting.rejectIdempotencyConflict",
  account_required: "posting.rejectAccountRequired",
  description_required: "posting.rejectDescriptionRequired",
  amount_invalid: "posting.rejectAmountInvalid",
  direction_invalid: "posting.rejectDirectionInvalid",
  workspace_not_found: "posting.rejectWorkspaceNotFound",
};

/** Accounting rejections reach a Candidate as the server's English sentence; this recovers their code. */
const codeByAccountingMessage = new Map<string, string>(
  (Object.entries(accountingErrorMessages) as [AccountingErrorCode, string][]).map(([code, message]) => [message, code]),
);

const storedCandidateKeys: Record<string, MessageKey> = {
  "Review unresolved currency": "inbox.candidateUnresolvedCurrency",
  "Confirmation pending. Open to retry.": "inbox.candidatePending",
  "Candidate rejected": "inbox.candidateRejected",
  "Unsupported workspace currency": "inbox.candidateUnsupportedCurrency",
};

/** The `code` a Convex rejection carries, if any. */
export function rejectionCode(error: unknown): string | null {
  const data = error !== null && typeof error === "object" && "data" in error ? error.data : null;
  return data !== null && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : null;
}

/** A server rejection as catalog text: a known code reads as its message, anything else as `fallback`. */
export function rejectionMessage(t: Translator["t"], error: unknown, fallback: MessageKey): string {
  const key = rejectionKeys[rejectionCode(error) ?? ""];
  return t(key ?? fallback);
}

/**
 * A Candidate keeps the reason its confirmation failed as stored text: an intake code, the server's English
 * accounting message, or a local status. Each reads in the person's language; unknown text reads as a rejection.
 */
export function candidateErrorText(t: Translator["t"], stored: string): string {
  const local = storedCandidateKeys[stored];
  if (local) return t(local);
  const key = rejectionKeys[stored] ?? rejectionKeys[codeByAccountingMessage.get(stored) ?? ""];
  return t(key ?? "inbox.candidateRejected");
}
