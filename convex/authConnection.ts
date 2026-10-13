import { v } from "convex/values";
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
    if (identity.subject !== process.env.LUKAPP_OWNER_CLERK_SUBJECT) {
      return { status: "not-owner" } as const;
    }
    return { status: "owner", clerkSubject: identity.subject } as const;
  },
});
