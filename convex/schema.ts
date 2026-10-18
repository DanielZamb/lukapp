import { categoryFields } from "./categoryValidators";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { mobilePlatform } from "./lib/securityValues";
import { revisionFields } from "./budgetValues";
import {
  accountNature,
  normalSide,
  periodStatus,
  postingPolicy,
  productKind,
} from "./validators";

export default defineSchema({
  financialAccountSetups: defineTable({
    workspaceId: v.id("workspaces"),
    idempotencyKey: v.string(),
    name: v.string(),
    productKind,
    emoji: v.optional(v.string()),
    amount: v.object({ currency: v.string(), minorUnits: v.number() }),
    accountingDate: v.string(),
    financialAccountProfileId: v.id("financialAccountProfiles"),
    openingJournalEntryId: v.optional(v.id("journalEntries")),
  }).index("by_workspace_idempotency", ["workspaceId", "idempotencyKey"]),
  financialAccountOpenings: defineTable({
    workspaceId: v.id("workspaces"),
    financialAccountProfileId: v.id("financialAccountProfiles"),
    accountingDate: v.string(),
    idempotencyKey: v.string(),
    amount: v.object({ currency: v.string(), minorUnits: v.number() }),
    description: v.string(),
    policy: postingPolicy,
    journalEntryId: v.optional(v.id("journalEntries")),
  })
    .index("by_workspace_idempotency", ["workspaceId", "idempotencyKey"])
    .index("by_workspace_profile", ["workspaceId", "financialAccountProfileId"]),
  journalEntryProfiles: defineTable({
    workspaceId: v.id("workspaces"),
    journalEntryId: v.id("journalEntries"),
    financialAccountProfileId: v.id("financialAccountProfiles"),
    accountingDate: v.string(),
    postedAt: v.number(),
    reversesEntryId: v.optional(v.id("journalEntries")),
  })
    .index("by_workspace_profile_date", [
      "workspaceId",
      "financialAccountProfileId",
      "accountingDate",
      "postedAt",
    ])
    .index("by_entry", ["journalEntryId"]),
  budgetLimitRevisions: defineTable(revisionFields)
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_request", ["workspaceId", "idempotencyKey"]),
  savingsRecoveryPlans: defineTable({
    workspaceId: v.id("workspaces"),
    sourceJournalEntryId: v.id("journalEntries"),
    destinationFinancialAccountProfileId: v.id("financialAccountProfiles"),
    title: v.string(),
    principalMinorUnits: v.number(),
    installmentCount: v.number(),
    installmentMinorUnits: v.number(),
    impliedAnnualRateBps: v.number(),
    currency: v.string(),
    activationMonth: v.string(),
    idempotencyKey: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_request", ["workspaceId", "idempotencyKey"])
    .index("by_workspace_source", ["workspaceId", "sourceJournalEntryId"]),
  savingsRecoveryContributions: defineTable({
    workspaceId: v.id("workspaces"),
    planId: v.id("savingsRecoveryPlans"),
    transferJournalEntryId: v.id("journalEntries"),
    amountMinorUnits: v.number(),
    contributionDate: v.string(),
    idempotencyKey: v.string(),
    createdBy: v.string(),
    recordedAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_request", ["workspaceId", "idempotencyKey"])
    .index("by_transfer", ["transferJournalEntryId"]),
  userCategories: defineTable({
    workspaceId: v.id("workspaces"),
    ...categoryFields,
  }).index("by_workspace", ["workspaceId"]),
  mobileDevices: defineTable({
    clerkUserId: v.string(),
    clerkSessionId: v.string(),
    clerkClientId: v.string(),
    installId: v.string(),
    label: v.string(),
    platform: mobilePlatform,
    appVersion: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()),
  }).index("by_session", ["clerkSessionId"])
    .index("by_user", ["clerkUserId"]),
  clerkRevocations: defineTable({
    clerkUserId: v.string(),
    clerkSessionId: v.string(),
    requestedAt: v.number(),
    attempts: v.number(),
    completedAt: v.optional(v.number()),
    reason: v.optional(v.literal("superseded")),
  }).index("by_session", ["clerkSessionId"]),
  personalDefaults: defineTable({
    ownerSubject: v.string(),
    workspaceId: v.id("workspaces"),
    financialAccountProfileId: v.id("financialAccountProfiles"),
    startingMinorUnits: v.number(),
    categorySetupSignature: v.optional(v.string()),
  }).index("by_owner", ["ownerSubject"]),
  workspaces: defineTable({
    kind: v.literal("Personal"),
    functionalCurrency: v.string(),
    chartOfAccountsTemplate: v.string(),
    timeZone: v.optional(v.string()),
  }),
  workspaceMemberships: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.literal("Owner"),
  }).index("by_workspace_user", ["workspaceId", "userId"]),
  ledgerAccounts: defineTable({
    workspaceId: v.id("workspaces"),
    code: v.string(),
    name: v.string(),
    nature: accountNature,
    normalSide,
    role: v.literal("Posting"),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_code", ["workspaceId", "code"]),
  financialAccountProfiles: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    productKind,
    emoji: v.optional(v.string()),
    classificationPolicy: v.string(),
    postingAccountId: v.id("ledgerAccounts"),
  }).index("by_workspace", ["workspaceId"]),
  journalEntries: defineTable({
    workspaceId: v.id("workspaces"),
    accountingDate: v.string(),
    periodYear: v.number(),
    periodMonth: v.number(),
    description: v.string(),
    idempotencyKey: v.string(),
    policy: postingPolicy,
    financialAccountProfileId: v.optional(v.id("financialAccountProfiles")),
    reversesEntryId: v.optional(v.id("journalEntries")),
    postedBy: v.string(),
    postedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "accountingDate", "postedAt"])
    .index("by_workspace_profile_date", ["workspaceId", "financialAccountProfileId", "accountingDate", "postedAt"])
    .index("by_workspace_idempotency", ["workspaceId", "idempotencyKey"])
    .index("by_reverses", ["reversesEntryId"]),
  journalLines: defineTable({
    workspaceId: v.id("workspaces"),
    journalEntryId: v.id("journalEntries"),
    lineNumber: v.number(),
    userCategoryId: v.optional(v.id("userCategories")),
    userCategoryIds: v.optional(v.array(v.id("userCategories"))),
    primaryUserCategoryId: v.optional(v.id("userCategories")),
    ledgerAccountId: v.id("ledgerAccounts"),
    debitMinorUnits: v.number(),
    creditMinorUnits: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_entry", ["journalEntryId", "lineNumber"]),
  accountingPeriods: defineTable({
    workspaceId: v.id("workspaces"),
    year: v.number(),
    month: v.number(),
    status: periodStatus,
  }).index("by_workspace_year_month", ["workspaceId", "year", "month"]),
  periodControlDecisions: defineTable({
    workspaceId: v.id("workspaces"),
    year: v.number(),
    month: v.number(),
    action: v.literal("Lock"),
    decidedBy: v.string(),
    decidedAt: v.number(),
    reason: v.optional(v.string()),
  }).index("by_workspace_year_month", ["workspaceId", "year", "month"]),
  notificationIntakeReceipts: defineTable({
    workspaceId: v.id("workspaces"),
    journalEntryId: v.id("journalEntries"),
    idempotencyKey: v.string(),
    suggestion: v.object({
      direction: v.union(v.literal("in"), v.literal("out")),
      description: v.string(),
      amount: v.object({ currency: v.string(), minorUnits: v.number() }),
      accountingDate: v.string(),
      financialAccountProfileId: v.string(),
      userCategoryIds: v.array(v.string()),
      primaryUserCategoryId: v.union(v.string(), v.null()),
    }),
    changedFields: v.array(v.string()),
    parserVersion: v.string(),
    consentVersion: v.string(),
    actorId: v.string(),
    confirmedAt: v.number(),
  })
    .index("by_workspace_request", ["workspaceId", "idempotencyKey"])
    .index("by_entry", ["journalEntryId"]),
});
