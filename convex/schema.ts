import { providerActor, providerState, providerTarget } from "./providerValidators";
import { categoryFields, userCategory, categorySnapshot, categoryCorrection } from "./categoryAnnotationValidators";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { accessOperation, devicePlatform, deviceState } from "./deviceValidators";
import {
  accountNature,
  normalSide,
  periodStatus,
  postingPolicy,
  productKind,
  profileClassificationAnswers,
  storedOpening,
  cashCategoryInput,
} from "./validators";

export default defineSchema({
  clerkProviderWork: defineTable({
    ...providerActor, target: providerTarget, state: providerState, attempts: v.number(),
  }).index("by_identity", ["tokenIdentifier"]),
  clerkRecoveryIntents: defineTable({
    ...providerActor, initiatingSid: v.string(), createdAt: v.number(), expiresAt: v.number(),
    workId: v.optional(v.id("clerkProviderWork")),
  }).index("by_identity", ["tokenIdentifier"]),
  clerkWebhookDeliveries: defineTable({
    ...providerActor, sid: v.string(), eventId: v.string(), eventType: v.string(), timestamp: v.number(),
  }).index("by_event", ["eventId"]),
  mobileDevices: defineTable({
    tokenIdentifier: v.string(), sid: v.string(), publicKey: v.string(),
    name: v.string(), platform: devicePlatform,
    createdAt: v.number(), lastSeenAt: v.number(), state: deviceState,
  }).index("by_identity_sid", ["tokenIdentifier", "sid"])
    .index("by_identity_platform", ["tokenIdentifier", "platform"])
    .index("by_identity_key", ["tokenIdentifier", "publicKey"])
    .index("by_identity", ["tokenIdentifier"]),
  deviceChallenges: defineTable({
    tokenIdentifier: v.string(), sid: v.string(), operation: accessOperation,
    deviceId: v.optional(v.id("mobileDevices")), publicKey: v.string(), payloadHash: v.string(),
    nonce: v.string(), expiresAt: v.number(), consumedAt: v.optional(v.number()),
  }).index("by_identity_sid", ["tokenIdentifier", "sid"]),
  deviceSessionDenials: defineTable({ tokenIdentifier: v.string(), sid: v.string(), at: v.number() })
    .index("by_identity_sid", ["tokenIdentifier", "sid"]),
  deviceRecoveryBarriers: defineTable({ tokenIdentifier: v.string() }).index("by_identity", ["tokenIdentifier"]),
  deviceRegistrationApprovals: defineTable({ tokenIdentifier: v.string(), sid: v.string() })
    .index("by_identity_sid", ["tokenIdentifier", "sid"]),
  deviceRecoveryEvents: defineTable({ tokenIdentifier: v.string(), eventId: v.string(), recoveredSid: v.string() })
    .index("by_identity_event", ["tokenIdentifier", "eventId"]),
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
  userCategories: defineTable(categoryFields).index("by_workspace", ["workspaceId"]),
  categoryReceipts: defineTable({ workspaceId: v.string(), idempotencyKey: v.string(), request: v.string(), category: userCategory,
    correctionEntryIds: v.array(v.string()), financialAccountProfileId: v.optional(v.string()) }).index("by_workspace_key", ["workspaceId", "idempotencyKey"]),
  financialAccountProfiles: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    productKind,
    classificationPolicy: v.string(),
    classificationAnswers: v.optional(profileClassificationAnswers),
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
  journalSourceEffects: defineTable({
    workspaceId: v.id("workspaces"), sourceEntryId: v.id("journalEntries"), journalEntryId: v.id("journalEntries"), expenseDeltaMinorUnits: v.number(), sourceSequence: v.number(),
  }).index("by_workspace_source", ["workspaceId", "sourceEntryId"]),
  journalEntries: defineTable({
    cashCategoryInput: v.optional(cashCategoryInput),
    workspaceId: v.id("workspaces"),
    accountingDate: v.string(),
    periodYear: v.number(),
    periodMonth: v.number(),
    description: v.string(),
    idempotencyKey: v.string(),
    policy: postingPolicy,
    sourceExpenseEffects: v.optional(v.array(v.object({ sourceEntryId: v.string(), expenseDeltaMinorUnits: v.number() }))),
    financialAccountProfileId: v.optional(v.id("financialAccountProfiles")),
    reversesEntryId: v.optional(v.id("journalEntries")),
    postedBy: v.string(),
    postedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_idempotency", ["workspaceId", "idempotencyKey"])
    .index("by_reverses", ["reversesEntryId"]),
  journalLines: defineTable({
    category: v.optional(categorySnapshot),
    categoryCorrection: v.optional(categoryCorrection),
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
