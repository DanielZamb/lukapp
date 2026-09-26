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
    productKind: v.literal("checking"),
    postingAccountId: v.id("ledgerAccounts"),
  }).index("by_workspace", ["workspaceId"]),
  postedJournalEntries: defineTable({
    workspaceId: v.id("workspaces"),
    accountingDate: v.string(),
    description: v.string(),
    currency: v.string(),
    minorUnits: v.number(),
  }).index("by_workspace", ["workspaceId"]),
  journalLines: defineTable({
    workspaceId: v.id("workspaces"),
    journalEntryId: v.id("postedJournalEntries"),
    ledgerAccountId: v.id("ledgerAccounts"),
    debitMinorUnits: v.number(),
    creditMinorUnits: v.number(),
  }).index("by_workspace", ["workspaceId"]),
  accountingPeriods: defineTable({
    workspaceId: v.id("workspaces"),
    year: v.number(),
    month: v.number(),
  }).index("by_workspace_year_month", ["workspaceId", "year", "month"]),
});
