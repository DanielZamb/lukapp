import { act, create } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import { createElement } from "react";
import { expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Rpc } from "../access/controller";
const model = vi.hoisted(() => ({ runtime: {} }));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../access/RuntimeProvider", () => ({ useRuntime: () => model.runtime }));
vi.mock("../access/native", () => ({ custody: { state: () => ({ mode: "live", generation: 2, wipePending: false, protection: "unit-double" }) } }));
vi.mock("../ui", () => ({ Copy: "copy", SecondaryButton: "button" }));
import { LiveVerification } from "./LiveVerification";
import { deferred } from "../access/controller.test-support";
import type { AccessController } from "../access/controller";

it("does not execute a manifest loaded by an unmounted tap after a later admission", async () => {
  vi.stubGlobal("__DEV__", true); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const held = deferred<Response>();
  const mutation = vi.fn<Rpc["mutation"]>().mockResolvedValue({ kind: "Household", functionalCurrency: "COP" });
  const query = vi.fn<Rpc["query"]>().mockImplementation(async reference => getFunctionName(reference) === "authConnection:connection" ? { status: "owner", clerkSubject: "owner" } : []);
  const action = vi.fn<Rpc["action"]>();
  let snapshot = { kind: "ready" as const, workspaceId: "workspace1", contact: { epoch: 1, generation: 2 } };
  const execute = vi.fn<AccessController["execute"]>().mockImplementation(async work => work(vi.fn(), { query, mutation, action }));
  model.runtime = { controller: { getSnapshot: () => snapshot, execute, beginUserAction: () => {
    const initial = snapshot; const abort = new AbortController();
    return { workspaceId: initial.workspaceId, signal: abort.signal, cancel: () => abort.abort(), execute,
      assertCurrent: () => { if (abort.signal.aborted || initial !== snapshot) throw new Error("cancelled"); } };
  } }, fixture: false };
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => options?.method === "POST" ? Response.json({}) : held.promise));
  let renderer: ReactTestRenderer | undefined;
  await act(async () => { renderer = create(createElement(LiveVerification)); });
  await act(async () => { renderer!.root.findByType("button").props.onPress(); });
  await act(async () => { renderer!.unmount(); });
  snapshot = { ...snapshot, contact: { epoch: 3, generation: 2 } };
  const manifest = { contract: "lukapp-live-public-scenario@1", scenarioId: "cancelled-tap", platform: "ios",
    coordinatorAssertion: { deployedSha: "a".repeat(40), deploymentReceipt: "coordinator", appEvidence: { sourceSha: "b".repeat(40), sourceTree: "c".repeat(40), buildReceipt: "build", nativeArtifactSha256: "d".repeat(64), jsSourceReceipt: "js" } },
    steps: [{ id: "household", operation: "accounting.createHouseholdWorkspace", args: { functionalCurrency: "COP", idempotencyKey: "one-tap", now: 1791936000000 }, expect: { result: { kind: "Household", functionalCurrency: "COP" } } }] };
  await act(async () => { held.resolve(Response.json(manifest)); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(mutation.mock.calls.length).toBe(0);
  expect(snapshot.contact.epoch).toBe(3);
  vi.unstubAllGlobals();
});
