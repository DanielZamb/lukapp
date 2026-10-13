import { describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { createHash } from "node:crypto";
import { getFunctionName } from "convex/server";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import { AccessController, StaleAccess } from "./controller";
import type { ControllerCustody, Rpc } from "./controller";
import type { NativeState } from "./native";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function harness() {
  let state: NativeState = { mode: "fixture", generation: 0, unlocked: false, wipePending: false, installed: true,
    workspaceId: null, keyPresent: true, protection: "unit-double", savedWorkspaceId: null };
  let biometricWindow = false;
  let enrollmentDigest: string | null = null;
  const block = () => { biometricWindow = false; state = { ...state, generation: state.generation + 1, unlocked: false, workspaceId: null }; };
  const native: ControllerCustody = {
    state: () => state, initialize: async () => state,
    lock: block, closeInput: () => { state = { ...state, generation: state.generation + 1, unlocked: false, workspaceId: null }; },
    touch: vi.fn(), unlock: vi.fn(async () => { block(); biometricWindow = true; state = { ...state, unlocked: true }; return state; }),
    resumeAdmission: () => { if (!biometricWindow) return null; state = { ...state, unlocked: true }; return state; },
    recoveryPending: () => false, setRecoveryPending: vi.fn(async () => {}),
    recoveryIntent: () => null, setRecoveryIntent: vi.fn(async () => {}),
    enrollmentPending: digest => enrollmentDigest === digest,
    setEnrollmentPending: vi.fn(async digest => { enrollmentDigest = digest; }),
    openInput: vi.fn(async (workspaceId, generation) => {
      if (!state.unlocked || state.generation !== generation || state.wipePending) throw new StaleAccess();
      state = { ...state, workspaceId };
    }),
    beginWipe: vi.fn(async () => { block(); state = { ...state, wipePending: true }; }),
    erase: vi.fn(async () => { state = { ...state, keyPresent: false, workspaceId: null }; }),
    finishWipe: vi.fn(async () => { state = { ...state, wipePending: false }; }),
  };
  const events: string[] = [];
  const answers = new Map<string, () => unknown>([
    ["clerkProvider:checkSession", () => ({ kind: "active" })],
    ["devices:status", () => ({ kind: "registered", device: { id: "device1", name: "Unit", platform: "ios", createdAt: 1, lastSeenAt: 1000, state: { kind: "active" } } })],
    ["devices:prepare", () => ({ challengeId: "challenge1", expiresAt: 5000, message: "unit challenge" })],
    ["devices:heartbeat", () => ({ id: "device1", name: "Unit", platform: "ios", createdAt: 1, lastSeenAt: 1000, state: { kind: "active" } })],
    ["accounting:localInputAuthority", () => ({ kind: "ready", workspaceId: "workspace1" })],
  ]);
  const dispatch = async <R extends FunctionReference<"query" | "mutation" | "action", "public">>(ref: R): Promise<FunctionReturnType<R>> => {
    const name = getFunctionName(ref); events.push(name);
    const answer = answers.get(name);
    if (!answer) throw new Error("Unexpected unit transport " + name);
    return await answer() as FunctionReturnType<R>;
  };
  const rpc: Rpc = { query: dispatch, mutation: dispatch, action: dispatch };
  const clearMemory = vi.fn(); const signOut = vi.fn(async () => {});
  const publicKey = vi.fn(async () => { state = { ...state, keyPresent: true }; return "unit-public-key"; });
  const controller = new AccessController({ native, rpc, hash: { sha256Utf8: async message => createHash("sha256").update(message).digest("hex") },
    key: () => ({ publicKey, sign: async () => "unit-signature", delete: async () => {} }),
    clearMemory, signOut, platform: "ios", mode: "fixture" });
  return { controller, native, rpc, events, answers, clearMemory, signOut, publicKey,
    setNativeState: (next: Partial<NativeState>) => { state = { ...state, ...next }; } };
}
async function begin(h: ReturnType<typeof harness>) {
  await h.controller.start(); h.controller.context("unit-session", true);
}
describe("access controller races and authority ordering (native unit double)", () => {
  it("keeps storage closed until provider, status, possession heartbeat and Workspace authority finish", async () => {
    const h = harness(); await begin(h);
    const authority = deferred<unknown>(); h.answers.set("accounting:localInputAuthority", () => authority.promise);
    const admission = h.controller.admit();
    await vi.waitFor(() => expect(h.events.at(-1)).toBe("accounting:localInputAuthority"));
    expect(h.native.openInput).not.toHaveBeenCalled();
    expect(h.controller.getSnapshot().kind).toBe("checking");
    authority.resolve({ kind: "ready", workspaceId: "workspace1" }); await admission;
    expect(h.events).toEqual(["clerkProvider:checkSession", "devices:status", "devices:status", "devices:prepare", "devices:heartbeat", "devices:prepare", "accounting:localInputAuthority"]);
    expect(h.native.openInput).toHaveBeenCalledWith("workspace1", h.native.state().generation, 1000);
    expect(h.controller.getSnapshot()).toMatchObject({ kind: "ready", workspaceId: "workspace1" });
  });
  it.each(["lock", "session", "workspace", "disconnect", "wipe"])("rejects a late admission after %s", async reason => {
    const h = harness(); await begin(h);
    const provider = deferred<unknown>(); h.answers.set("clerkProvider:checkSession", () => provider.promise);
    const admission = h.controller.admit();
    await vi.waitFor(() => expect(h.events).toContain("clerkProvider:checkSession"));
    if (reason === "lock") h.controller.lock();
    if (reason === "session") h.controller.context("replacement-session", true);
    if (reason === "workspace") h.controller.workspace("workspace2");
    if (reason === "disconnect") h.controller.context("unit-session", false);
    if (reason === "wipe") await h.controller.wipe();
    provider.resolve({ kind: "active" }); await admission;
    expect(h.controller.getSnapshot().kind).not.toBe("ready");
    expect(h.native.openInput).not.toHaveBeenCalled();
    expect(h.events).not.toContain("devices:status");
    expect(h.clearMemory).toHaveBeenCalled();
  });
  it("blocks unavailable provider without deleting input, and wipes a known terminal denial", async () => {
    const h = harness(); await begin(h);
    h.answers.set("clerkProvider:checkSession", () => ({ kind: "unavailable", code: "provider_unavailable" }));
    await h.controller.admit(); expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "provider_unavailable" });
    expect(h.native.erase).not.toHaveBeenCalled();
    h.answers.set("clerkProvider:checkSession", () => ({ kind: "denied", code: "session_ended" }));
    await h.controller.admit(); expect(h.controller.getSnapshot().kind).toBe("signed-out");
    expect(h.native.beginWipe).toHaveBeenCalledOnce(); expect(h.native.erase).toHaveBeenCalledOnce(); expect(h.signOut).toHaveBeenCalledOnce();
  });
  it("does not dispatch a financial mutation after its proof races a lock", async () => {
    const h = harness(); await begin(h); await h.controller.admit();
    const challenge = deferred<unknown>(); h.answers.set("devices:prepare", () => challenge.promise);
    const operation = h.controller.execute(async (proof, rpc) => rpc.mutation(api.devices.heartbeat, await proof("devices.heartbeat", {})));
    await vi.waitFor(() => expect(h.events.at(-1)).toBe("devices:prepare"));
    h.controller.lock(); challenge.resolve({ challengeId: "late", expiresAt: 5000, message: "late" });
    await expect(operation).rejects.toBeInstanceOf(StaleAccess);
    expect(h.events.filter(name => name === "devices:heartbeat")).toHaveLength(1);
  });
  it("blocks a permission rejection without deleting drafts", async () => {
    const h = harness(); await begin(h); await h.controller.admit();
    h.answers.set("devices:heartbeat", () => { throw new ConvexError({ code: "workspace_permission_required" }); });
    await expect(h.controller.execute(async (proof, rpc) => rpc.mutation(api.devices.heartbeat, await proof("devices.heartbeat", {})))).rejects.toBeInstanceOf(ConvexError);
    expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "workspace_permission_required" });
    expect(h.native.erase).not.toHaveBeenCalled();
  });
  it("keeps an interrupted wipe dominant and resumes it on cold start", async () => {
    const h = harness(); await begin(h);
    vi.mocked(h.native.erase).mockRejectedValueOnce(new Error("input_deletion_failed"));
    await h.controller.wipe(); expect(h.native.state().wipePending).toBe(true);
    await h.controller.admit(); expect(h.native.openInput).not.toHaveBeenCalled();
    await h.controller.start(); expect(h.native.state().wipePending).toBe(false);
    expect(h.native.erase).toHaveBeenCalledTimes(2); expect(h.controller.getSnapshot().kind).toBe("signed-out");
  });
  it("rejects a cold-start completion after its runtime is closed", async () => {
    const h = harness();
    const initial = h.native.state(); const initialization = deferred<NativeState>();
    h.native.initialize = () => initialization.promise;
    const start = h.controller.start(); h.controller.lock(); initialization.resolve(initial);
    await expect(start).rejects.toBeInstanceOf(StaleAccess);
    expect(h.controller.getSnapshot()).toEqual({ kind: "locked" });
    expect(h.events).toEqual([]); expect(h.native.openInput).not.toHaveBeenCalled();
  });
  it("retries an interrupted initial enrollment in the same Session without creating another binding", async () => {
    const h = harness(); h.setNativeState({ keyPresent: false }); await begin(h);
    let bindings = 0;
    h.answers.set("devices:status", () => bindings ? { kind: "registered", device: { id: "device1", state: { kind: "active" } } } : { kind: "denied", code: "device_registration_required", directive: "register-device" });
    h.answers.set("devices:register", vi.fn().mockRejectedValueOnce(new Error("Interrupted before handler")).mockImplementation(() => { bindings++; return { id: "device1" }; }));
    await h.controller.admit(); expect(bindings).toBe(0); expect(h.native.openInput).not.toHaveBeenCalled();
    await h.controller.admit(); expect(bindings).toBe(1); expect(h.controller.getSnapshot().kind).toBe("ready");
    expect(h.native.setEnrollmentPending).toHaveBeenLastCalledWith(null, h.native.state().generation);
  });
  it("does not reuse an interrupted enrollment key after the provider Session changes", async () => {
    const h = harness(); h.setNativeState({ keyPresent: false }); await begin(h);
    h.answers.set("devices:status", () => ({ kind: "denied", code: "device_registration_required", directive: "register-device" }));
    h.answers.set("devices:register", () => { throw new Error("Interrupted before handler"); });
    await h.controller.admit(); h.controller.context("different-session", true); await h.controller.admit();
    expect(h.controller.getSnapshot()).toEqual({ kind: "blocked", code: "old_binding_revoke_required" });
    expect(h.events.filter(name => name === "devices:register")).toHaveLength(1);
    expect(h.native.openInput).not.toHaveBeenCalled();
  });
  it("cannot publish an old mode's held authority or touch the new mode after disposal", async () => {
    const h = harness(); await begin(h);
    const authority = deferred<unknown>(); h.answers.set("accounting:localInputAuthority", () => authority.promise);
    const admission = h.controller.admit();
    await vi.waitFor(() => expect(h.events.at(-1)).toBe("accounting:localInputAuthority"));
    const lock = vi.spyOn(h.native, "lock");
    h.setNativeState({ mode: "live", generation: h.native.state().generation + 1, unlocked: true, workspaceId: "live-workspace" });
    h.controller.dispose(); h.controller.activity(); h.controller.context("old-session", true); await h.controller.admit();
    authority.resolve({ kind: "ready", workspaceId: "fixture-workspace" }); await admission;
    expect(lock).not.toHaveBeenCalled(); expect(h.native.touch).not.toHaveBeenCalled(); expect(h.native.openInput).not.toHaveBeenCalled();
    expect(h.native.state()).toMatchObject({ mode: "live", unlocked: true, workspaceId: "live-workspace" });
    expect(h.controller.getSnapshot()).toEqual({ kind: "locked" });
  });
});
