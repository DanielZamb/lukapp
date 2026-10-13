import { ConvexError, v } from "convex/values";
import { AccountingError } from "../src/accounting/errors";
import { RecoveryError } from "../src/savingsRecovery/amounts";
import { createRecoveryCommands } from "../src/savingsRecovery/commands";
import { createRecoveryQueries } from "../src/savingsRecovery/queries";
import { ownerMutation, ownerQuery } from "./lib/owner";
import { recoveryLedger, recoveryStore, recoveryReadStore } from "./recoveryStore";
import { allocationIntent, candidateDecision, candidatesResult, cashInput, planTerms, progressResult, proposalDecision, waterfallResult } from "./recoveryValidators";

const workspace = { workspaceId: v.string() };
const command = { ...workspace, idempotencyKey: v.string() };
async function run<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof RecoveryError || error instanceof AccountingError) throw new ConvexError({ code: error.code });
    throw error;
  }
}

export const saveDraft = ownerMutation({
  operation: "savingsRecovery.saveDraft",
  args: { ...command, planId: v.union(v.string(), v.null()), expectedRevision: v.union(v.number(), v.null()), terms: planTerms },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .saveDraft({ ...args, actor: ctx.actor })),
});

export const activatePlan = ownerMutation({
  operation: "savingsRecovery.activatePlan",
  args: { ...command, planId: v.string(), expectedRevision: v.number() },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .activatePlan({ ...args, actor: ctx.actor })),
});

export const cancelPlan = ownerMutation({
  operation: "savingsRecovery.cancelPlan",
  args: { ...command, planId: v.string(), reason: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .cancelPlan({ ...args, actor: ctx.actor })),
});

export const replacePlan = ownerMutation({
  operation: "savingsRecovery.replacePlan",
  args: { ...command, planId: v.string(), terms: planTerms, reason: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .replacePlan({ ...args, actor: ctx.actor })),
});

export const reconcilePlans = ownerMutation({
  operation: "savingsRecovery.reconcilePlans",
  args: { ...command },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .reconcilePlans({ ...args, actor: ctx.actor })),
});

export const decideCandidate = ownerMutation({
  operation: "savingsRecovery.decideCandidate",
  args: { ...command, entryId: v.string(), decision: candidateDecision },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .decideCandidate({ ...args, actor: ctx.actor })),
});

export const recordContribution = ownerMutation({
  operation: "savingsRecovery.recordContribution",
  args: { ...command, transferEntryId: v.string(), allocations: v.array(allocationIntent) },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .recordContribution({ ...args, actor: ctx.actor })),
});

export const reverseContribution = ownerMutation({
  operation: "savingsRecovery.reverseContribution",
  args: { ...command, contributionId: v.string(), reason: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .reverseContribution({ ...args, actor: ctx.actor })),
});

export const proposeAllocation = ownerMutation({
  operation: "savingsRecovery.proposeAllocation",
  args: { ...command, transferEntryId: v.string(), allocations: v.array(allocationIntent), importReference: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .proposeAllocation({ ...args, actor: ctx.actor })),
});

export const decideProposal = ownerMutation({
  operation: "savingsRecovery.decideProposal",
  args: { ...command, proposalId: v.string(), decision: proposalDecision },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .decideProposal({ ...args, actor: ctx.actor })),
});

export const declareOpeningProgress = ownerMutation({
  operation: "savingsRecovery.declareOpeningProgress",
  args: { ...command, planId: v.string(), amountMinor: v.number(), throughDate: v.string(), provenance: v.string(), evidenceUnavailable: v.literal(true) },
  returns: v.string(),
  handler: async (ctx, args) => run(() => createRecoveryCommands(recoveryStore(ctx.db), recoveryLedger(ctx.db))
    .declareOpeningProgress({ ...args, actor: ctx.actor })),
});

export const listCandidates = ownerQuery({
  operation: "savingsRecovery.listCandidates",
  args: { ...workspace, from: v.string(), through: v.string() },
  returns: candidatesResult,
  handler: async (ctx, args) => run(() => createRecoveryQueries(recoveryReadStore(ctx.db), recoveryLedger(ctx.db))
    .listCandidates({ ...args, actor: ctx.actor })),
});

export const progress = ownerQuery({
  operation: "savingsRecovery.progress",
  args: { ...workspace, asKnownAt: v.optional(v.number()) },
  returns: progressResult,
  handler: async (ctx, args) => run(() => createRecoveryQueries(recoveryReadStore(ctx.db), recoveryLedger(ctx.db))
    .progress({ ...args, actor: ctx.actor })),
});

export const monthlyWaterfall = ownerQuery({
  operation: "savingsRecovery.monthlyWaterfall",
  args: { ...workspace, month: v.string(), cash: cashInput, includePrepayment: v.boolean() },
  returns: waterfallResult,
  handler: async (ctx, args) => run(() => createRecoveryQueries(recoveryReadStore(ctx.db), recoveryLedger(ctx.db))
    .monthlyWaterfall({ ...args, actor: ctx.actor })),
});
