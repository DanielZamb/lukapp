import { expect, it, vi } from "vitest";
import { z } from "zod";
import { ConvexError } from "convex/values";
import { api } from "../../../../convex/_generated/api";
import { StaleAccess } from "./controller";
import { deferred, begin, harness } from "./controller.test-support";
const recoveryWorkRequest = z.object({ workId: z.string() });

it("holds failed marker cleanup ahead of another admission", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  vi.mocked(h.native.beginWipe).mockImplementationOnce(async () => { h.native.lock(); throw new Error("marker unavailable"); });
  await h.controller.wipe();
  expect(h.native.state().wipePending).toBe(false);
  expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "wipe_retry_required:marker" });
  const events = h.events.length; const opens = vi.mocked(h.native.openInput).mock.calls.length;
  await h.controller.admit();
  expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "wipe_retry_required:marker" });
  expect(h.events.length).toBe(events); expect(vi.mocked(h.native.openInput).mock.calls.length).toBe(opens);
});

it.each(["pending", "unavailable"])("preserves no-intent and occupied work when Begin status is %s", async status => {
  const h = harness(); await begin(h); await h.controller.admit(); h.seedRecovery(null, "old-work");
  h.answers.set("providerWork:status", () => { if (status === "unavailable") throw new Error("status unavailable"); return { workId: "old-work", state: { kind: "pending", nextAttemptAt: 10000 } }; });
  h.answers.set("clerkProvider:beginRecovery", () => { throw new ConvexError({ code: "recovery_conflict" }); });
  await expect(h.controller.beginRecovery()).rejects.toThrow();
  expect(h.readRecovery()).toEqual({ version: 2, revision: 0, intent: { kind: "none" }, cleanup: { kind: "work", workId: "old-work" } });
  expect(h.events.filter(name => name === "clerkProvider:beginRecovery").length).toBe(0);
});

it("never promotes retrieve during Unlock/admit", async () => {
  const h = harness(); await begin(h); h.seedRecovery("retrieve", null);
  h.answers.set("clerkProvider:beginRecovery", () => ({ intentId: "new-intent", expiresAt: 10000 }));
  h.answers.set("clerkProvider:completeRecovery", () => { throw new ConvexError({ code: "provider_session_terminal" }); });
  await h.controller.admit();
  expect(h.readRecovery()).toEqual({ version: 2, revision: 0, intent: { kind: "retrieve" }, cleanup: { kind: "none" } });
  expect(h.events.filter(name => name === "clerkProvider:beginRecovery").length).toBe(0);
  expect(h.events.filter(name => name === "clerkProvider:completeRecovery").length).toBe(0);
  expect(h.native.state().keyPresent).toBe(true);
  expect(h.controller.getSnapshot().kind).toBe("blocked");
});

it.each(["lock", "suspend", "workspace", "reconnect", "session", "signed-out"])("keeps failed marker cleanup dominant after %s", async change => {
  const h = harness(); await begin(h); await h.controller.admit();
  const key = vi.spyOn(h.ports, "key");
  vi.mocked(h.native.beginWipe).mockImplementationOnce(async () => { h.native.lock(); throw new Error("marker unavailable"); });
  await h.controller.wipe();
  const dispatches = h.events.length; const opens = vi.mocked(h.native.openInput).mock.calls.length;
  const unlocks = vi.mocked(h.native.unlock).mock.calls.length;
  if (change === "lock") h.controller.lock();
  if (change === "suspend") h.controller.suspend();
  if (change === "workspace") h.controller.workspace("workspace2");
  if (change === "reconnect") { h.controller.observe({ kind: "signed-in", sessionId: "unit-session" }, false); h.controller.observe({ kind: "signed-in", sessionId: "unit-session" }, true); }
  if (change === "session") h.controller.observe({ kind: "signed-in", sessionId: "replacement" }, true);
  if (change === "signed-out") h.controller.observe({ kind: "signed-out" }, false);
  await h.controller.admit();
  await expect(h.controller.beginRecovery()).rejects.toBeInstanceOf(StaleAccess);
  await expect(h.controller.execute(async (proof, rpc) => rpc.query(api.accounting.balances, await proof("accounting.balances", { workspaceId: "workspace1" })))).rejects.toBeInstanceOf(StaleAccess);
  expect(h.controller.getCleanupRequired()).toBe(true);
  expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "wipe_retry_required:marker" });
  expect(h.native.state()).toMatchObject({ keyPresent: true, wipePending: false, unlocked: false, workspaceId: null });
  expect(h.events.length).toBe(dispatches); expect(key.mock.calls.length).toBe(0);
  expect(vi.mocked(h.native.openInput).mock.calls.length).toBe(opens);
  expect(vi.mocked(h.native.unlock).mock.calls.length).toBe(unlocks);
  expect(h.native.beginWipe).toHaveBeenCalledOnce();
  await h.controller.wipe();
  expect(h.controller.getCleanupRequired()).toBe(false);
  expect(h.controller.getSnapshot()).toEqual({ kind: "signed-out" });
  expect(h.native.state()).toMatchObject({ keyPresent: false, wipePending: false, workspaceId: null });
});

it.each(["erase", "session", "finish"])("clears the cleanup obligation only after explicit successful retry of %s failure", async phase => {
  const h = harness(); await begin(h); await h.controller.admit();
  if (phase === "erase") vi.mocked(h.native.erase).mockRejectedValueOnce(new Error("input_deletion_failed"));
  if (phase === "session") h.signOut.mockRejectedValueOnce(new Error("sign-out unavailable"));
  if (phase === "finish") vi.mocked(h.native.finishWipe).mockRejectedValueOnce(new Error("wipe_marker_deletion_failed"));
  await h.controller.wipe();
  expect(h.controller.getCleanupRequired()).toBe(true);
  expect(h.native.state().wipePending).toBe(true);
  const requests = h.events.length; await h.controller.admit();
  expect(h.events.length).toBe(requests);
  await h.controller.wipe();
  expect(h.controller.getCleanupRequired()).toBe(false);
  expect(h.controller.getSnapshot()).toEqual({ kind: "signed-out" });
  expect(h.native.state().wipePending).toBe(false);
});

it("retains an in-flight cleanup obligation across invalidation and coalesces explicit retries", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  const held = deferred<void>();
  vi.mocked(h.native.beginWipe).mockImplementationOnce(async () => { h.native.lock(); await held.promise; throw new Error("marker unavailable"); });
  const first = h.controller.wipe(); const second = h.controller.wipe();
  h.controller.suspend(); await h.controller.admit();
  expect(h.controller.getCleanupRequired()).toBe(true);
  expect(h.controller.getSnapshot().kind).toBe("wiping");
  held.resolve(); await Promise.all([first, second]);
  expect(h.controller.getCleanupRequired()).toBe(true);
  expect(h.native.beginWipe).toHaveBeenCalledOnce();
  expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "wipe_retry_required:marker" });
});

it.each(["retrieve", "exact-intent"])("preserves existing %s and old cleanup when Begin preflight is unavailable", async intent => {
  const h = harness(); await begin(h); h.seedRecovery(intent, "old-work");
  h.answers.set("providerWork:status", () => { throw new Error("status unavailable"); });
  await expect(h.controller.beginRecovery()).rejects.toThrow("status unavailable");
  expect(h.recoveryIntent()).toBe(intent); expect(h.recoveryWork()).toBe("old-work");
  expect(h.events).toEqual(["providerWork:status"]);
  expect(h.readRecovery().revision).toBe(0);
});

it("allows only explicit Begin retry to persist exact and wipe, then completes on a new Session before checkSession", async () => {
  const h = harness(); await begin(h); h.seedRecovery("retrieve", "old-work");
  h.answers.set("providerWork:status", args => {
    const { workId } = recoveryWorkRequest.parse(args);
    return { workId, state: workId === "old-work" ? { kind: "succeeded", at: 6000 } : { kind: "pending", nextAttemptAt: 7000 } };
  });
  h.answers.set("clerkProvider:beginRecovery", () => ({ intentId: "exact-intent", expiresAt: 10000 }));
  let newSession = false; let registered = false;
  h.answers.set("clerkProvider:completeRecovery", args => {
    expect(args).toEqual({ intentId: "exact-intent" });
    if (!newSession) throw new ConvexError({ code: "provider_session_terminal" });
    return { workId: "new-work", state: { kind: "pending", nextAttemptAt: 7000 } };
  });
  await h.controller.admit();
  expect(h.events).toEqual([]);
  expect(h.recoveryIntent()).toBe("retrieve"); expect(h.recoveryWork()).toBe("old-work");
  await h.controller.beginRecovery();
  expect(h.events).toEqual(["providerWork:status", "clerkProvider:beginRecovery"]);
  expect(h.readRecovery()).toEqual({ version: 2, revision: 2, intent: { kind: "exact", intentId: "exact-intent" }, cleanup: { kind: "none" } });
  expect(h.native.erase).toHaveBeenCalledOnce(); expect(h.controller.getSnapshot().kind).toBe("signed-out");
  newSession = true; h.events.length = 0;
  h.controller.observe({ kind: "signed-in", sessionId: "fresh-provider-session" }, true);
  h.answers.set("devices:status", () => registered ? { kind: "registered", device: { id: "device1", state: { kind: "active" } } } : { kind: "denied", code: "device_registration_required", directive: "register-device" });
  h.answers.set("devices:register", () => { registered = true; return { id: "device1" }; });
  await h.controller.admit();
  expect(h.events[0]).toBe("clerkProvider:completeRecovery");
  expect(h.events[1]).toBe("clerkProvider:checkSession");
  expect(h.events.filter(name => name === "clerkProvider:beginRecovery").length).toBe(0);
  expect(h.events.filter(name => name === "clerkProvider:completeRecovery").length).toBe(1);
  expect(h.readRecovery()).toMatchObject({ intent: { kind: "none" }, cleanup: { kind: "work", workId: "new-work" } });
  expect(h.controller.getSnapshot().kind).toBe("ready");
});

it("keeps transport-uncertain retrieve after Unlock until an explicit Begin retry", async () => {
  const h = harness(); await begin(h);
  h.answers.set("clerkProvider:beginRecovery", () => { throw new Error("response unknown"); });
  await expect(h.controller.beginRecovery()).rejects.toThrow("response unknown");
  await h.controller.admit(); await h.controller.admit();
  expect(h.events).toEqual(["clerkProvider:beginRecovery"]);
  expect(h.readRecovery()).toEqual({ version: 2, revision: 1, intent: { kind: "retrieve" }, cleanup: { kind: "none" } });
  expect(h.native.state().keyPresent).toBe(true);
  h.answers.set("clerkProvider:beginRecovery", () => ({ intentId: "retrieved-server-intent", expiresAt: 10000 }));
  await h.controller.beginRecovery();
  expect(h.events.filter(name => name === "clerkProvider:beginRecovery").length).toBe(2);
  expect(h.recoveryIntent()).toBe("retrieved-server-intent");
  expect(h.controller.getSnapshot().kind).toBe("signed-out");
  expect(h.native.erase).toHaveBeenCalledOnce();
});

it.each(["status", "begin"])("does not apply stale %s facts after Session invalidation", async stage => {
  const h = harness(); await begin(h); if (stage === "status") h.seedRecovery(null, "old-work");
  const held = deferred<unknown>();
  h.answers.set(stage === "status" ? "providerWork:status" : "clerkProvider:beginRecovery", () => held.promise);
  const request = h.controller.beginRecovery(); const rejected = expect(request).rejects.toBeInstanceOf(StaleAccess);
  await vi.waitFor(() => expect(h.events.at(-1)).toBe(stage === "status" ? "providerWork:status" : "clerkProvider:beginRecovery"));
  const original = h.readRecovery();
  h.controller.observe({ kind: "signed-in", sessionId: "new-session" }, true);
  held.resolve(stage === "status" ? { workId: "old-work", state: { kind: "succeeded", at: 6000 } } : { intentId: "late-intent", expiresAt: 10000 });
  await rejected;
  expect(h.readRecovery()).toEqual(original);
  expect(h.native.erase).not.toHaveBeenCalled();
  expect(h.native.state().keyPresent).toBe(true);
});
