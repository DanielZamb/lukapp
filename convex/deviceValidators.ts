import { v } from "convex/values";
import { accessDenials, accessPolicy, operations } from "../src/access/protocol";

export const devicePlatform = v.union(v.literal("ios"), v.literal("android"));
export const deviceState = v.union(
  v.object({ kind: v.literal("active") }),
  v.object({ kind: v.literal("revoked"), at: v.number(), reason: v.union(v.literal("owner"), v.literal("recovery"), v.literal("provider")) }),
);
export const accessOperation = v.union(...operations.map((operation) => v.literal(operation)));
export const deviceProof = v.object({ challengeId: v.id("deviceChallenges"), signature: v.string() });
export const deviceSummary = v.object({
  id: v.id("mobileDevices"), name: v.string(), platform: devicePlatform,
  createdAt: v.number(), lastSeenAt: v.number(), state: deviceState,
});

export const contactDirective = v.union(v.literal("register-device"), v.literal("wipe-local-input-and-sign-out"), v.literal("unlock-online"));
export const deviceStatus = v.union(
  v.object({ kind: v.literal("denied"), code: v.union(...accessDenials.map((code) => v.literal(code))), directive: contactDirective }),
  v.object({ kind: v.literal("registered"), device: deviceSummary, policy: v.object({
    version: v.literal(accessPolicy.version), challengeLifetimeMs: v.number(), inactivityLifetimeMs: v.number(),
    maximumLifetimeMs: v.number(), localInputLifetimeMs: v.number(), ordinaryLockMs: v.number(), monthCloseLockMs: v.number(),
  }) }),
);
export const preparedChallenge = v.object({ challengeId: v.id("deviceChallenges"), expiresAt: v.number(), message: v.string() });
