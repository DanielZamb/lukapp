import { v } from "convex/values";
import { ownerAdmission } from "./lib/owner";
import { query } from "./_generated/server";

export const connection = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal("signed-out") }),
    v.object({ status: v.literal("not-owner") }),
    v.object({ status: v.literal("owner"), clerkSubject: v.string() }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { status: "signed-out" } as const;
    if (ownerAdmission(identity)) {
      return { status: "not-owner" } as const;
    }
    return { status: "owner", clerkSubject: identity.subject } as const;
  },
});

export const developmentReadiness = query({
  args: {},
  returns: v.object({
    ownerAdmitted: v.boolean(), sidPresent: v.boolean(), sidValid: v.boolean(), activeStatusClaim: v.boolean(),
    convexAudience: v.boolean(), backendConfigured: v.boolean(), webhookConfigured: v.boolean(),
    nativeApi: v.literal("unobserved"), clerkLifetimeSettings: v.literal("unobserved"),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return {
      ownerAdmitted: ownerAdmission(identity) === null,
      sidPresent: identity?.sid !== undefined,
      sidValid: typeof identity?.sid === "string" && /^sess_[a-zA-Z0-9]{1,120}$/.test(identity.sid),
      activeStatusClaim: identity?.sts === "active", convexAudience: identity?.aud === "convex",
      backendConfigured: Boolean(process.env.CLERK_SECRET_KEY),
      webhookConfigured: Boolean(process.env.CLERK_WEBHOOK_SIGNING_SECRET && process.env.CLERK_INSTANCE_ID),
      nativeApi: "unobserved", clerkLifetimeSettings: "unobserved",
    } as const;
  },
});
