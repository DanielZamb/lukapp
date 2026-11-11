import type { ConfirmCandidateInput, ConfirmCandidateResult, IntakeSuggestion } from "../../../../../src/notificationIntake/types";
import { intakeConfirmOutcome, intakeErrorMessage } from "../../../../../src/notificationIntake/outcome";
import { requiresLocalWipe } from "../../local-auth/accessFailure";
import type { LocalEntryFacts } from "../localEntryDrafts";
import type { IntakeBinding, PostingReceipt } from "../posting/usePostingEditor";
import { storedAmountMinorUnits, type StoredAmountText } from "../amount/storedText";
import { formatDateTime, type Translator } from "../../i18n";
import { formatAmount } from "../money";
import { evidenceFor, notificationOf, projectCandidate, type ActiveCandidate } from "./durableState";
import { factsFromCandidate } from "./facts";
import { discardCandidate } from "./discard";
import type { IntakeService } from "./service";

export function createCandidateBinding(input: {
  service: IntakeService;
  candidateId: string;
  workspaceId: string;
  dispatch(command: ConfirmCandidateInput): Promise<ConfirmCandidateResult>;
  translator: Translator;
}): IntakeBinding {
  const { service, candidateId } = input;
  function row() {
    const value = service.read(candidateId);
    if (!value || value.workspaceId !== input.workspaceId) throw new Error("Candidate unavailable");
    return value;
  }
  let seen = row().recordRevision;
  /** The confirmation a frozen Candidate holds, exactly as it will be sent again; null while it is in review. */
  function held(): IntakeSuggestion | null {
    const current = service.read(candidateId);
    return current && current.status.kind !== "review" ? current.status.command.confirmed : null;
  }
  const opened = row();
  const holding = held();
  // A frozen Candidate shows the command it holds, never its review text read again under today's amount format.
  const shown = holding ? { ...projectCandidate(opened), reviewAmount: null,
    suggestion: { ...opened.review, ...heldReview(holding) } } : projectCandidate(opened);
  function receipt(result: ConfirmCandidateResult, command: ConfirmCandidateInput): PostingReceipt {
    return { description: result.posted.description, amount: { currency: result.posted.amount.currency,
      minorUnits: (command.confirmed.direction === "out" ? -1 : 1) * Math.abs(result.posted.amount.minorUnits) } };
  }
  async function persistReview(facts: LocalEntryFacts, currencyReviewed = false) {
    const current = row();
    if (current.status.kind !== "review") return;
    if (facts.workspaceId !== current.workspaceId || facts.currency !== current.currency || facts.entryType !== "normal")
      throw new Error("Candidate review belongs to another workspace");
    const typed: StoredAmountText = { text: facts.amountText, format: facts.amountFormat, ...(facts.amountReenter ? { reenter: true } : {}),
      ...(facts.amountReview ? { review: facts.amountReview } : {}) };
    const amount = storedAmountMinorUnits(typed, current.currency);
    seen = await service.updateReview(candidateId, current.recordRevision, {
      direction: amount === null || amount === 0 ? current.review.direction : amount < 0 ? "out" : "in",
      description: facts.description, amountMinorUnits: amount === null ? null : Math.abs(amount), accountingDate: facts.accountingDate,
      financialAccountProfileId: facts.profileId, userCategoryIds: facts.categories.ids,
      primaryUserCategoryId: facts.categories.primaryId,
    }, { amount: typed, currencyReviewed });
  }
  return {
    id: candidateId,
    facts: factsFromCandidate(shown),
    reviewNote: reviewNote(row(), input.translator),
    notification: notificationOf(row()),
    originalSuggestion: evidenceFor(row()),
    get frozen() { const current = service.read(candidateId); return !current || current.status.kind !== "review"; },
    get held() { return held(); },
    persistReview,
    discard: () => discardCandidate(service, candidateId, seen),
    async confirm(confirmed: IntakeSuggestion | null) {
      let current = row();
      if (current.status.kind === "outcome") {
        const saved = current.status;
        await service.applyRecordedOutcomes();
        if (!saved.outcome.ok) throw new Error(saved.outcome.error);
        return receipt(saved.outcome.result, saved.command);
      }
      if (current.status.kind === "review") {
        if (!confirmed) throw new Error("Confirm the Candidate's facts first");
        if (confirmed.amount.currency !== current.currency) throw new Error("Unsupported workspace currency");
        const { amount, ...review } = confirmed;
        const revision = await service.updateReview(candidateId, current.recordRevision, { ...review, amountMinorUnits: amount.minorUnits }, { currencyReviewed: true });
        await service.beginConfirmation(candidateId, revision);
        current = row();
      }
      const command = await service.beginConfirmation(candidateId, current.recordRevision);
      let result: ConfirmCandidateResult;
      try { service.assertAdmitted(); result = await input.dispatch(command); }
      catch (error) {
        if (requiresLocalWipe(error)) throw error;
        if (intakeConfirmOutcome(error) === "fail") {
          await service.recordOutcomes([{ candidateId, ok: false, error: intakeErrorMessage(error, "Candidate rejected") }]);
          await service.applyRecordedOutcomes();
        }
        throw error;
      }
      await service.recordOutcomes([{ candidateId, ok: true, result }]);
      await service.applyRecordedOutcomes();
      return receipt(result, command);
    },
  };
}

/** The review fields of a held confirmation, as the single-entry form opens them. */
function heldReview({ amount, ...rest }: IntakeSuggestion) {
  return { ...rest, userCategoryIds: [...rest.userCategoryIds], amountMinorUnits: amount.minorUnits };
}

/**
 * What the notification said, around its stored package name, amount and currency. The amount is the integer the
 * bank text was read as, written in the format of its own currency when the notification named one and of the
 * Candidate's currency otherwise. The bank text itself is never read again here.
 */
function reviewNote(row: ActiveCandidate, { t, language }: Translator): string {
  if (row.origin.kind !== "native") return t("inbox.reviewImported");
  const capture = row.origin.capture;
  const amount = capture.amountMinorUnits === null ? t("inbox.reviewAmountUnresolved") : t("inbox.reviewAmount", {
    amount: formatAmount(capture.amountMinorUnits, capture.currency ?? row.currency, { hideZeroDecimals: true }),
    currency: capture.currency ?? t("inbox.reviewCurrencyUnresolved"),
  });
  const direction = t(capture.direction === null ? "inbox.reviewDirectionUnresolved"
    : capture.direction === "in" ? "inbox.reviewDirectionIn" : "inbox.reviewDirectionOut");
  return t("inbox.reviewNote", {
    source: row.origin.mapping.packageName,
    captured: formatDateTime(language, capture.capturedAt),
    amount, direction, currency: row.currency,
  });
}
