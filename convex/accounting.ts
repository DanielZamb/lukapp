import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { createAccountingCore } from "../src/accounting/accounting";
import { convexStore } from "./store";

const money = v.object({
  currency: v.string(),
  minorUnits: v.number(),
});

export const createPersonalWorkspace = mutation({
  args: {
    userId: v.string(),
    functionalCurrency: v.string(),
  },
  handler: async (ctx, args) => {
    return createAccountingCore(convexStore(ctx.db)).createPersonalWorkspace({
      actor: { userId: args.userId },
      functionalCurrency: args.functionalCurrency,
    });
  },
});

export const openWorkspace = query({
  args: {
    userId: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    return createAccountingCore(convexStore(ctx.db)).openWorkspace({
      actor: { userId: args.userId },
      workspaceId: args.workspaceId,
    });
  },
});

export const createFinancialAccountProfile = mutation({
  args: {
    userId: v.string(),
    workspaceId: v.string(),
    name: v.string(),
    productKind: v.literal("checking"),
  },
  handler: async (ctx, args) => {
    return createAccountingCore(convexStore(ctx.db)).createFinancialAccountProfile({
      actor: { userId: args.userId },
      workspaceId: args.workspaceId,
      name: args.name,
      productKind: args.productKind,
    });
  },
});

export const recordCashExpense = mutation({
  args: {
    userId: v.string(),
    workspaceId: v.string(),
    financialAccountProfileId: v.string(),
    amount: money,
    accountingDate: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    return createAccountingCore(convexStore(ctx.db)).recordCashExpense({
      actor: { userId: args.userId },
      workspaceId: args.workspaceId,
      financialAccountProfileId: args.financialAccountProfileId,
      amount: args.amount,
      accountingDate: args.accountingDate,
      description: args.description,
    });
  },
});

export const listPostedActivity = query({
  args: {
    userId: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    return createAccountingCore(convexStore(ctx.db)).listPostedActivity({
      actor: { userId: args.userId },
      workspaceId: args.workspaceId,
    });
  },
});

export const balances = query({
  args: {
    userId: v.string(),
    workspaceId: v.string(),
  },
  handler: async (ctx, args) => {
    return createAccountingCore(convexStore(ctx.db)).balances({
      actor: { userId: args.userId },
      workspaceId: args.workspaceId,
    });
  },
});
