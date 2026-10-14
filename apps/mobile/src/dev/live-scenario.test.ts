import { beforeEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { parseManifest, runLiveScenario } from "./live-scenario";
import type { ScenarioManifest, ScenarioAdmission } from "./live-scenario";
import type { AccessController, Rpc } from "../access/controller";

const baseline: ScenarioManifest = { contract: "lukapp-live-public-scenario@1", scenarioId: "closed-public-requests", platform: "ios",
  coordinatorAssertion: { deployedSha: "a".repeat(40), deploymentReceipt: "independent-coordinator-receipt", appEvidence: { sourceSha: "b".repeat(40), sourceTree: "c".repeat(40),
    buildReceipt: "independent-exact-app-build-receipt", nativeArtifactSha256: "d".repeat(64), jsSourceReceipt: "independent-exact-metro-source-receipt" } },
  steps: [{ id: "household", operation: "accounting.createHouseholdWorkspace", args: { functionalCurrency: "COP", idempotencyKey: "unchanged-household-key", now: 1791936000000 }, expect: { result: { kind: "Household", functionalCurrency: "COP" } } },
    { id: "balances", operation: "accounting.balances", args: { workspaceId: { $ref: { stepId: "household", field: "workspaceId" } } }, expect: { result: [] } }] };
beforeEach(() => vi.stubGlobal("__DEV__", true));
test("preflights the whole closed manifest before executing any request", () => {
  expect(parseManifest(baseline, "ios").steps).toHaveLength(2);
  expect(() => parseManifest({ ...baseline, actor: { userId: "spoof" } }, "ios")).toThrow();
  expect(() => parseManifest({ ...baseline, platform: "android" }, "ios")).toThrow();
  const invalid = structuredClone(baseline);
  invalid.steps[1]!.args.userId = "spoof";
  expect(() => parseManifest(invalid, "ios")).toThrow("scenario_arguments_invalid");
  expect(() => parseManifest({ ...baseline, steps: [{ ...baseline.steps[0], operation: "devices.revoke" }] }, "ios")).toThrow("scenario_operation_denied");
  expect(() => parseManifest({ ...baseline, steps: [{ ...baseline.steps[0], args: { ...baseline.steps[0]!.args, access: {} } }] }, "ios")).toThrow("scenario_operation_denied");
});
test("references cannot read arbitrary paths, future results or a token from another operation", () => {
  for (const ref of [{ stepId: "household", field: "constructor" }, { stepId: "future", field: "workspaceId" }, { stepId: "household", field: "revisionToken" }]) {
    const manifest = structuredClone(baseline);
    manifest.steps[1]!.args.workspaceId = { $ref: ref };
    expect(() => parseManifest(manifest, "ios")).toThrow();
  }
});
test("only a public preview token can feed confirmed reclassification revisionToken", () => {
  const preview = { id: "preview", operation: "accounting.previewCategoryReclassification", args: { workspaceId: "workspace", categoryId: "category",
    target: { kind: "category", nature: "Income", accountCode: "42201001" }, currentDate: "2026-10-14" }, expect: { result: { categoryId: "category" } } };
  const confirm = { id: "confirm", operation: "accounting.confirmCategoryReclassification", args: { ...preview.args,
    revisionToken: { $ref: { stepId: "preview", field: "revisionToken" } }, confirmed: true, idempotencyKey: "confirm-once" }, expect: { result: { replay: false } } };
  expect(parseManifest({ ...baseline, steps: [preview, confirm] }, "ios").steps).toHaveLength(2);
});
function runtime(changeAfterFirst = false, deny: false | "domain" | "transport" | "invalidate" = false) {
  let state: ScenarioAdmission = { kind: "ready", workspaceId: "personal", contact: { epoch: 5, generation: 7 } };
  const calls: { kind: string; path: string; args: unknown }[] = [];
  const execute: AccessController["execute"] = async work => {
    const proof = vi.fn().mockImplementation(async (operation: string, request: object) => {
      calls.push({ kind: "proof", path: operation, args: request });
      return { ...request, access: { challengeId: "challenge", signature: "new-native-signature" } };
    });
    const query = vi.fn<Rpc["query"]>().mockImplementation(async (ref, args) => {
      calls.push({ kind: "query", path: getFunctionName(ref), args });
      return getFunctionName(ref) === "authConnection:connection" ? { status: "owner", clerkSubject: "actual-owner" } : [];
    });
    const mutation = vi.fn<Rpc["mutation"]>().mockImplementation(async (ref, args) => {
      calls.push({ kind: "mutation", path: getFunctionName(ref), args });
      if (deny === "transport") throw new Error("private transport detail not logged");
      if (deny === "invalidate") state = { kind: "locked" };
      if (deny === "domain" || deny === "invalidate") throw new ConvexError({ code: "locked_period", message: "not logged" });
      if (changeAfterFirst) state = { kind: "locked" };
      return { id: "isolated-household", kind: "Household", functionalCurrency: "COP" };
    });
    const action = vi.fn<Rpc["action"]>().mockRejectedValue(new Error("no actions in the financial driver"));
    const rpc: Rpc = { query, mutation, action };
    return work(proof, rpc);
  };
  return { calls, context: { controller: { getSnapshot: () => state, execute }, fixture: false, platform: "ios" as const,
    native: () => ({ mode: "live", generation: 7, wipePending: false, protection: "simulator-native-software-key" }) } };
}
test("each ordered step uses the controller proof path and keeps coordinator deployment assertions separate", async () => {
  const { calls, context } = runtime();
  const receipt = await runLiveScenario(baseline, context);
  expect(receipt.status).toBe("passed");
  expect(receipt.deploymentIndependentlyVerifiedByDriver).toBe(false);
  expect(receipt.ownerSubject).toBe("actual-owner");
  expect(calls.filter(call => call.kind === "proof").map(call => call.path)).toEqual(["accounting.createHouseholdWorkspace", "accounting.balances"]);
  expect(calls.at(-1)?.args).toEqual({ workspaceId: "isolated-household", access: { challengeId: "challenge", signature: "new-native-signature" } });
});
test("invalidated admission stops before later steps; safe denial codes never retain exception text", async () => {
  const changed = runtime(true);
  const receipt = await runLiveScenario(baseline, changed.context);
  expect(receipt.status).toBe("stopped");
  expect(receipt.steps).toEqual([expect.objectContaining({ id: "household", errorCode: "scenario_admission_invalidated", assertionPassed: false })]);
  expect(changed.calls.some(call => call.path === "accounting:balances")).toBe(false);
  const denied = runtime(false, "domain");
  const negative = { ...baseline, steps: [{ ...baseline.steps[0]!, expect: { errorCode: "locked_period" } }] };
  const deniedReceipt = await runLiveScenario(negative, denied.context);
  expect(deniedReceipt.status).toBe("passed");
  expect(deniedReceipt.steps[0]).toMatchObject({ errorCode: "locked_period", assertionPassed: true });
  expect(JSON.stringify(deniedReceipt)).not.toContain("not logged");
});
test("fixture mode and production cannot run this real-provider driver", async () => {
  const { context } = runtime();
  await expect(runLiveScenario(baseline, { ...context, fixture: true })).rejects.toThrow("live_development_only");
  vi.stubGlobal("__DEV__", false);
  await expect(runLiveScenario(baseline, context)).rejects.toThrow("live_development_only");
});

test("unexpected public result stops before subsequent mutation or query", async () => {
  const { context, calls } = runtime();
  const unexpected = structuredClone(baseline);
  unexpected.steps[0]!.expect = { result: { functionalCurrency: "USD" } };
  const receipt = await runLiveScenario(unexpected, context);
  expect(receipt.status).toBe("stopped");
  expect(receipt.steps[0]).toMatchObject({ assertionPassed: false, errorCode: "scenario_assertion_failed" });
  expect(calls.some(call => call.path === "accounting:balances")).toBe(false);
});

test("approved domain rejection passes and continues, while invalidation and transport failure always stop", async () => {
  const manifest = { ...baseline, steps: [
    { ...baseline.steps[0]!, expect: { errorCode: "locked_period" } },
    { id: "after-negative", operation: "accounting.balances", args: { workspaceId: "isolated-household" }, expect: { result: [] } },
  ] };
  const domain = runtime(false, "domain");
  const accepted = await runLiveScenario(manifest, domain.context);
  expect(accepted.status).toBe("passed");
  expect(accepted.steps.map(item => item.assertionPassed)).toEqual([true, true]);
  expect(domain.calls.at(-1)?.path).toBe("accounting:balances");
  expect(accepted.coordinatorAssertion.appEvidence.buildReceipt).toBe("independent-exact-app-build-receipt");
  expect(accepted.appBuildIndependentlyVerifiedByDriver).toBe(false);
  for (const denial of ["invalidate", "transport"] as const) {
    const failed = runtime(false, denial);
    const stopped = await runLiveScenario(manifest, failed.context);
    expect(stopped.status).toBe("stopped");
    expect(stopped.steps).toHaveLength(1);
    expect(stopped.steps[0]?.assertionPassed).toBe(false);
    expect(failed.calls.some(call => call.path === "accounting:balances")).toBe(false);
  }
  expect(() => parseManifest({ ...baseline, steps: [{ ...baseline.steps[0], expect: { errorCode: "scenario_admission_invalidated" } }] }, "ios")).toThrow();
});
