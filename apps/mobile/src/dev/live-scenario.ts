import { z } from "zod";
import { ConvexError } from "convex/values";
import type { Value } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import { operations } from "../../../../src/access/protocol";
import type { AccessController, AccessState } from "../access/controller";
import { publicConfig } from "../access/public-config";
import generatedContract from "./public-contract.json";

type Json = z.infer<ReturnType<typeof z.json>>;
type Schema = { type: "null" | "number" | "boolean" | "string" }
  | { type: "literal"; value: string | number | boolean | null }
  | { type: "array"; value: Schema }
  | { type: "union"; value: Schema[] }
  | { type: "object"; value: Record<string, { fieldType: Schema; optional: boolean }> }
  | { type: "record"; keys: Schema; values: { fieldType: Schema; optional: false } };
const schema: z.ZodType<Schema> = z.lazy(() => z.discriminatedUnion("type", [
  z.strictObject({ type: z.enum(["null", "number", "boolean", "string"]) }),
  z.strictObject({ type: z.literal("literal"), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) }),
  z.strictObject({ type: z.literal("array"), value: schema }),
  z.strictObject({ type: z.literal("union"), value: z.array(schema).min(1) }),
  z.strictObject({ type: z.literal("object"), value: z.record(z.string(), z.strictObject({ fieldType: schema, optional: z.boolean() })) }),
  z.strictObject({ type: z.literal("record"), keys: schema, values: z.strictObject({ fieldType: schema, optional: z.literal(false) }) }),
]));
const contract = z.partialRecord(z.enum(operations), z.strictObject({ kind: z.enum(["query", "mutation"]), args: schema })).parse(generatedContract);
const referenceFields = ["workspaceId", "profileId", "journalEntryId", "categoryId", "budgetId", "planId", "contributionId", "proposalId", "revisionToken"] as const;
const reference = z.strictObject({ $ref: z.strictObject({ stepId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), field: z.enum(referenceFields) }) });
export const expectedDomainErrors = ["opening_amount_invalid", "financial_account_profile_not_found", "locked_period", "idempotency_key_conflict",
  "category_revision_stale", "category_inactive", "reclassification_stale", "budget_cardinality_conflict", "budget_revision_stale", "recovery_plan_inactive"] as const;
const step = z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), operation: z.enum(operations), args: z.record(z.string(), z.json()),
  expect: z.union([z.strictObject({ result: z.json() }), z.strictObject({ errorCode: z.enum(expectedDomainErrors) }), z.strictObject({ returnedId: z.enum(["planId", "contributionId", "proposalId"]) })]) });
export const manifestSchema = z.strictObject({ contract: z.literal("lukapp-live-public-scenario@1"), scenarioId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  platform: z.enum(["ios", "android"]), coordinatorAssertion: z.strictObject({ deployedSha: z.string().regex(/^[a-f0-9]{40}$/), deploymentReceipt: z.string().min(1).max(300),
    appEvidence: z.strictObject({ sourceSha: z.string().regex(/^[a-f0-9]{40}$/), sourceTree: z.string().regex(/^[a-f0-9]{40}$/),
      buildReceipt: z.string().min(1).max(300), nativeArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/), jsSourceReceipt: z.string().min(1).max(300) }) }),
  steps: z.array(step).min(1).max(100),
});
export type ScenarioManifest = z.infer<typeof manifestSchema>;
class ScenarioFailure extends Error { constructor(readonly code: string) { super(code); } }
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function matches(spec: Schema, value: unknown): boolean {
  switch (spec.type) {
    case "null": return value === null;
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "string": return typeof value === "string";
    case "literal": return value === spec.value;
    case "array": return Array.isArray(value) && value.every(item => matches(spec.value, item));
    case "union": return spec.value.some(member => matches(member, value));
    case "object": return object(value) && Object.keys(value).every(key => Object.hasOwn(spec.value, key)) &&
      Object.entries(spec.value).every(([key, field]) => value[key] === undefined ? field.optional : matches(field.fieldType, value[key]));
    case "record": return object(value) && Object.entries(value).every(([key, item]) => matches(spec.keys, key) && matches(spec.values.fieldType, item));
  }
}
function equals(actual: unknown, expected: Json): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => equals(actual[index], item));
  if (object(expected)) return object(actual) && Object.entries(expected).every(([key, item]) => equals(actual[key], z.json().parse(item)));
  return actual === expected;
}
const resultReferences: Record<string, Partial<Record<typeof referenceFields[number], readonly string[]>>> = {
  "accounting.createPersonalWorkspace": { workspaceId: ["id"] },
  "accounting.createHouseholdWorkspace": { workspaceId: ["id"] },
  "accounting.openWorkspace": { workspaceId: ["id"] },
  "accounting.personalWorkspace": { workspaceId: ["workspace", "id"] },
  "accounting.createFinancialAccountProfile": { profileId: ["id"] },
  "accounting.setupFinancialAccount": { profileId: ["profile", "id"], journalEntryId: ["journalEntry", "id"] },
  "accounting.recordOpeningPosition": { profileId: ["profile", "id"], journalEntryId: ["journalEntry", "id"] },
  "accounting.recordCashExpense": { journalEntryId: ["id"] },
  "accounting.recordCashIncome": { journalEntryId: ["id"] },
  "accounting.recordAccountTransfer": { journalEntryId: ["id"] },
  "accounting.reversePostedEntry": { journalEntryId: ["id"] },
  "accounting.createUserCategory": { categoryId: ["category", "id"] },
  "budget.createBudget": { budgetId: ["budget", "id"] },
  "budget.updateBudget": { budgetId: ["budget", "id"] },
  "budget.retireBudget": { budgetId: ["budget", "id"] },
  "savingsRecovery.saveDraft": { planId: [] },
  "savingsRecovery.replacePlan": { planId: [] },
  "savingsRecovery.recordContribution": { contributionId: [] },
  "savingsRecovery.proposeAllocation": { proposalId: [] },
  "accounting.previewCategoryReclassification": { revisionToken: ["revisionToken"] },
};
function capture(operation: string, result: unknown) {
  const fields = new Map<typeof referenceFields[number], string>();
  for (const field of referenceFields) {
    const path = resultReferences[operation]?.[field];
    if (!path) continue;
    let value = result;
    for (const segment of path) value = object(value) ? value[segment] : undefined;
    if (typeof value === "string" && value.length > 0 && value.length <= (field === "revisionToken" ? 20000 : 200)) fields.set(field, value);
  }
  return fields;
}
const destinations: Record<typeof referenceFields[number], readonly string[]> = {
  workspaceId: ["workspaceId"], profileId: ["financialAccountProfileId", "fromFinancialAccountProfileId", "toFinancialAccountProfileId", "sourceFinancialAccountProfileId", "destinationFinancialAccountProfileId", "destinationProfileId", "liquidProfileIds"],
  journalEntryId: ["entryId", "journalEntryId", "transferEntryId"], categoryId: ["categoryId", "userCategoryId", "targetCategoryId"], budgetId: ["budgetId"], planId: ["planId"],
  contributionId: ["contributionId"], proposalId: ["proposalId"], revisionToken: ["revisionToken"],
};
function resolve(value: Json, prior: Map<string, Map<typeof referenceFields[number], string>>, operation: string, destination: string, depth = 0): Json {
  if (depth > 24) throw new ScenarioFailure("scenario_too_deep");
  if (Array.isArray(value)) return value.map(item => resolve(item, prior, operation, destination, depth + 1));
  if (object(value)) {
    if (Object.hasOwn(value, "$ref")) {
      const parsed = reference.safeParse(value);
      if (!parsed.success || !destinations[parsed.data.$ref.field].includes(destination) ||
        (parsed.data.$ref.field === "revisionToken" && operation !== "accounting.confirmCategoryReclassification")) throw new ScenarioFailure("scenario_reference_invalid");
      const resolved = prior.get(parsed.data.$ref.stepId)?.get(parsed.data.$ref.field);
      if (!resolved) throw new ScenarioFailure("scenario_reference_missing");
      return resolved;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(z.json().parse(item), prior, operation, key, depth + 1)]));
  }
  return value;
}
function referencesIn(value: Json): z.infer<typeof reference>["$ref"][] {
  if (Array.isArray(value)) return value.flatMap(referencesIn);
  if (!object(value)) return [];
  if (Object.hasOwn(value, "$ref")) return [reference.parse(value).$ref];
  return Object.values(value).flatMap(item => referencesIn(z.json().parse(item)));
}
export function parseManifest(input: unknown, platform: "ios" | "android"): ScenarioManifest {
  if (JSON.stringify(input).length > 1_000_000) throw new ScenarioFailure("scenario_too_large");
  const manifest = manifestSchema.parse(input);
  if (manifest.platform !== platform || new Set(manifest.steps.map(item => item.id)).size !== manifest.steps.length) throw new ScenarioFailure("scenario_identity_invalid");
  const prior = new Map<string, string>();
  const inspect = (value: Json, operation: string, destination: string, depth = 0): Json => {
    if (depth > 24) throw new ScenarioFailure("scenario_too_deep");
    if (Array.isArray(value)) return value.map(item => inspect(item, operation, destination, depth + 1));
    if (!object(value)) return value;
    if (Object.hasOwn(value, "$ref")) {
      const ref = reference.parse(value).$ref;
      if (!prior.has(ref.stepId) || !resultReferences[prior.get(ref.stepId) ?? ""]?.[ref.field] || !destinations[ref.field].includes(destination) ||
        (ref.field === "revisionToken" && operation !== "accounting.confirmCategoryReclassification")) throw new ScenarioFailure("scenario_reference_invalid");
      return "public_reference_placeholder";
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inspect(z.json().parse(item), operation, key, depth + 1)]));
  };
  for (const item of manifest.steps) {
    if (!contract[item.operation] || Object.hasOwn(item.args, "access")) throw new ScenarioFailure("scenario_operation_denied");
    const spec = contract[item.operation];
    if ("returnedId" in item.expect && resultReferences[item.operation]?.[item.expect.returnedId]?.length !== 0) throw new ScenarioFailure("scenario_assertion_invalid");
    if (!spec || !matches(spec.args, inspect(item.args, item.operation, ""))) throw new ScenarioFailure("scenario_arguments_invalid");
    prior.set(item.id, item.operation);
  }
  return manifest;
}
export type ScenarioAdmission = { kind: "ready"; workspaceId: string; contact: { epoch: number; generation: number } }
  | { kind: Exclude<AccessState["kind"], "ready"> };
export type ScenarioReceipt = { contract: "lukapp-live-public-scenario@1"; scenarioId: string; publicUrl: string;
  coordinatorAssertion: ScenarioManifest["coordinatorAssertion"]; deploymentIndependentlyVerifiedByDriver: false; appBuildIndependentlyVerifiedByDriver: false;
  platform: "ios" | "android"; protection: string; ownerSubject: string; workspaceId: string;
  status: "passed" | "stopped"; steps: { id: string; operation: string; facts: Json; factsResolved: boolean; assertionPassed: boolean; result?: Json; errorCode?: string }[] };
export async function runLiveScenario(input: unknown, context: { controller: { getSnapshot: () => ScenarioAdmission; execute: AccessController["execute"] };
  fixture: boolean; platform: "ios" | "android"; native: () => { mode: string; generation: number; wipePending: boolean; protection: string } }): Promise<ScenarioReceipt> {
  if (!__DEV__ || context.fixture) throw new ScenarioFailure("live_development_only");
  const manifest = parseManifest(input, context.platform);
  const initial = context.controller.getSnapshot();
  if (initial.kind !== "ready") throw new ScenarioFailure("workspace_admission_required");
  const guard = () => {
    const current = context.controller.getSnapshot(); const native = context.native();
    if (current.kind !== "ready" || current.workspaceId !== initial.workspaceId || current.contact.epoch !== initial.contact.epoch ||
      current.contact.generation !== initial.contact.generation || native.mode !== "live" || native.generation !== initial.contact.generation || native.wipePending) throw new ScenarioFailure("scenario_admission_invalidated");
  };
  guard();
  const connection = await context.controller.execute((_, rpc) => rpc.query(api.authConnection.connection, {}));
  guard();
  if (connection.status !== "owner") throw new ScenarioFailure("owner_admission_required");
  const receipt: ScenarioReceipt = { contract: manifest.contract, scenarioId: manifest.scenarioId, coordinatorAssertion: manifest.coordinatorAssertion,
    deploymentIndependentlyVerifiedByDriver: false, appBuildIndependentlyVerifiedByDriver: false, platform: context.platform, protection: context.native().protection,
    publicUrl: publicConfig.convexUrl, ownerSubject: connection.clerkSubject, workspaceId: initial.workspaceId, status: "stopped", steps: [] };
  const prior = new Map<string, Map<typeof referenceFields[number], string>>();
  for (const item of manifest.steps) {
    const spec = contract[item.operation];
    if (!spec) throw new ScenarioFailure("scenario_operation_denied");
    let facts: Json = item.args;
    let factsResolved = false;
    try {
      guard();
      facts = resolve(item.args, prior, item.operation, "");
      factsResolved = true;
      if (!object(facts) || !matches(spec.args, facts)) throw new ScenarioFailure("scenario_arguments_invalid");
      const request: Record<string, Value> = z.record(z.string(), z.json()).parse(facts);
      const result = await context.controller.execute(async (proof, rpc) => {
        const signed = await proof(item.operation, request);
        const path = item.operation.replace(".", ":");
        try {
          const value = spec.kind === "query" ? await rpc.query(makeFunctionReference<"query", Record<string, Value>, Value>(path), signed)
            : await rpc.mutation(makeFunctionReference<"mutation", Record<string, Value>, Value>(path), signed);
          return { kind: "result" as const, value };
        } catch (error) {
          guard();
          const data = error instanceof ConvexError && object(error.data) ? error.data : undefined;
          if ("errorCode" in item.expect && data?.code === item.expect.errorCode) return { kind: "expected-domain-error" as const, code: item.expect.errorCode };
          throw error;
        }
      });
      guard();
      if (result.kind === "expected-domain-error") {
        receipt.steps.push({ id: item.id, operation: item.operation, facts, factsResolved, errorCode: result.code, assertionPassed: true });
        continue;
      }
      const value = result.value;
      const captured = capture(item.operation, value);
      const referencesValid = manifest.steps.flatMap(next => referencesIn(next.args)).filter(ref => ref.stepId === item.id).every(ref => captured.has(ref.field));
      const expected = "result" in item.expect ? equals(value, item.expect.result) :
        "returnedId" in item.expect && captured.has(item.expect.returnedId);
      const assertionPassed = expected && referencesValid;
      receipt.steps.push({ id: item.id, operation: item.operation, facts, factsResolved, result: z.json().parse(JSON.parse(JSON.stringify(value))), assertionPassed,
        ...(!referencesValid ? { errorCode: "scenario_result_reference_invalid" } : !expected ? { errorCode: "scenario_assertion_failed" } : {}) });
      if (!assertionPassed) return receipt;
      prior.set(item.id, captured);
    } catch (error) {
      const data = error instanceof ConvexError && object(error.data) ? error.data : undefined;
      const code = error instanceof ScenarioFailure ? error.code : typeof data?.code === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(data.code) ? data.code : "public_request_failed";
      receipt.steps.push({ id: item.id, operation: item.operation, facts, factsResolved, errorCode: code, assertionPassed: false });
      return receipt;
    }
  }
  guard(); receipt.status = "passed"; return receipt;
}
