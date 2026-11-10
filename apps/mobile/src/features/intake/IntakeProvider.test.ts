import * as React from "react";
import { createElement, useSyncExternalStore } from "react";
import { createHash, randomUUID } from "node:crypto";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";

const boundary = vi.hoisted(() => {
  const bridge: unknown = null;
  return ({ bridge,
  subject: "owner",
  admitted: true, deviceAdmitted: true,
  events: new Map<string, Set<(value: string) => void>>(),
  hints: new Set<(hint: unknown) => void>(),
  memory: new Map<string, string>(),
}); });
vi.mock("expo", () => ({ requireOptionalNativeModule: () => new Proxy({}, { get: (_target, key) => Reflect.get(Object(boundary.bridge), key) }) }));
vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppState: {
  addEventListener(name: string, listener: (value: string) => void) {
    const listeners = boundary.events.get(name) ?? new Set(); listeners.add(listener); boundary.events.set(name, listeners);
    return { remove: () => listeners.delete(listener) };
  },
} }));
vi.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, CryptoEncoding: { BASE64: "base64" },
  randomUUID: () => randomUUID(),
  digestStringAsync: async (_algorithm: string, value: string, options?: { encoding: string }) =>
    options?.encoding === "base64" ? createHash("sha256").update(value).digest("base64") : createHash("sha256").update(value).digest("hex"),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => boundary.memory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { boundary.memory.set(key, value); },
  deleteItemAsync: async (key: string) => { boundary.memory.delete(key); },
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: boundary.subject }) }));
const workspaceRead = { id: "workspace-1", functionalCurrency: "COP", timeZone: "America/Bogota" };
const query = vi.fn(async (reference: Parameters<typeof getFunctionName>[0]) => {
  if (getFunctionName(reference).endsWith(":openWorkspace")) return { ...workspaceRead };
  return [{ id: "account-1", workspaceId: "workspace-1" }];
});
const client = { query };
vi.mock("convex/react", () => ({ useConvex: () => client }));
import { notificationIntake } from "../../../modules/notification-intake";
import { IntakeAdmission, IntakeDeviceAdmission } from "./admission";
import { IntakeProvider, useIntakeService } from "./IntakeProvider";
import { LocalInput, LocalInputLease } from "../../local-auth/localInput";
import { useIntakeCandidates } from "../useIntakeCandidates";
import { clearLocalInput } from "../clearLocalInput";
import { intakeStorageKey } from "./candidates";
import { wipeIntentKey } from "./control";
import { capture, fixture, mapping, now } from "./service.testSupport";
import type { IntakeService } from "./service";
import { intakeOwnerScope } from "./owner";

let root: ReactTestRenderer | undefined;
let service: IntakeService | undefined;
let counts: Array<number | null> = [];
let lease: LocalInputLease;
let f: ReturnType<typeof fixture>;
function Screen({ index }: { index: number }) {
  service = useIntakeService();
  useSyncExternalStore(service.subscribe, service.getSnapshot);
  counts[index] = useIntakeCandidates({ subject: boundary.subject, workspaceId: "workspace-1", currency: "COP" }).count;
  return null;
}
function Tree() {
  return createElement(LocalInput.Provider, { value: lease },
    createElement(IntakeAdmission.Provider, { value: () => boundary.admitted },
      createElement(IntakeDeviceAdmission.Provider, { value: () => boundary.deviceAdmitted },
        createElement(IntakeProvider, null, createElement(Screen, { index: 0 }), createElement(Screen, { index: 1 })))));
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.subject = "owner"; boundary.admitted = true; boundary.deviceAdmitted = true; boundary.events.clear(); boundary.hints.clear(); boundary.memory.clear();
  counts = []; lease = new LocalInputLease("owner", "session"); f = fixture();
  Object.assign(workspaceRead, { functionalCurrency: "COP", timeZone: "America/Bogota" });
  boundary.bridge = { apiVersion: 3, ...f.native, addListener: (_event: string, listener: (hint: unknown) => void) => {
    boundary.hints.add(listener); return { remove: () => boundary.hints.delete(listener) };
  } };
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });
async function mount() { await act(async () => { root = create(createElement(Tree)); }); }
async function emit(name: string, value = "active") { await act(async () => { for (const listener of boundary.events.get(name) ?? []) listener(value); }); }

test("two screens subscribe to one coordinator; foreground, Android focus and hints refresh without navigation", async () => {
  await mount(); expect(counts).toEqual([1, 1]); expect(f.events.filter((e) => e === "page:0")).toHaveLength(1);
  await emit("change"); await emit("focus");
  await act(async () => { for (const listener of boundary.hints) listener({ epoch: "a".repeat(22), changeSequence: 1, kind: "capture" }); });
  expect(counts).toEqual([1, 1]); expect(f.events.filter((e) => e === "page:0")).toHaveLength(4);
  expect(f.events).not.toContain("configure"); expect(query).toHaveBeenCalled();
});

test("the gate's live predicate fences a read before React unmounts the old provider", async () => {
  f.beforeRead(() => { boundary.admitted = false; });
  await mount(); expect(f.state().records).toEqual([]); expect(f.events).toEqual([]);
});

test("a subject switch stops old callbacks and a fresh lease gets a fresh service", async () => {
  await mount(); const previous = service; if (!previous) throw new Error("No service");
  boundary.subject = "other-owner"; lease = new LocalInputLease("other-owner", "new-session");
  await act(async () => { root?.update(createElement(Tree)); });
  expect(service).not.toBe(previous); await expect(previous.refresh()).rejects.toThrow("Intake admission ended");
  expect(counts).toEqual([0, 0]);
  expect(service?.getSnapshot().error).toBe("owner");
});

test("native listener subscriptions are removed when local admission unmounts", async () => {
  await mount(); const previous = service; if (!previous) throw new Error("No service");
  await act(async () => { root?.unmount(); }); root = undefined;
  expect(boundary.hints.size).toBe(0); expect(boundary.events.get("focus")?.size).toBe(0);
  await expect(previous.refresh()).rejects.toThrow("Intake admission ended");
});

test("owner scope is domain separated base64url SHA256 with 43 characters", async () => {
  const scope = await intakeOwnerScope("owner");
  expect(scope).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(scope).not.toBe(createHash("sha256").update("owner").digest("base64url"));
  expect(await intakeOwnerScope("other-owner")).not.toBe(scope);
});


function legacyInput() {
  return { v: 1, candidates: [{ id: "legacy-1", createdAt: now - 100, expiresAt: now + 1000000000,
    workspaceId: "workspace-1", currency: "COP", suggestion: { direction: "out", description: "Legacy receipt", amountMinorUnits: 400,
      accountingDate: "2026-10-23", financialAccountProfileId: "account-1", userCategoryIds: [], primaryUserCategoryId: null },
    parserVersion: "legacy-v1", consentVersion: "v1" }] };
}

test("the installed provider resumes an exact lost-response wipe before any legacy migration", async () => {
  boundary.memory.set(intakeStorageKey("owner"), JSON.stringify(legacyInput()));
  await mount(); if (!service) throw new Error("No service");
  f.loseWipe(); await act(async () => { await expect(service?.disableAndWipe()).rejects.toThrow("wipe response lost"); });
  expect(boundary.memory.has(wipeIntentKey("owner"))).toBe(true);
  expect(boundary.memory.has(intakeStorageKey("owner"))).toBe(true);
  await act(async () => root?.unmount()); root = undefined;
  await mount();
  expect(counts).toEqual([0, 0]); expect(boundary.memory.has(intakeStorageKey("owner"))).toBe(false);
  expect(boundary.memory.has(wipeIntentKey("owner"))).toBe(false);
  expect(f.events.filter((event) => event === "wipe")).toHaveLength(1);
});

test("provider migration recovers a write-before-readback crash and deletes only the proven legacy copy", async () => {
  f.setValue(null, 0); boundary.memory.set(intakeStorageKey("owner"), JSON.stringify(legacyInput()));
  f.afterWrite(() => { boundary.admitted = false; }); await mount();
  expect(boundary.memory.has(intakeStorageKey("owner"))).toBe(true);
  expect(f.state().records.map((row) => row.id)).toEqual(["legacy-1"]);
  await act(async () => root?.unmount()); root = undefined;
  boundary.admitted = true; f.afterWrite(() => {}); await mount();
  expect(boundary.memory.has(intakeStorageKey("owner"))).toBe(false);
  expect(service?.read("legacy-1")?.origin).toEqual({ kind: "legacy" }); expect(counts).toEqual([1, 1]);
});

test.each(["null", "{invalid", '{"v":1,"candidates":[{}]}'])("malformed legacy bytes %s remain intact and fail closed", async (raw) => {
  f.setValue(null, 0); boundary.memory.set(intakeStorageKey("owner"), raw); await mount();
  expect(boundary.memory.get(intakeStorageKey("owner"))).toBe(raw); expect(f.raw()).toBeNull();
  expect(service?.getSnapshot().error).not.toBe(""); expect(f.events).toEqual([]);
});

test("lock after an admitted write prevents ack; fresh unlock reads the saved Candidate", async () => {
  let writes = 0; f.afterWrite(() => { writes += 1; if (writes === 2) boundary.admitted = false; });
  await mount(); expect(f.state().records.map((row) => row.id)).toEqual(["capture-1"]); expect(f.events).not.toContain("ack");
  await act(async () => root?.unmount()); root = undefined;
  boundary.admitted = true; f.afterWrite(() => {}); await mount();
  expect(counts).toEqual([1, 1]); expect(f.events.filter((event) => event === "ack")).toHaveLength(1);
});

test("persisted app cleanup wipes native and legacy input and stale service callbacks remain fenced", async () => {
  await mount(); const previous = service; if (!previous) throw new Error("No service");
  boundary.memory.set(intakeStorageKey("owner"), JSON.stringify(legacyInput()));
  boundary.memory.set("u08.discard-notices.owner", JSON.stringify([{ reason: "Security alert", time: now }]));
  lease.deny(); boundary.admitted = false;
  await act(async () => { await clearLocalInput("owner"); });
  expect(f.raw()).toBeNull(); expect(boundary.memory.has(intakeStorageKey("owner"))).toBe(false);
  expect(boundary.memory.has("u08.discard-notices.owner")).toBe(false);
  await expect(previous.refresh()).rejects.toThrow("Intake admission ended"); expect(f.events).toContain("wipe");
});


test("current device admission fences a continuation even while local unlock remains open", async () => {
  f.beforeRead(() => { boundary.deviceAdmitted = false; }); await mount();
  expect(f.state().records).toEqual([]); expect(f.events).toEqual([]); expect(boundary.admitted).toBe(true);
});


test("lock during an admitted ack prevents the next read stage", async () => {
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0; let ackStarted = false;
  boundary.bridge = { apiVersion: 3, ...f.native,
    addListener: () => ({ remove() {} }),
    readCandidateState: async (input: Parameters<typeof f.native.readCandidateState>[0]) => { reads += 1; return f.native.readCandidateState(input); },
    acknowledge: async (input: Parameters<typeof f.native.acknowledge>[0]) => {
      ackStarted = true; const saved = await f.native.acknowledge(input); await waiting; return saved;
    },
  };
  await mount(); expect(ackStarted).toBe(true); const beforeLock = reads;
  boundary.admitted = false;
  await act(async () => { release?.(); });
  expect(reads).toBe(beforeLock); expect(f.state().records.map((row) => row.id)).toEqual(["capture-1"]);
});

test("SEN90-R1-01 app cleanup remains blocked and durably retryable while the Android module is missing", async () => {
  await mount(); const before = f.raw(); boundary.memory.set(intakeStorageKey("owner"), JSON.stringify(legacyInput()));
  const status = vi.spyOn(notificationIntake, "getStatus").mockResolvedValue({ supported: false, reason: "native_module_missing" });
  lease.deny(); boundary.admitted = false;
  try {
    await expect(clearLocalInput("owner")).rejects.toMatchObject({ code: "NATIVE_WIPE_REQUIRED" });
    expect(f.raw()).toBe(before); expect(boundary.memory.has(intakeStorageKey("owner"))).toBe(true);
    expect(JSON.parse(boundary.memory.get(wipeIntentKey("owner")) ?? "null")).toEqual({ kind: "native_required" });
  } finally { status.mockRestore(); }
  await clearLocalInput("owner");
  expect(f.raw()).toBeNull(); expect(boundary.memory.has(wipeIntentKey("owner"))).toBe(false);
  expect(boundary.memory.has(intakeStorageKey("owner"))).toBe(false);
});

const bogotaOctober31At2350 = Date.parse("2026-11-01T04:50:00Z");
async function restart() {
  await act(async () => root?.unmount()); root = undefined;
  await mount();
  if (!service) throw new Error("No service");
  return service;
}
async function settle<T>(work: () => Promise<T>) {
  let result: T | undefined;
  await act(async () => { result = await work(); });
  return result as T;
}

test("a Candidate waiting when the time zone changes confirms after a restart with the day it was captured", async () => {
  f.setPages([{ captures: [{ ...capture, notificationAt: bogotaOctober31At2350 }], nextCursor: null }]);
  await mount();
  expect(service?.read("capture-1")?.review.accountingDate).toBe("2026-10-31");
  workspaceRead.timeZone = "Pacific/Auckland";
  const restarted = await restart();
  const command = await settle(() => restarted.beginConfirmation("capture-1", 0));
  expect([command.confirmed.accountingDate, command.suggestion.accountingDate]).toEqual(["2026-10-31", "2026-10-31"]);
  expect(restarted.read("capture-1")?.status.kind).toBe("submitting");
});

test("alerts from a source set up under the old time zone keep arriving, dated in the new zone, without a new source version", async () => {
  await mount();
  expect(service?.read("capture-1")?.review.accountingDate).toBe("2026-10-23");
  workspaceRead.timeZone = "Pacific/Auckland";
  f.setPages([{ captures: [{ ...capture, captureId: "capture-2", notificationAt: bogotaOctober31At2350 }], nextCursor: null }]);
  const restarted = await restart();
  expect(restarted.getSnapshot().drain).toEqual({ unresolved: 0, conflicts: 0 });
  expect(restarted.read("capture-2")?.review.accountingDate).toBe("2026-11-01");
  expect(restarted.read("capture-1")?.review.accountingDate).toBe("2026-10-23");
  expect(f.state().mappings).toEqual([mapping]);
  expect(f.events).not.toContain("configure");
  expect(await settle(() => restarted.beginConfirmation("capture-2", 0))).toMatchObject({ confirmed: { accountingDate: "2026-11-01" } });
});

test("a workspace in another currency still refuses waiting Candidates and new alerts", async () => {
  await mount(); if (!service) throw new Error("No service");
  const current = service;
  workspaceRead.timeZone = "Pacific/Auckland"; workspaceRead.functionalCurrency = "USD";
  await act(async () => { await expect(current.beginConfirmation("capture-1", 0)).rejects.toThrow("Candidate account mapping is unavailable"); });
  expect(current.read("capture-1")?.status.kind).toBe("review");
  f.setPages([{ captures: [{ ...capture, captureId: "capture-2" }], nextCursor: null }]);
  expect(await settle(() => current.refresh())).toEqual({ saved: 0, unresolved: 1, conflicts: 0 });
  expect(current.read("capture-2")).toBeNull();
});

test("a confirmation already sent stays frozen exactly through a time-zone change and a restart", async () => {
  await mount(); if (!service) throw new Error("No service");
  const current = service;
  const command = await settle(() => current.beginConfirmation("capture-1", 0));
  const frozen = f.state().records[0];
  workspaceRead.timeZone = "Pacific/Auckland";
  const restarted = await restart();
  expect(await settle(() => restarted.beginConfirmation("capture-1", 0))).toEqual(command);
  const row = restarted.read("capture-1"); if (!row) throw new Error("Missing frozen Candidate");
  await act(async () => { await expect(restarted.updateReview("capture-1", row.recordRevision, { ...row.review, description: "Changed" })).rejects.toThrow("Confirmation frozen"); });
  expect(f.state().records[0]).toEqual(frozen);
});
