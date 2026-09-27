import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    kind: v.literal("Personal"),
    functionalCurrency: v.string(),
    expenseAccountId: v.optional(v.id("ledgerAccounts")),
  }),
  workspaceMemberships: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.literal("Owner"),
  }).index("by_workspace_user", ["workspaceId", "userId"]),
  ledgerAccounts: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
  }).index("by_workspace", ["workspaceId"]),
  financialAccountProfiles: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    postingAccountId: v.id("ledgerAccounts"),
  }).index("by_workspace", ["workspaceId"]),
  postedJournalEntries: defineTable({
    workspaceId: v.id("workspaces"),
    financialAccountProfileId: v.id("financialAccountProfiles"),
    accountingDate: v.string(),
    description: v.string(),
    periodYear: v.number(),
    periodMonth: v.number(),
    idempotencyKey: v.string(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_idempotency", ["workspaceId", "idempotencyKey"]),
  journalLines: defineTable({
    workspaceId: v.id("workspaces"),
    journalEntryId: v.id("postedJournalEntries"),
    ledgerAccountId: v.id("ledgerAccounts"),
    debitMinorUnits: v.number(),
    creditMinorUnits: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_entry", ["journalEntryId"]),
  accountingPeriods: defineTable({
    workspaceId: v.id("workspaces"),
    year: v.number(),
    month: v.number(),
    status: v.union(v.literal("open"), v.literal("locked")),
  }).index("by_workspace_year_month", ["workspaceId", "year", "month"]),
});
