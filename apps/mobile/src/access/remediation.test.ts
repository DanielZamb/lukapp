import { expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "../../../../convex/_generated/api";
import { AccessController, StaleAccess } from "./controller";
import { commandResult } from "./command-result";
import { begin, deferred, harness } from "./controller.test-support";

function recovery(h: ReturnType<typeof harness>) {
  let approved = false;
  let registered = false;
  h.answers.set("clerkProvider:beginRecovery", () => ({ intentId: "intent1", expiresAt: 10000 }));
  h.answers.set("clerkProvider:completeRecovery", () => {
    approved = true;
    return { workId: "work1", state: { kind: "pending", nextAttemptAt: 5000, error: "provider_unavailable" } };
  });
  h.answers.set("providerWork:status", () => ({ workId: "work1", state: { kind: "pending", nextAttemptAt: 5000, error: "provider_unavailable" } }));
  h.answers.set("clerkProvider:checkSession", () => approved ? { kind: "active" } :
    { kind: "denied", code: "recovery_registration_blocked", directive: "wipe-local-input-and-sign-out" });
  h.answers.set("devices:status", () => registered ? { kind: "registered", device: { id: "device1", state: { kind: "active" } } } :
    { kind: "denied", code: "device_registration_required", directive: "register-device" });
  h.answers.set("devices:register", () => { registered = true; return { id: "device1" }; });
}

it("completes the saved recovery before the ordinary registration barrier and keeps pending cleanup durable", async () => {
  const h = harness(); recovery(h); await begin(h);
  await h.controller.beginRecovery();
  expect(h.recoveryIntent()).toBe("intent1");
  expect(h.native.erase).toHaveBeenCalledOnce();
  h.events.length = 0; h.controller.observe({ kind: "signed-in", sessionId: "new-provider-session" }, true);
  await h.controller.admit();
  expect(h.events[0]).toBe("clerkProvider:completeRecovery");
  expect(h.events.indexOf("clerkProvider:checkSession")).toBeGreaterThan(h.events.indexOf("clerkProvider:completeRecovery"));
  expect(h.controller.getSnapshot().kind).toBe("ready");
  expect(h.native.erase).toHaveBeenCalledOnce();
  expect(h.recoveryPending()).toBe(false);
  expect(h.recoveryWork()).toBe("work1");
  expect(h.controller.getProviderCleanup()).toEqual({ workId: "work1", state: { kind: "pending", nextAttemptAt: 5000, error: "provider_unavailable" } });
  h.controller.lock();
  expect(h.controller.getProviderCleanup()).toBeNull();
  expect(h.recoveryWork()).toBe("work1");
  h.controller.dispose();
  const restarted = new AccessController(h.ports);
  await restarted.start(); restarted.observe({ kind: "signed-in", sessionId: "new-provider-session" }, true); await restarted.admit();
  expect(restarted.getSnapshot().kind).toBe("ready");
  expect(restarted.getProviderCleanup()?.state.kind).toBe("pending");
  expect(h.events.filter(name => name === "clerkProvider:completeRecovery")).toHaveLength(1);
  h.answers.set("providerWork:status", () => ({ workId: "work1", state: { kind: "succeeded", at: 6000 } }));
  await restarted.refreshProviderCleanup();
  expect(restarted.getProviderCleanup()).toEqual({ workId: "work1", state: { kind: "succeeded", at: 6000 } });
  expect(h.recoveryWork()).toBeNull();
  restarted.dispose();
});

it("does not bypass a terminal provider Session while completing saved recovery", async () => {
  const h = harness(); recovery(h); await begin(h); await h.controller.beginRecovery();
  h.answers.set("clerkProvider:completeRecovery", () => { throw new ConvexError({ code: "provider_session_terminal" }); });
  h.controller.observe({ kind: "signed-in", sessionId: "terminal-new-session" }, true); await h.controller.admit();
  expect(h.controller.getSnapshot().kind).toBe("signed-out");
  expect(h.events).not.toContain("devices:register");
  expect(h.native.openInput).not.toHaveBeenCalled();
  expect(h.native.erase).toHaveBeenCalledTimes(2);
});

it("discards an old cleanup rejection after a different Session is admitted", async () => {
  const h = harness(); recovery(h); await begin(h); await h.controller.beginRecovery();
  h.controller.observe({ kind: "signed-in", sessionId: "new-provider-session" }, true); await h.controller.admit();
  const held = deferred<unknown>();
  h.answers.set("providerWork:status", () => held.promise);
  const operation = h.controller.refreshProviderCleanup();
  const result = expect(operation).rejects.toBeInstanceOf(StaleAccess);
  await vi.waitFor(() => expect(h.events.at(-1)).toBe("providerWork:status"));
  h.controller.observe({ kind: "signed-in", sessionId: "different-provider-session" }, true);
  h.answers.set("providerWork:status", () => ({ workId: "work1", state: { kind: "pending", nextAttemptAt: 5000 } }));
  await h.controller.admit();
  expect(h.controller.getSnapshot().kind).toBe("ready");
  held.reject(new ConvexError({ code: "provider_session_terminal" }));
  await result;
  expect(h.controller.getSnapshot().kind).toBe("ready");
  expect(h.native.erase).toHaveBeenCalledOnce();
});

it("keeps a Security visit fresh across admission remounts but prompts again after leaving", async () => {
  const h = harness(); await begin(h); await h.controller.admit(true);
  expect(h.controller.securityFresh()).toBe(true);
  if (!h.controller.securityFresh()) await h.controller.admit(true);
  expect(h.native.unlock).toHaveBeenCalledOnce();
  const generation = h.native.state().generation;
  h.controller.leaveSecurity();
  expect(h.native.state().generation).toBe(generation);
  expect(h.controller.securityFresh()).toBe(false);
  if (!h.controller.securityFresh()) await h.controller.admit(true);
  expect(h.native.unlock).toHaveBeenCalledTimes(2);
  expect(h.controller.securityFresh()).toBe(true);
  h.answers.set("devices:list", () => []);
  await h.controller.listDevices();
  expect(h.native.unlock).toHaveBeenCalledTimes(3);
});

const facts = { workspaceId: "workspace1", financialAccountProfileId: "cash1", amount: { currency: "COP", minorUnits: 100 },
  accountingDate: "2026-10-14", description: "Unit command", idempotencyKey: "stable-command" };

it("keeps a known public command rejection inside admission and allows explicit retry with a new proof", async () => {
  const h = harness(); await begin(h); await h.controller.admit(); h.events.length = 0;
  h.answers.set("accounting:recordCashExpense", () => { throw new ConvexError({ code: "locked_period" }); });
  const submit = () => h.controller.execute(async (proof, rpc) => {
    const request = await proof("accounting.recordCashExpense", facts);
    return commandResult(() => rpc.mutation(api.accounting.recordCashExpense, request));
  });
  expect(await submit()).toEqual({ kind: "rejected", code: "locked_period" });
  expect(h.controller.getSnapshot().kind).toBe("ready");
  expect(h.native.state()).toMatchObject({ unlocked: true, workspaceId: "workspace1" });
  h.answers.set("accounting:recordCashExpense", () => ({ id: "known-result" }));
  expect(await submit()).toEqual({ kind: "accepted", value: { id: "known-result" } });
  expect(h.events).toEqual(["devices:prepare", "accounting:recordCashExpense", "devices:prepare", "accounting:recordCashExpense"]);
});

it.each(["proof", "transport", "permission", "invalidation"])("never treats %s failure as a successful domain rejection", async stage => {
  const h = harness(); await begin(h); await h.controller.admit();
  if (stage === "proof") h.answers.set("devices:prepare", () => { throw new ConvexError({ code: "locked_period" }); });
  h.answers.set("accounting:recordCashExpense", () => {
    if (stage === "transport") throw new Error("locked_period");
    if (stage === "permission") throw new ConvexError({ code: "workspace_permission_required" });
    if (stage === "invalidation") h.controller.lock();
    throw new ConvexError({ code: "locked_period" });
  });
  const result = h.controller.execute(async (proof, rpc) => {
    const request = await proof("accounting.recordCashExpense", facts);
    return commandResult(() => rpc.mutation(api.accounting.recordCashExpense, request));
  });
  if (stage === "invalidation") await expect(result).rejects.toBeInstanceOf(StaleAccess);
  else await expect(result).rejects.toThrow();
  expect(h.controller.getSnapshot().kind).not.toBe("ready");
  expect(h.native.erase).not.toHaveBeenCalled();
});
