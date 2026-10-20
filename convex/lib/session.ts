import type { Auth } from "convex/server";
import { ConvexError } from "convex/values";
import type { Infer } from "convex/values";
import { requireOwner } from "./admission";
import { getClerkSession } from "./clerkProvider";
import { liveSession } from "./securityValues";

export type LiveSession = Infer<typeof liveSession>;

export async function requireSession(auth: Auth) {
  const actor = await requireOwner(auth);
  const identity = await auth.getUserIdentity();
  if (!identity || !process.env.CLERK_JWT_ISSUER_DOMAIN ||
      identity.issuer !== process.env.CLERK_JWT_ISSUER_DOMAIN)
    throw new ConvexError({ code: "session_required" });
  if (typeof identity.sid !== "string" || !identity.sid ||
      (identity.sts !== undefined && identity.sts !== "active"))
    throw new ConvexError({ code: "session_required" });
  return { ...actor, clerkSessionId: identity.sid };
}

export async function verifyCurrentSession(auth: Auth): Promise<LiveSession> {
  const actor = await requireSession(auth);
  const session = await getClerkSession(actor.clerkSessionId);
  const now = Date.now();
  if (!session || session.id !== actor.clerkSessionId || session.user_id !== actor.userId ||
      session.status !== "active" || session.expire_at <= now || session.abandon_at <= now)
    throw new ConvexError({ code: "session_inactive", wipeLocalInput: true });
  return {
    ...actor, clerkClientId: session.client_id, verifiedAt: now,
    expiresAt: session.expire_at, abandonsAt: session.abandon_at,
  };
}

// Only pass this observation from an action to an internal function, never from public args.
export async function requireLiveObservation(auth: Auth, session: LiveSession) {
  const actor = await requireSession(auth);
  const now = Date.now();
  if (session.userId !== actor.userId || session.clerkSessionId !== actor.clerkSessionId ||
      session.verifiedAt > now || now - session.verifiedAt > 5000 ||
      session.expiresAt <= now || session.abandonsAt <= now)
    throw new ConvexError({ code: "session_verification_required" });
  return actor;
}
