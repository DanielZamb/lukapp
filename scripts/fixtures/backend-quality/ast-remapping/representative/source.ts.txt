import { requireWorkspace } from "../accounting/membership";
import { periodFromAccountingDate } from "../accounting/period";
import { canonicalJson } from "../access/protocol";
import { allocate } from "./allocation";
import { minor, RecoveryError, text, total } from "./amounts";
import { countedAllocations, findPlan, ownsSourceReservation, planStatus, requireExclusiveSources, sourceExpense, sourcePaid, transferEvidence, validDate } from "./progress";
import { freezeSchedule } from "./schedule";
import type { AllocationIntent, CommandContext, ContributionAllocation, PlanTerms, RecoveryEventData, RecoveryLedger, RecoveryStore, Snapshot } from "./types";

export function createRecoveryCommands(store: RecoveryStore, ledger: RecoveryLedger, now: () => number = Date.now) {
  async function command<Input extends CommandContext>(operation: string, input: Input,
    work: (snapshot: Snapshot, at: number, today: string) => Promise<string>) {
    const workspace = await requireWorkspace(ledger, input.workspaceId, input.actor, "manageRecoveryPlans");
    if (workspace.kind !== "Personal" && workspace.kind !== "Household") throw new RecoveryError("recovery_workspace_ineligible");
    text(input.idempotencyKey);
    const fingerprint = canonicalJson({ operation, input });
    const receipt = await store.receipt(input.workspaceId, input.idempotencyKey);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw new RecoveryError("idempotency_key_conflict");
      return receipt.resultId;
    }
    const at = now();
    const resultId = await work(await store.snapshot(input.workspaceId), at, new Date(at).toISOString().slice(0, 10));
    await store.saveReceipt(input.workspaceId, input.idempotencyKey, { fingerprint, resultId });
    return resultId;
  }
  function append(input: CommandContext, at: number, data: RecoveryEventData) {
    return store.appendEvent({ workspaceId: input.workspaceId, actorId: input.actor.userId, recordedAt: at, data });
  }
  function validateTerms(terms: PlanTerms) {
    text(terms.name);
    if (!terms.sources.length || new Set(terms.sources.map(source => source.entryId)).size !== terms.sources.length)
      throw new RecoveryError("recovery_sources_invalid");
    terms.sources.forEach(source => minor(source.principalMinor, true));
    freezeSchedule(terms, "2000-01-01", 0);
  }
  async function contribution(input: CommandContext, snapshot: Snapshot, at: number, today: string,
    transferEntryId: string, intents: AllocationIntent[], intent: "explicit" | "acceptedProposal", proposalId: string | null) {
    if (!intents.length || new Set(intents.map(item => item.planId)).size !== intents.length) throw new RecoveryError("recovery_allocations_invalid");
    const evidence = await transferEvidence(ledger, input.workspaceId, transferEntryId, today);
    const counted = await countedAllocations(ledger, snapshot, at);
    const consumed = total(counted.contributions.filter(item => !item.corrected && item.data.transferEntryId === transferEntryId)
      .flatMap(item => item.data.allocations.map(allocation => allocation.amountMinor)));
    const amount = total(intents.map(item => minor(item.amountMinor, true)));
    if (total([consumed, amount]) > evidence.capacityMinor) throw new RecoveryError("recovery_transfer_capacity_exceeded");
    const paid = [...counted.verified, ...counted.declared];
    const allocations: ContributionAllocation[] = [];
    for (const item of intents) {
      const plan = findPlan(snapshot, item.planId);
      const status = await planStatus(ledger, snapshot, plan, paid, at);
      if (status.kind !== "Active" || plan.state.kind !== "Activated") throw new RecoveryError("recovery_plan_inactive");
      if (evidence.entry.accountingDate < plan.state.commitment.activatedOn) throw new RecoveryError("recovery_transfer_before_activation");
      requireExclusiveSources(snapshot, plan, at);
      const destination = await ledger.getProfile(plan.terms.destinationProfileId);
      if (destination?.postingAccountId !== evidence.destinationAccountId) throw new RecoveryError("recovery_destination_mismatch");
      allocations.push(allocate(plan, item.amountMinor, paid, evidence.entry.accountingDate));
    }
    return append(input, at, { kind: "contribution", transferEntryId, contributionDate: evidence.entry.accountingDate,
      allocations, intent, proposalId });
  }
  return {
    saveDraft(input: CommandContext & { planId: string | null; expectedRevision: number | null; terms: PlanTerms }) {
      return command("saveDraft", input, async snapshot => {
        validateTerms(input.terms);
        if (input.planId === null) {
          if (input.expectedRevision !== null) throw new RecoveryError("recovery_draft_revision_conflict");
          return store.insertPlan({ workspaceId: input.workspaceId, revision: 1, terms: input.terms,
            replacesPlanId: null, state: { kind: "Draft" } });
        }
        const plan = findPlan(snapshot, input.planId);
        if (snapshot.events.some(event => event.data.kind === "cancelled" && event.data.planId === plan.id)) throw new RecoveryError("recovery_plan_cancelled");
        if (plan.state.kind !== "Draft") throw new RecoveryError("recovery_schedule_frozen");
        if (input.expectedRevision !== plan.revision) throw new RecoveryError("recovery_draft_revision_conflict");
        await store.updatePlan({ ...plan, revision: plan.revision + 1, terms: input.terms });
        return plan.id;
      });
    },
    activatePlan(input: CommandContext & { planId: string; expectedRevision: number }) {
      return command("activatePlan", input, async (snapshot, at, today) => {
        const plan = findPlan(snapshot, input.planId);
        if (snapshot.events.some(event => event.data.kind === "cancelled" && event.data.planId === plan.id)) throw new RecoveryError("recovery_plan_cancelled");
        if (plan.state.kind !== "Draft") throw new RecoveryError("recovery_schedule_frozen");
        if (plan.revision !== input.expectedRevision) throw new RecoveryError("recovery_draft_revision_conflict");
        const period = await ledger.getAccountingPeriod(input.workspaceId, periodFromAccountingDate(today));
        if (period?.status !== "open") throw new RecoveryError("recovery_activation_period_not_open");
        const destination = await ledger.getProfile(plan.terms.destinationProfileId);
        const account = destination && await ledger.getLedgerAccount(destination.postingAccountId);
        if (!destination || destination.workspaceId !== input.workspaceId || account?.nature !== "Asset") throw new RecoveryError("recovery_destination_ineligible");
        const counted = await countedAllocations(ledger, snapshot, at);
        const paid = [...counted.verified, ...counted.declared];
        const sourceEffectCuts: Record<string, number> = {};
        for (const source of plan.terms.sources) {
          const effects = await ledger.listJournalSourceEffects(input.workspaceId, source.entryId);
          sourceEffectCuts[source.entryId] = effects.reduce((sequence, effect) => Math.max(sequence, effect.sourceSequence), 0);
          const entry = await ledger.getJournalEntry(source.entryId);
          const eligible = await sourceExpense(ledger, input.workspaceId, source.entryId, at);
          const decision = snapshot.events.filter(event => event.data.kind === "candidateDecision" && event.data.entryId === source.entryId).at(-1);
          if (!entry || entry.accountingDate > today || (decision?.data.kind === "candidateDecision" && decision.data.decision !== "eligible") ||
            source.principalMinor > eligible - sourcePaid(source.entryId, paid)) throw new RecoveryError("recovery_source_ineligible");
          for (const other of snapshot.plans) {
            if (other.id === plan.id || !other.terms.sources.some(item => item.entryId === source.entryId)) continue;
            if (ownsSourceReservation(snapshot, other, at)) throw new RecoveryError("recovery_source_reserved");
          }
        }
        const commitment = { ...freezeSchedule(plan.terms, today, at), sourceEffectCuts };
        await store.updatePlan({ ...plan, revision: plan.revision + 1, state: { kind: "Activated", commitment } });
        return plan.id;
      });
    },
    cancelPlan(input: CommandContext & { planId: string; reason: string }) {
      return command("cancelPlan", input, async (snapshot, at) => {
        const plan = findPlan(snapshot, input.planId);
        if (snapshot.events.some(event => event.data.kind === "cancelled" && event.data.planId === plan.id)) throw new RecoveryError("recovery_plan_cancelled");
        return append(input, at, { kind: "cancelled", planId: plan.id, reason: text(input.reason) });
      });
    },
    replacePlan(input: CommandContext & { planId: string; terms: PlanTerms; reason: string }) {
      return command("replacePlan", input, async (snapshot, at) => {
        const plan = findPlan(snapshot, input.planId);
        if (plan.state.kind !== "Activated") throw new RecoveryError("recovery_plan_inactive");
        validateTerms(input.terms);
        text(input.reason);
        if (!snapshot.events.some(event => event.data.kind === "cancelled" && event.data.planId === plan.id))
          await append(input, at, { kind: "cancelled", planId: plan.id, reason: input.reason });
        return store.insertPlan({ workspaceId: input.workspaceId, revision: 1, terms: input.terms,
          replacesPlanId: plan.id, state: { kind: "Draft" } });
      });
    },
    reconcilePlans(input: CommandContext) {
      return command("reconcilePlans", input, async (snapshot, at) => {
        const counted = await countedAllocations(ledger, snapshot, at);
        for (const plan of snapshot.plans) {
          const status = await planStatus(ledger, snapshot, plan, [...counted.verified, ...counted.declared], at);
          if (status.kind === "Suspended" && !snapshot.events.some(event => event.data.kind === "suspended" && event.data.planId === plan.id))
            await append(input, at, { kind: "suspended", planId: plan.id, entryIds: status.unsupportedEntryIds });
        }
        return input.workspaceId;
      });
    },
    decideCandidate(input: CommandContext & { entryId: string; decision: "eligible" | "deferred" | "excluded" }) {
      return command("decideCandidate", input, async (snapshot, at) => {
        if (!(await sourceExpense(ledger, input.workspaceId, input.entryId, at))) throw new RecoveryError("recovery_source_ineligible");
        if (snapshot.plans.some(plan => ownsSourceReservation(snapshot, plan, at) &&
          plan.terms.sources.some(source => source.entryId === input.entryId))) throw new RecoveryError("recovery_source_reserved");
        return append(input, at, { kind: "candidateDecision", entryId: input.entryId, decision: input.decision });
      });
    },
    recordContribution(input: CommandContext & { transferEntryId: string; allocations: AllocationIntent[] }) {
      return command("recordContribution", input, (snapshot, at, today) => contribution(input, snapshot, at, today,
        input.transferEntryId, input.allocations, "explicit", null));
    },
    reverseContribution(input: CommandContext & { contributionId: string; reason: string }) {
      return command("reverseContribution", input, async (snapshot, at) => {
        const original = snapshot.events.find(event => event.id === input.contributionId && event.data.kind === "contribution");
        if (!original) throw new RecoveryError("recovery_contribution_not_found");
        if (snapshot.events.some(event => event.data.kind === "contributionReversal" && event.data.contributionId === input.contributionId))
          throw new RecoveryError("recovery_contribution_already_reversed");
        return append(input, at, { kind: "contributionReversal", contributionId: input.contributionId, reason: text(input.reason) });
      });
    },
    proposeAllocation(input: CommandContext & { transferEntryId: string; allocations: AllocationIntent[]; importReference: string }) {
      return command("proposeAllocation", input, async (snapshot, at, today) => {
        await transferEvidence(ledger, input.workspaceId, input.transferEntryId, today);
        if (!input.allocations.length || new Set(input.allocations.map(item => item.planId)).size !== input.allocations.length) throw new RecoveryError("recovery_allocations_invalid");
        input.allocations.forEach(item => { findPlan(snapshot, item.planId); minor(item.amountMinor, true); });
        return append(input, at, { kind: "proposal", transferEntryId: input.transferEntryId, allocations: input.allocations,
          importReference: text(input.importReference) });
      });
    },
    decideProposal(input: CommandContext & { proposalId: string; decision: "accepted" | "rejected" }) {
      return command("decideProposal", input, async (snapshot, at, today) => {
        const proposal = snapshot.events.find(event => event.id === input.proposalId);
        if (proposal?.data.kind !== "proposal") throw new RecoveryError("recovery_proposal_not_found");
        if (snapshot.events.some(event => event.data.kind === "proposalDecision" && event.data.proposalId === input.proposalId))
          throw new RecoveryError("recovery_proposal_already_decided");
        const contributionId = input.decision === "accepted" ? await contribution(input, snapshot, at, today,
          proposal.data.transferEntryId, proposal.data.allocations, "acceptedProposal", proposal.id) : null;
        return append(input, at, { kind: "proposalDecision", proposalId: proposal.id, decision: input.decision, contributionId });
      });
    },
    declareOpeningProgress(input: CommandContext & { planId: string; amountMinor: number; throughDate: string; provenance: string; evidenceUnavailable: true }) {
      return command("declareOpeningProgress", input, async (snapshot, at, today) => {
        const plan = findPlan(snapshot, input.planId);
        if (plan.state.kind !== "Activated") throw new RecoveryError("recovery_plan_inactive");
        validDate(input.throughDate);
        if (input.throughDate >= plan.state.commitment.activatedOn) throw new RecoveryError("recovery_opening_date_invalid");
        if (snapshot.events.some(event => (event.data.kind === "openingProgress" && event.data.planId === plan.id) ||
          (event.data.kind === "contribution" && event.data.allocations.some(item => item.planId === plan.id)))) throw new RecoveryError("recovery_opening_already_established");
        const counted = await countedAllocations(ledger, snapshot, at);
        if ((await planStatus(ledger, snapshot, plan, [...counted.verified, ...counted.declared], at)).kind !== "Active") throw new RecoveryError("recovery_plan_inactive");
        const destination = await ledger.getProfile(plan.terms.destinationProfileId);
        const transfers = await ledger.listAccountTransferEntriesInRange(input.workspaceId, plan.state.commitment.activatedOn, today);
        for (const transfer of transfers) {
          if (await ledger.findReversalOf(transfer.id)) continue;
          const outgoing = transfer.lines.find(line => line.creditMinorUnits > 0);
          const incoming = transfer.lines.find(line => line.debitMinorUnits > 0);
          if (!outgoing || !incoming || incoming.ledgerAccountId !== destination?.postingAccountId) continue;
          const sourceAccount = await ledger.getLedgerAccount(outgoing.ledgerAccountId);
          const destinationAccount = await ledger.getLedgerAccount(incoming.ledgerAccountId);
          if (sourceAccount?.nature === "Asset" && destinationAccount?.nature === "Asset") throw new RecoveryError("recovery_opening_evidence_available");
        }
        const allocation = allocate(plan, input.amountMinor, [], input.throughDate);
        return append(input, at, { kind: "openingProgress", planId: plan.id, throughDate: input.throughDate,
          provenance: text(input.provenance), evidenceUnavailable: input.evidenceUnavailable, allocation });
      });
    },
  };
}
