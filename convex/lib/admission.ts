import type { Auth } from "convex/server";
import { ConvexError } from "convex/values";

export type Connection =
  | { status: "signed-out" }
  | { status: "not-owner" }
  | { status: "owner"; clerkSubject: string };

export async function ownerConnection(auth: Auth): Promise<Connection> {
  const identity = await auth.getUserIdentity();
  if (!identity) return { status: "signed-out" };
  return { status: "owner", clerkSubject: identity.subject };
}

export async function requireOwner(auth: Auth) {
  const connection = await ownerConnection(auth);
  if (connection.status !== "owner") {
    throw new ConvexError({
      code: "authentication_required",
      message: "Sign in required",
    });
  }
  return { userId: connection.clerkSubject };
}
