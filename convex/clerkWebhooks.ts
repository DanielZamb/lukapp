import { verifyWebhook } from "@clerk/backend/webhooks";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { httpAction, internalMutation } from "./_generated/server";
import { recordClerkTerminalSession } from "./lib/deviceRegistry";

const eventType = z.object({ type: z.string().min(1) });
const sessionData = z.object({
  object: z.literal("session"),
  id: z.string().regex(/^\S+$/),
  user_id: z.string().regex(/^\S+$/),
});
const terminalEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.revoked"), data: sessionData.extend({ status: z.literal("revoked") }) }),
  z.object({ type: z.literal("session.ended"), data: sessionData.extend({ status: z.literal("ended") }) }),
]);

export const reconcileTerminalSession = internalMutation({
  args: { clerkUserId: v.string(), clerkSessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId, clerkSessionId }) => {
    await recordClerkTerminalSession(ctx, clerkUserId, clerkSessionId);
    return null;
  },
});

export const sessionEvents = httpAction(async (ctx, request) => {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret?.trim()) return new Response("Webhook unavailable", { status: 503 });

  let verified: unknown;
  try {
    verified = await verifyWebhook(request, { signingSecret });
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  const envelope = eventType.safeParse(verified);
  if (!envelope.success) return new Response("Invalid webhook", { status: 400 });
  if (envelope.data.type !== "session.revoked" && envelope.data.type !== "session.ended")
    return new Response(null, { status: 204 });

  const event = terminalEvent.safeParse(verified);
  if (!event.success) return new Response("Invalid webhook", { status: 400 });
  try {
    await ctx.runMutation(internal.clerkWebhooks.reconcileTerminalSession, {
      clerkUserId: event.data.data.user_id, clerkSessionId: event.data.data.id,
    });
  } catch {
    return new Response("Webhook reconciliation failed", { status: 503 });
  }
  return new Response(null, { status: 204 });
});
