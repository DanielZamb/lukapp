import { z } from "zod";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";

const routingId = z.string().min(1).max(200);
export const intentId = routingId.transform(value => value as Id<"clerkRecoveryIntents">);
export const workId = routingId.transform(value => value as Id<"clerkProviderWork">);
export const targetId = routingId.transform(value => value as Id<"mobileDevices">);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
const providerError = z.enum(["provider_configuration_required", "provider_instance_mismatch", "provider_unavailable", "provider_provenance_mismatch",
  "provider_session_invalid", "provider_session_terminal", "recovery_fresh_sign_in_required", "recovery_intent_expired", "recovery_conflict"]);
const providerState = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("pending"), nextAttemptAt: z.number().finite(), error: providerError.optional() }),
  z.strictObject({ kind: z.literal("succeeded"), at: z.number().finite() })]);
export const recoveryRecord = z.strictObject({ version: z.literal(2), revision,
  intent: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("none") }), z.strictObject({ kind: z.literal("retrieve") }),
    z.strictObject({ kind: z.literal("exact"), intentId })]),
  cleanup: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("none") }), z.strictObject({ kind: z.literal("work"), workId })]) });
export type RecoveryRecord = z.infer<typeof recoveryRecord>;
export const revocationRecord = z.strictObject({ version: z.literal(1), revision, deviceId: targetId,
  outcome: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("response-unknown") }),
    z.strictObject({ kind: z.literal("observed"), workId, result: providerState })]) });
export type RevocationRecord = z.infer<typeof revocationRecord>;
export type RevocationView = { record: RevocationRecord; refreshed: boolean };
export type ProviderObservation = { kind: "loading" } | { kind: "signed-out" } | { kind: "signed-in"; sessionId: string };
export type ProviderWork = FunctionReturnType<typeof api.providerWork.status>;
