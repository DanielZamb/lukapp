import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import type {
  GenericValidator,
  Infer,
  ObjectType,
  PropertyValidators,
} from "convex/values";
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { FinancialOperation } from "../../src/access/protocol";
import { deviceProof } from "../deviceValidators";
import { consumeChallenge, verifyChallenge, verifyPayload } from "./deviceAccess";

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
    clerkIdentity: identity,
    actor: { userId: identity.tokenIdentifier },
    identity: {
      tokenIdentifier: identity.tokenIdentifier,
      issuer: identity.issuer,
      subject: identity.subject,
    },
  };
}

export type OwnerContext = Awaited<ReturnType<typeof requireOwner>>;
const proofArgs = { access: v.optional(deviceProof) };

async function financialInput(
  ctx: QueryCtx,
  args: { access?: Infer<typeof deviceProof> },
  extra: { operation: FinancialOperation },
) {
  const owner = await requireOwner(ctx);
  const verified = await verifyChallenge(
    ctx,
    owner.clerkIdentity,
    args.access,
    extra.operation,
    true,
  );
  return {
    ctx: {
      ...owner,
      verifyArguments: (request: unknown) => verifyPayload(verified.challenge, request),
    },
    args: {},
    verified,
  };
}

const protectedQuery = customQuery(query, {
  args: proofArgs,
  input: financialInput,
});
const protectedMutation = customMutation(mutation, {
  args: proofArgs,
  input: async (ctx: MutationCtx, args, extra: { operation: FinancialOperation }) => {
    const added = await financialInput(ctx, args, extra);
    await consumeChallenge(ctx, added.verified.challenge, added.verified.device);
    return added;
  },
});

type FinancialDefinition<
  Ctx,
  Args extends PropertyValidators,
  Returns extends GenericValidator,
> = {
  operation: FinancialOperation;
  args: Args;
  returns: Returns;
  handler: (
    ctx: Ctx & OwnerContext,
    args: ObjectType<Args>,
  ) => Promise<Infer<Returns>>;
};

export function ownerQuery<
  Args extends PropertyValidators,
  Returns extends GenericValidator,
>(definition: FinancialDefinition<QueryCtx, Args, Returns>) {
  return protectedQuery({
    ...definition,
    args: v.object(definition.args),
    handler: async (ctx, args): Promise<Infer<Returns>> => {
      await ctx.verifyArguments(args);
      return definition.handler(ctx, args);
    },
  });
}

export function ownerMutation<
  Args extends PropertyValidators,
  Returns extends GenericValidator,
>(definition: FinancialDefinition<MutationCtx, Args, Returns>) {
  return protectedMutation({
    ...definition,
    args: v.object(definition.args),
    handler: async (ctx, args): Promise<Infer<Returns>> => {
      await ctx.verifyArguments(args);
      return definition.handler(ctx, args);
    },
  });
}
