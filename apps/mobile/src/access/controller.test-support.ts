import { vi } from "vitest";
import { createHash } from "node:crypto";
import { getFunctionName } from "convex/server";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { AccessController, StaleAccess } from "./controller";
import type { ControllerCustody, Rpc } from "./controller";
import type { NativeState } from "./native";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
export function harness() {
  let state: NativeState = { mode: "fixture", generation: 0, unlocked: false, wipePending: false, installed: true,
    workspaceId: null, keyPresent: true, protection: "unit-double", savedWorkspaceId: null };
  let biometricWindow = false;
  let enrollmentDigest: string | null = null;
  let recoveryIntent: ReturnType<ControllerCustody["recoveryIntent"]> = null;
  let recoveryWork: ReturnType<ControllerCustody["recoveryWork"]> = null;
  const block = () => { biometricWindow = false; state = { ...state, generation: state.generation + 1, unlocked: false, workspaceId: null }; };
  const native: ControllerCustody = {
    state: () => state, initialize: async () => state,
    lock: block, closeInput: () => { state = { ...state, generation: state.generation + 1, unlocked: false, workspaceId: null }; },
    touch: vi.fn(), unlock: vi.fn(async () => { block(); biometricWindow = true; state = { ...state, unlocked: true }; return state; }),
    resumeAdmission: () => { if (!biometricWindow) return null; state = { ...state, unlocked: true }; return state; },
    recoveryPending: () => recoveryIntent !== null,
    setRecoveryPending: vi.fn(async pending => { recoveryIntent = pending ? "retrieve" : null; }),
    recoveryIntent: () => recoveryIntent, setRecoveryIntent: vi.fn(async id => { recoveryIntent = id; }),
    recoveryWork: () => recoveryWork, setRecoveryWork: vi.fn(async id => { recoveryWork = id; }),
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
  const ports = { native, rpc, hash: { sha256Utf8: async (message: string) => createHash("sha256").update(message).digest("hex") },
    key: () => ({ publicKey, sign: async () => "unit-signature", delete: async () => {} }),
    clearMemory, signOut, platform: "ios" as const, mode: "fixture" as const };
  const controller = new AccessController(ports);
  return { controller, ports, native, rpc, events, answers, clearMemory, signOut, publicKey,
    setNativeState: (next: Partial<NativeState>) => { state = { ...state, ...next }; } };
}
export async function begin(h: ReturnType<typeof harness>) {
  await h.controller.start(); h.controller.context("unit-session", true);
}
