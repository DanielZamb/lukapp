import { v } from "convex/values";

export const mobilePlatform = v.union(v.literal("ios"), v.literal("android"));
export const workspacePermission = v.union(
  v.literal("workspace:read"),
  v.literal("workspace:admin"),
  v.literal("accounting:post"),
  v.literal("accounting:correct"),
  v.literal("period:lock"),
  v.literal("category:manage"),
);

export const liveSession = v.object({
  userId: v.string(),
  clerkSessionId: v.string(),
  clerkClientId: v.string(),
  verifiedAt: v.number(),
  expiresAt: v.number(),
  abandonsAt: v.number(),
});
