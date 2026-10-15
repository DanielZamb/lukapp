import { expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { z } from "zod";
import { harness, begin } from "../../access/controller.test-support";
import { StaleAccess } from "../../access/controller";
import { accountSetupStore } from "./store";
import type { LocalInputCustody } from "./store";
import type { AccountSetupDraft } from "./account-setup";
import { submitAccountSetup } from "./submit-account-setup";

const draft: AccountSetupDraft = { kind: "account-setup", stage: "confirmed", id: "setup1", workspaceId: "workspace1",
  target: { kind: "household", request: { functionalCurrency: "COP", idempotencyKey: "setup1-household", now: 1791892800000 } },
  request: { name: "Home cash", productKind: "cash", amount: { currency: "COP", minorUnits: 1000000 },
    accountingDate: "2026-10-13", description: "Start tracking", idempotencyKey: "setup1-account" } };
function storage(h: ReturnType<typeof harness>) {
  const records = new Map<string, string>();
  const check = (generation: number) => {
    const state = h.native.state();
    if (!state.unlocked || state.workspaceId !== "workspace1" || generation !== state.generation) throw new StaleAccess();
  };
  const native: LocalInputCustody = {
    inputPut: async (_, id, text, generation) => { check(generation); records.set(id, text); },
    inputList: async (_, generation) => { check(generation); return [...records.values()]; },
    inputDelete: async (_, id, generation) => { check(generation); records.delete(id); },
  };
  return { native, records };
}

it("retries the same saved Household request after unmount and lock with a fresh possession proof (native/RPC unit doubles)", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  const { native } = storage(h);
  const first = accountSetupStore(native, h.native.state().generation, "workspace1");
  await first.put(draft);
  h.answers.set("accounting:createHouseholdWorkspace", () => { throw new Error("Response lost"); });
  let challenge = 0;
  h.answers.set("devices:prepare", () => ({ challengeId: "retry-" + ++challenge, expiresAt: 5000, message: "unit challenge " + challenge }));
  const requests = vi.spyOn(h.rpc, "mutation");
  await expect(submitAccountSetup(h.controller, first, draft.id)).rejects.toThrow("Response lost");
  expect(h.controller.getSnapshot().kind).toBe("blocked");
  await h.controller.admit();
  const restored = accountSetupStore(native, h.native.state().generation, "workspace1");
  expect(await restored.list()).toEqual([draft]);
  await expect(submitAccountSetup(h.controller, restored, draft.id)).rejects.toThrow("Response lost");
  const calls = requests.mock.calls.filter(([ref]) => getFunctionName(ref) === "accounting:createHouseholdWorkspace");
  expect(calls).toHaveLength(2);
  expect(calls.map(([, args]) => args)).toMatchObject([
    { functionalCurrency: "COP", idempotencyKey: "setup1-household", now: 1791892800000 },
    { functionalCurrency: "COP", idempotencyKey: "setup1-household", now: 1791892800000 },
  ]);
  const proof = z.object({ access: z.object({ challengeId: z.string() }) });
  expect(proof.parse(calls[0]?.[1]).access.challengeId).not.toBe(proof.parse(calls[1]?.[1]).access.challengeId);
});

it("keeps saved facts and admission after a closed public setup rejection", async () => {
  const h = harness(); await begin(h); await h.controller.admit();
  const { native } = storage(h);
  const store = accountSetupStore(native, h.native.state().generation, "workspace1");
  await store.put({ ...draft, target: { kind: "existing" } });
  h.answers.set("accounting:setupFinancialAccount", () => { throw new ConvexError({ code: "locked_period" }); });
  expect(await submitAccountSetup(h.controller, store, draft.id)).toEqual({ kind: "rejected", code: "locked_period" });
  expect(h.controller.getSnapshot().kind).toBe("ready");
  expect(await store.list()).toEqual([{ ...draft, target: { kind: "existing" } }]);
  h.controller.lock();
  const before = h.events.length;
  await expect(submitAccountSetup(h.controller, store, draft.id)).rejects.toBeInstanceOf(StaleAccess);
  expect(h.events).toHaveLength(before);
});
