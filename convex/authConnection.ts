import { v } from "convex/values";
import { query } from "./_generated/server";
import { ownerConnection } from "./lib/admission";

export const connection = query({
  args: {},
  returns: v.union(
    v.object({ status: v.literal("signed-out") }),
    v.object({ status: v.literal("not-owner") }),
    v.object({ status: v.literal("owner"), clerkSubject: v.string() }),
  ),
  handler: async (ctx) => ownerConnection(ctx.auth),
});
