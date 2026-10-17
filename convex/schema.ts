import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  accountNature,
  normalSide,
  periodStatus,
  postingPolicy,
  productKind,
} from "./validators";

export default defineSchema({
  workspaces: defineTable({
    kind: v.literal("Personal"),
    functionalCurrency: v.string(),
    chartOfAccountsTemplate: v.string(),
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
