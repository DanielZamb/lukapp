import { createClerkClient } from "@clerk/backend";
import { verifyWebhook } from "@clerk/backend/webhooks";
import { ConvexError } from "convex/values";
import type { Infer } from "convex/values";
import type { providerError } from "../providerValidators";

export type ProviderError = Infer<typeof providerError>;
export function providerFailure(code: ProviderError): never {
  throw new ConvexError({ code });
}
export function sanitizedProviderError(error: unknown): ProviderError {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null && "code" in error.data) {
    const code = error.data.code;
    switch (code) {
      case "provider_configuration_required": case "provider_instance_mismatch": case "provider_provenance_mismatch":
      case "provider_session_invalid": case "provider_session_terminal":
      case "recovery_fresh_sign_in_required": case "recovery_intent_expired": case "recovery_conflict":
        return code;
    }
  }
  return "provider_unavailable";
}
export function providerIdentity() {
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
  const subject = process.env.LUKAPP_OWNER_CLERK_SUBJECT;
  if (!issuer || !subject) providerFailure("provider_configuration_required");
  return { issuer, subject, tokenIdentifier: `${issuer}|${subject}` };
}
export function clerkTransport() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) providerFailure("provider_configuration_required");
  return createClerkClient({ secretKey });
}
export type ClerkTransport = Pick<ReturnType<typeof createClerkClient>, "sessions" | "domains" | "instance">;
export type ClerkSession = Awaited<ReturnType<ClerkTransport["sessions"]["getSession"]>>;
export async function verifyProviderInstance(clerk: ClerkTransport, issuer: string) {
  const domains = await clerk.domains.list();
  if (!domains.data.some((domain) => domain.frontendApiUrl === issuer)) providerFailure("provider_instance_mismatch");
  const instance = await clerk.instance.get();
  if (process.env.CLERK_INSTANCE_ID && instance.id !== process.env.CLERK_INSTANCE_ID) providerFailure("provider_instance_mismatch");
  return instance;
}
export function ownedSession(session: ClerkSession, subject: string, sid: string) {
  if (session.id !== sid || session.userId !== subject) providerFailure("provider_provenance_mismatch");
  if (!/^sess_[a-zA-Z0-9]{1,120}$/.test(session.id) || !Number.isSafeInteger(session.createdAt) || session.createdAt <= 0
    || !Number.isSafeInteger(session.expireAt) || !Number.isSafeInteger(session.abandonAt)) providerFailure("provider_session_invalid");
  return session;
}
export function sessionIsTerminal(session: ClerkSession) {
  return ["ended", "revoked", "removed", "expired", "abandoned"].includes(session.status)
    || session.expireAt <= Date.now() || session.abandonAt <= Date.now();
}
export function activeSession(session: ClerkSession) {
  if (session.actor !== null) providerFailure("provider_provenance_mismatch");
  if (sessionIsTerminal(session)) providerFailure("provider_session_terminal");
  if (session.status !== "active" || session.createdAt > Date.now()) providerFailure("provider_session_invalid");
  return session;
}
export async function getOwnedSession(clerk: ClerkTransport, subject: string, sid: string) {
  try { return ownedSession(await clerk.sessions.getSession(sid), subject, sid); }
  catch (error) {
    if (error instanceof Error && error.name === "ClerkAPIResponseError" && "status" in error && error.status === 404) return null;
    throw error;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export async function verifiedTerminalWebhook(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  const instanceId = process.env.CLERK_INSTANCE_ID;
  if (!secret || !instanceId) providerFailure("provider_configuration_required");
  let event: unknown;
  try { event = await verifyWebhook(request, { signingSecret: secret }); }
  catch { providerFailure("provider_session_invalid"); }
  if (!record(event) || event.object !== "event" || typeof event.type !== "string") providerFailure("provider_session_invalid");
  if (event.instance_id !== instanceId) providerFailure("provider_provenance_mismatch");
  if (event.type !== "session.ended" && event.type !== "session.removed" && event.type !== "session.revoked") return null;
  if (!record(event.data)) providerFailure("provider_session_invalid");
  const { id: sid, user_id: subject, status, object } = event.data;
  const eventId = request.headers.get("svix-id")?.trim();
  if (!eventId || eventId.length > 256 || object !== "session" || typeof sid !== "string" || !/^sess_[a-zA-Z0-9]{1,120}$/.test(sid)
    || typeof status !== "string" || !["ended", "removed", "revoked"].includes(status)
    || typeof event.timestamp !== "number" || !Number.isSafeInteger(event.timestamp)) providerFailure("provider_session_invalid");
  const actor = providerIdentity();
  if (subject !== actor.subject) providerFailure("provider_provenance_mismatch");
  return { ...actor, sid, eventId, eventType: event.type, timestamp: event.timestamp };
}
