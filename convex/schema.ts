import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  accountNature,
  normalSide,
  periodStatus,
  postingPolicy,
  productKind,
  storedOpening,
} from "./validators";

export default defineSchema({
  personalWorkspaceOwners: defineTable({
    tokenIdentifier: v.string(),
    issuer: v.string(),
    subject: v.string(),
    workspaceId: v.id("workspaces"),
  }).index("by_identity", ["tokenIdentifier"]),
  householdWorkspaceCreations: defineTable({
    ownerUserId: v.string(),
    idempotencyKey: v.string(),
    workspaceId: v.id("workspaces"),
  }).index("by_owner_key", ["ownerUserId", "idempotencyKey"]),
  workspaces: defineTable({
    kind: v.union(v.literal("Personal"), v.literal("Household")),
    functionalCurrency: v.string(),
    chartOfAccountsTemplate: v.string(),
  }),
  workspaceMemberships: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.union(
      v.literal("Owner"),
      v.literal("Accountant"),
      v.literal("Preparer"),
      v.literal("Viewer"),
    ),
  })
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_user_role", ["userId", "role"]),
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
    classificationPolicy: v.string(),
    postingAccountId: v.id("ledgerAccounts"),
    setupIdempotencyKey: v.optional(v.string()),
    opening: v.optional(storedOpening),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_setup", ["workspaceId", "setupIdempotencyKey"]),
  openingPositions: defineTable({
    workspaceId: v.id("workspaces"),
    financialAccountProfileId: v.id("financialAccountProfiles"),
    description: v.string(),
    replacesOpeningKey: v.optional(v.string()),
    idempotencyKey: v.string(),
    opening: storedOpening,
  }).index("by_workspace_idempotency", ["workspaceId", "idempotencyKey"]),
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
    .index("by_workspace_idempotency", ["workspaceId", "idempotencyKey"])
    .index("by_reverses", ["reversesEntryId"]),
  journalLines: defineTable({
    workspaceId: v.id("workspaces"),
    journalEntryId: v.id("journalEntries"),
    lineNumber: v.number(),
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
});
