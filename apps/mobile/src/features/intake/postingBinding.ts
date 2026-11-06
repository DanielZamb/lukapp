import type { ConfirmCandidateInput, ConfirmCandidateResult, IntakeSuggestion } from "../../../../../src/notificationIntake/types";
import { intakeConfirmOutcome, intakeErrorMessage } from "../../../../../src/notificationIntake/outcome";
import { requiresLocalWipe } from "../../local-auth/accessFailure";
import type { LocalEntryFacts } from "../localEntryDrafts";
import type { IntakeBinding, PostingReceipt } from "../posting/usePostingEditor";
import { parseMoney } from "../money";
import { evidenceFor, notificationOf, projectCandidate, type ActiveCandidate } from "./durableState";
import { factsFromCandidate } from "./facts";
import type { IntakeService } from "./service";

export function createCandidateBinding(input: {
  service: IntakeService;
  candidateId: string;
  workspaceId: string;
  dispatch(command: ConfirmCandidateInput): Promise<ConfirmCandidateResult>;
}): IntakeBinding {
  const { service, candidateId } = input;
  function row() {
    const value = service.read(candidateId);
    if (!value || value.workspaceId !== input.workspaceId) throw new Error("Candidate unavailable");
    return value;
  }
  function receipt(result: ConfirmCandidateResult, command: ConfirmCandidateInput): PostingReceipt {
    return { description: result.posted.description, amount: { currency: result.posted.amount.currency,
      minorUnits: (command.confirmed.direction === "out" ? -1 : 1) * Math.abs(result.posted.amount.minorUnits) } };
  }
  async function persistReview(facts: LocalEntryFacts, currencyReviewed = false) {
    const current = row();
    if (current.status.kind !== "review") return;
    if (facts.workspaceId !== current.workspaceId || facts.currency !== current.currency || facts.entryType !== "normal")
      throw new Error("Candidate review belongs to another workspace");
    let amount: number | null = null;
    try { amount = parseMoney(facts.amountText, "es-CO", current.currency); } catch {}
    await service.updateReview(candidateId, current.recordRevision, {
      direction: amount === null || amount === 0 ? current.review.direction : amount < 0 ? "out" : "in",
      description: facts.description, amountMinorUnits: amount === null ? null : Math.abs(amount), accountingDate: facts.accountingDate,
      financialAccountProfileId: facts.profileId, userCategoryIds: facts.categories.ids,
      primaryUserCategoryId: facts.categories.primaryId,
    }, { amountText: facts.amountText, currencyReviewed });
  }
  return {
    id: candidateId,
    facts: factsFromCandidate(projectCandidate(row())),
    reviewNote: row().origin.kind === "native" ? reviewNote(row()) : "Imported Candidate. Review all facts before posting.",
    notification: notificationOf(row()),
    originalSuggestion: evidenceFor(row()),
    get frozen() { const current = service.read(candidateId); return !current || current.status.kind !== "review"; },
    persistReview,
    async confirm(confirmed: IntakeSuggestion) {
      let current = row();
      if (current.status.kind === "outcome") {
        const saved = current.status;
        await service.applyRecordedOutcomes();
        if (!saved.outcome.ok) throw new Error(saved.outcome.error);
        return receipt(saved.outcome.result, saved.command);
      }
      if (current.status.kind === "review") {
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

function reviewNote(row: ActiveCandidate): string {
  if (row.origin.kind !== "native") return "Imported Candidate";
  const capture = row.origin.capture;
  const amount = capture.amountMinorUnits === null ? "Amount unresolved" : `Original amount ${capture.amountMinorUnits / 100} ${capture.currency ?? "currency unresolved"}`;
  const direction = capture.direction === null ? "Direction unresolved. Enter a signed amount." : `Original direction ${capture.direction}`;
  return `Source ${row.origin.mapping.packageName}. Captured ${new Date(capture.capturedAt).toLocaleString()}. ${amount}. ${direction}. Review currency ${row.currency}.`;
}
