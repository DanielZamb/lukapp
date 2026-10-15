import { expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { targetId } from "./lifecycle";
import { api } from "../../../../convex/_generated/api";
import { AccessController, StaleAccess } from "./controller";
import { ConvexHttpClient } from "convex/browser";
import { requestScopedRpc } from "./request-scoped-rpc";
import { deferred, begin, harness } from "./controller.test-support";

it("wipes retained custody on the first authoritative signed-out observation", async () => {
  const h = harness(); await h.controller.start();
  h.controller.observe({ kind: "signed-out" }, true);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(h.controller.getSnapshot().kind).toBe("signed-out");
  expect(h.native.state().keyPresent).toBe(false);
  expect(h.native.erase).toHaveBeenCalledOnce();
});

it("completes a newer exact intent despite an older cleanup ID", async () => {
  const h = harness(); await begin(h);
  h.seedRecovery("intent2", "work1");
  h.answers.set("providerWork:status", () => ({ workId: h.recoveryWork(), state: h.recoveryWork() === "work1" ? { kind: "succeeded", at: 6000 } : { kind: "pending", nextAttemptAt: 7000 } }));
  h.answers.set("clerkProvider:completeRecovery", () => ({ workId: "work2", state: { kind: "pending", nextAttemptAt: 7000 } }));
  await h.controller.admit();
  expect(h.events).toContain("clerkProvider:completeRecovery");
  expect(h.recoveryWork()).toBe("work2");
  expect(h.controller.getSnapshot().kind).toBe("ready");
});

it("durably wipes a current terminal Begin recovery failure", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  h.answers.set("clerkProvider:beginRecovery", () => { throw new ConvexError({ code: "provider_session_terminal" }); });
  await expect(h.controller.beginRecovery()).rejects.toMatchObject({ data: { code: "provider_session_terminal" } });
  expect(h.controller.getSnapshot().kind).toBe("signed-out");
  expect(h.native.state().keyPresent).toBe(false);
});

it("retains a returned device-revocation cleanup outside the Security component", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  h.answers.set("devices:revoke", () => ({ kind: "revoked", workId: "work2", providerRevocation: { kind: "pending", nextAttemptAt: 8000 } }));
  await h.controller.revokeDevice(targetId.parse("device2"));
  expect(h.controller.getRevocations()).toEqual([{ refreshed: true, record: { version: 1, revision: 1, deviceId: "device2", outcome: { kind: "observed", workId: "work2", result: { kind: "pending", nextAttemptAt: 8000 } } } }]);
});

it("does not wipe loading observations, consumes the latest startup observation and avoids a clean-restart loop", async () => {
  const h = harness();
  const initialized = deferred<ReturnType<typeof h.native.state>>();
  h.native.initialize = async () => initialized.promise;
  const start = h.controller.start();
  h.controller.observe({ kind: "signed-in", sessionId: "obsolete" }, true);
  h.controller.observe({ kind: "signed-out" }, false);
  expect(h.native.state().keyPresent).toBe(true);
  initialized.resolve(h.native.state()); await start;
  await vi.waitFor(() => expect(h.controller.getSnapshot().kind).toBe("signed-out"));
  expect(h.native.erase).toHaveBeenCalledOnce();
  h.controller.dispose();
  h.native.initialize = async () => h.native.state();
  const restarted = new AccessController(h.ports);
  await restarted.start();
  restarted.observe({ kind: "loading" }, false);
  restarted.observe({ kind: "signed-out" }, false);
  restarted.observe({ kind: "signed-out" }, true);
  expect(restarted.getSnapshot().kind).toBe("signed-out");
  expect(h.native.erase).toHaveBeenCalledOnce();
});

it("cleans retained encrypted input without a signing key, while routing metadata alone survives", async () => {
  const h = harness(); h.setNativeState({ keyPresent: false }); h.retainInput(); h.seedRecovery("intent3", "work3");
  await h.controller.start(); h.controller.observe({ kind: "signed-out" }, true);
  await vi.waitFor(() => expect(h.controller.getSnapshot().kind).toBe("signed-out"));
  expect(h.readRecovery()).toMatchObject({ intent: { kind: "exact", intentId: "intent3" }, cleanup: { workId: "work3" } });
  expect(h.native.hasRetainedCustody("fixture")).toBe(false);
  expect(h.native.erase).toHaveBeenCalledOnce();
});

it("resumes a pending wipe and holds a failed wipe for explicit retry", async () => {
  const h = harness(); h.setNativeState({ wipePending: true });
  vi.mocked(h.native.erase).mockRejectedValueOnce(new Error("input_deletion_failed"));
  await h.controller.start(); h.controller.observe({ kind: "signed-out" }, false);
  h.controller.observe({ kind: "signed-out" }, true);
  expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "wipe_retry_required:native:input_deletion_failed" });
  expect(h.native.state().wipePending).toBe(true);
  expect(h.native.erase).toHaveBeenCalledOnce();
  await h.controller.wipe();
  expect(h.controller.getSnapshot().kind).toBe("signed-out");
  expect(h.native.state().wipePending).toBe(false);
});

it.each(["pending", "unavailable"])("keeps old cleanup and exact intent when old status is %s, without dispatching completion", async outcome => {
  const h = harness(); await begin(h); h.seedRecovery("intent2", "work1");
  h.answers.set("providerWork:status", () => { if (outcome === "unavailable") throw new Error("offline"); return { workId: "work1", state: { kind: "pending", nextAttemptAt: 99 } }; });
  await h.controller.admit();
  expect(h.controller.getSnapshot().kind).toBe("blocked");
  expect(h.readRecovery()).toEqual({ version: 2, revision: 0, intent: { kind: "exact", intentId: "intent2" }, cleanup: { kind: "work", workId: "work1" } });
  expect(h.events).not.toContain("clerkProvider:completeRecovery");
});

it("replays exact completion after a lost response or failed atomic transition, before another network request", async () => {
  const h = harness(); await begin(h); h.seedRecovery("intent2", null);
  let completed = 0;
  h.answers.set("clerkProvider:completeRecovery", args => {
    expect(args).toEqual({ intentId: "intent2" }); completed++;
    if (completed === 1) throw new Error("response lost after server commit");
    return { workId: "work2", state: { kind: "pending", nextAttemptAt: 99 } };
  });
  h.answers.set("providerWork:status", () => ({ workId: "work2", state: { kind: "pending", nextAttemptAt: 99 } }));
  await h.controller.admit();
  expect(h.recoveryIntent()).toBe("intent2");
  vi.mocked(h.native.writeRecovery).mockRejectedValueOnce(new Error("storage interrupted before commit"));
  await h.controller.admit();
  expect(h.readRecovery()).toMatchObject({ intent: { kind: "exact", intentId: "intent2" }, cleanup: { kind: "none" } });
  expect(h.events.filter(value => value === "clerkProvider:checkSession")).toHaveLength(0);
  await h.controller.admit();
  expect(h.controller.getSnapshot().kind).toBe("ready");
  expect(completed).toBe(3);
  expect(h.readRecovery()).toMatchObject({ intent: { kind: "none" }, cleanup: { kind: "work", workId: "work2" } });
});

it("keeps a consumed intent unresolved when a replacement Session receives replay conflict", async () => {
  const h = harness(); await begin(h); h.seedRecovery("intent2", null);
  h.answers.set("clerkProvider:completeRecovery", () => { throw new ConvexError({ code: "recovery_conflict" }); });
  h.controller.observe({ kind: "signed-in", sessionId: "different-recovered-session" }, true); await h.controller.admit();
  expect(h.controller.getSnapshot().kind).toBe("blocked");
  expect(h.recoveryIntent()).toBe("intent2");
  expect(h.events).not.toContain("clerkProvider:checkSession");
});

it("does not overwrite an exact intent during Begin retry and blocks transport rejection", async () => {
  const h = harness(); await begin(h); h.seedRecovery("intent2", "work1");
  await h.controller.beginRecovery();
  expect(h.recoveryIntent()).toBe("intent2");
  expect(h.recoveryWork()).toBe("work1");
  expect(h.events).not.toContain("clerkProvider:beginRecovery");
  const uncertain = harness(); await begin(uncertain);
  uncertain.answers.set("clerkProvider:beginRecovery", () => { throw new Error("offline"); });
  await expect(uncertain.controller.beginRecovery()).rejects.toThrow("offline");
  expect(uncertain.controller.getSnapshot().kind).toBe("blocked");
  expect(uncertain.recoveryIntent()).toBe("retrieve");
  expect(uncertain.native.state().keyPresent).toBe(true);
});

it("rejects a late terminal Begin error without wiping a newer Session", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  const held = deferred<unknown>(); h.answers.set("clerkProvider:beginRecovery", () => held.promise);
  const request = h.controller.beginRecovery(); const rejected = expect(request).rejects.toBeInstanceOf(StaleAccess);
  await vi.waitFor(() => expect(h.recoveryIntent()).toBe("retrieve"));
  h.controller.observe({ kind: "signed-in", sessionId: "replacement" }, true);
  h.seedRecovery(null, null); await h.controller.admit();
  held.reject(new ConvexError({ code: "provider_session_terminal" })); await rejected;
  expect(h.controller.getSnapshot().kind).toBe("ready");
  expect(h.native.state().keyPresent).toBe(true);
  expect(h.native.erase).not.toHaveBeenCalled();
});

it("retains two independent revocations, coalesces the same target and never downgrades known work", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  h.answers.set("devices:revoke", args => {
    const id = (args as { deviceId: string }).deviceId;
    return { kind: "revoked", workId: "work-" + id, providerRevocation: { kind: "pending", nextAttemptAt: 8000 } };
  });
  h.answers.set("providerWork:status", args => ({ workId: (args as { workId: string }).workId, state: { kind: "pending", nextAttemptAt: 9000 } }));
  const first = h.controller.revokeDevice(targetId.parse("device2"));
  expect(h.controller.revokeDevice(targetId.parse("device2"))).toBe(first); await first;
  await h.controller.revokeDevice(targetId.parse("device3"));
  await h.controller.revokeDevice(targetId.parse("device2"));
  expect(h.events.filter(event => event === "devices:revoke")).toHaveLength(2);
  expect(h.controller.getRevocations().map(item => item.record.outcome)).toEqual([
    { kind: "observed", workId: "work-device2", result: { kind: "pending", nextAttemptAt: 9000 } },
    { kind: "observed", workId: "work-device3", result: { kind: "pending", nextAttemptAt: 9000 } }]);
  h.answers.set("providerWork:status", args => ({ workId: (args as { workId: string }).workId,
    state: (args as { workId: string }).workId === "work-device2" ? { kind: "succeeded", at: 10000 } : { kind: "pending", nextAttemptAt: 11000 } }));
  await h.controller.refreshProviderCleanup();
  expect(h.controller.getRevocations().map(item => item.record.outcome)).toEqual([
    { kind: "observed", workId: "work-device2", result: { kind: "succeeded", at: 10000 } },
    { kind: "observed", workId: "work-device3", result: { kind: "pending", nextAttemptAt: 11000 } }]);
  h.controller.dispose(); const restarted = new AccessController(h.ports); await restarted.start(); restarted.observe({ kind: "signed-in", sessionId: "unit-session" }, true); await restarted.admit();
  expect(restarted.getRevocations().length).toBe(2);
  expect(restarted.getSnapshot().kind).toBe("ready");
});

it("persists self-revocation before wiping and leaves unknown responses available for explicit retry", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  h.answers.set("devices:revoke", () => ({ kind: "revoked", workId: "self-work", providerRevocation: { kind: "pending", nextAttemptAt: 8000 } }));
  await h.controller.revokeDevice(targetId.parse("device1"));
  expect(h.controller.getSnapshot().kind).toBe("signed-out");
  expect(JSON.parse(h.native.readRevocations("fixture")[0]!)).toMatchObject({ deviceId: "device1", outcome: { kind: "observed", workId: "self-work" } });
  const lost = harness(); await begin(lost); await lost.controller.admit();
  lost.answers.set("devices:revoke", () => { throw new Error("lost response"); });
  await expect(lost.controller.revokeDevice(targetId.parse("device2"))).rejects.toThrow("lost response");
  expect(JSON.parse(lost.native.readRevocations("fixture")[0]!)).toMatchObject({ outcome: { kind: "response-unknown" } });
  lost.answers.set("devices:revoke", () => ({ kind: "revoked", workId: "existing-work", providerRevocation: { kind: "succeeded", at: 8000 } }));
  await lost.controller.revokeDevice(targetId.parse("device2"));
  expect(lost.controller.getRevocations()[0]?.record.outcome).toEqual({ kind: "observed", workId: "existing-work", result: { kind: "succeeded", at: 8000 } });
});

it.each(["lock", "session", "workspace", "generation", "unmount", "disconnect", "mode"])("never revives a tap after %s", async reason => {
  const h = harness(); await begin(h); await h.controller.admit(); const action = h.controller.beginUserAction();
  if (reason === "lock") h.controller.lock();
  if (reason === "session") h.controller.observe({ kind: "signed-in", sessionId: "other" }, true);
  if (reason === "workspace") h.controller.workspace("workspace2");
  if (reason === "generation") { h.setNativeState({ generation: h.native.state().generation + 1 }); h.controller.nativeChanged(); }
  if (reason === "unmount") action.cancel();
  if (reason === "disconnect") { h.controller.observe({ kind: "signed-in", sessionId: "unit-session" }, false); h.controller.observe({ kind: "signed-in", sessionId: "unit-session" }, true); }
  if (reason === "mode") { h.setNativeState({ mode: "live" }); expect(() => action.assertCurrent()).toThrow(); h.setNativeState({ mode: "fixture", generation: h.native.state().generation + 1 }); }
  await h.controller.admit();
  expect(h.controller.getSnapshot().kind).toBe("ready");
  expect(() => action.assertCurrent()).toThrow("scenario_admission_invalidated");
  await expect(action.execute((_, rpc) => rpc.query(api.authConnection.connection, {}))).rejects.toBeInstanceOf(StaleAccess);
});

it("cancels through proof and the actual request-scoped post-token guard", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  const signing = deferred<string>();
  vi.spyOn(h.ports, "key").mockImplementation(() => ({ publicKey: h.publicKey, sign: () => signing.promise, delete: async () => {} }));
  const action = h.controller.beginUserAction();
  const operation = action.execute(async (proof, rpc) => rpc.mutation(api.devices.heartbeat, await proof("devices.heartbeat", {})));
  const rejected = expect(operation).rejects.toBeInstanceOf(StaleAccess);
  await vi.waitFor(() => expect(h.events.at(-1)).toBe("devices:prepare")); action.cancel(); signing.resolve("native-double"); await rejected;
  expect(h.controller.getSnapshot().kind).toBe("ready");
  const token = deferred<ConvexHttpClient>(); const transport = vi.fn(); vi.stubGlobal("fetch", transport);
  const scoped = requestScopedRpc(() => token.promise);
  h.rpc.query = scoped.query;
  const second = h.controller.beginUserAction(); const pending = second.execute((_, rpc) => rpc.query(api.authConnection.connection, {}));
  const cancelled = expect(pending).rejects.toBeInstanceOf(StaleAccess);
  second.cancel(); token.resolve(new ConvexHttpClient("http://127.0.0.1:8094", { skipConvexDeploymentUrlCheck: true, logger: false })); await cancelled;
  expect(transport.mock.calls.length).toBe(0); expect(h.controller.getSnapshot().kind).toBe("ready"); vi.unstubAllGlobals();
});

it("blocks unavailable retained-custody observation without inventing deletion or looping", async () => {
  const h = harness(); await h.controller.start();
  h.native.hasRetainedCustody = () => { throw new Error("native storage unavailable"); };
  h.controller.observe({ kind: "signed-out" }, true);
  h.controller.observe({ kind: "signed-out" }, false);
  h.controller.observe({ kind: "signed-out" }, true);
  expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "custody_cleanup_check_unavailable" });
  expect(h.native.state().keyPresent).toBe(true);
  expect(h.native.erase).not.toHaveBeenCalled();
});

it("keeps unresolved self-revocation when wipe wins before its response can persist", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  const held = deferred<unknown>(); h.answers.set("devices:revoke", () => held.promise);
  const request = h.controller.revokeDevice(targetId.parse("device1"));
  const rejected = expect(request).rejects.toBeInstanceOf(StaleAccess);
  await vi.waitFor(() => expect(h.events.at(-1)).toBe("devices:revoke"));
  await h.controller.wipe();
  held.resolve({ kind: "revoked", workId: "not-observed-currently", providerRevocation: { kind: "succeeded", at: 9000 } }); await rejected;
  expect(h.controller.getSnapshot().kind).toBe("signed-out");
  expect(JSON.parse(h.native.readRevocations("fixture")[0]!)).toEqual({ version: 1, revision: 0, deviceId: "device1", outcome: { kind: "response-unknown" } });
});
