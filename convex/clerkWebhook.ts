import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { sanitizedProviderError, verifiedTerminalWebhook } from "./lib/clerk";

export async function reconcileClerkWebhook(ctx: ActionCtx, request: Request): Promise<Response> {
  try {
    const event = await verifiedTerminalWebhook(request);
    if (!event) return new Response("ignored", { status: 200 });
    const prior = await ctx.runQuery(internal.providerWork.webhookDelivery, { eventId: event.eventId });
    if (prior) {
      if (prior.sid !== event.sid || prior.tokenIdentifier !== event.tokenIdentifier || prior.eventType !== event.eventType) return new Response("provider_provenance_mismatch", { status: 400 });
      return new Response("duplicate", { status: 200 });
    }
    const { sid, tokenIdentifier, issuer, subject } = event;
    await ctx.runMutation(internal.devices.applyClerkSessionRevocation, { sid, tokenIdentifier, issuer, subject });
    await ctx.runMutation(internal.providerWork.recordWebhook, event);
    return new Response("reconciled", { status: 200 });
  } catch (error) {
    const code = sanitizedProviderError(error);
    return new Response(code, { status: code === "provider_configuration_required" || code === "provider_unavailable" ? 503 : 400 });
  }
}
export const terminalSession = httpAction(reconcileClerkWebhook);
