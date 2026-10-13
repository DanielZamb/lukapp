import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";

export function ownerAdmission(identity: UserIdentity | null) {
  if (!identity) return "authentication_required";
  const subject = process.env.LUKAPP_OWNER_CLERK_SUBJECT;
  const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
  if (!subject || !issuer) return "owner_configuration_required";
  if (identity.subject !== subject || identity.issuer !== issuer)
    return "owner_not_allowed";
  return null;
}

export async function requireOwner(ctx: {
  auth: { getUserIdentity(): Promise<UserIdentity | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "authentication_required" });
  const error = ownerAdmission(identity);
  if (error) throw new ConvexError({ code: error });
  return {
    actor: { userId: identity.tokenIdentifier },
    identity: {
      tokenIdentifier: identity.tokenIdentifier,
      issuer: identity.issuer,
      subject: identity.subject,
    },
  };
}

export type OwnerContext = Awaited<ReturnType<typeof requireOwner>>;
const ownerContext = customCtx(requireOwner);

export const ownerQuery = customQuery(query, ownerContext);
export const ownerMutation = customMutation(mutation, ownerContext);
