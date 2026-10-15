import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, createOwnedWorkspace, septNow } from "../src/accounting/convexHarness";
import { accountSetupStore } from "../apps/mobile/src/modules/local-entry-drafts/store";
import type { LocalInputCustody } from "../apps/mobile/src/modules/local-entry-drafts/store";
import type { AccountSetupDraft } from "../apps/mobile/src/modules/local-entry-drafts/account-setup";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => vi.unstubAllEnvs());

test.each(["household", "account"])("saved setup identity converges after a lost %s handler response (native storage double, real signed public handlers)", async lost => {
  const t = convexAccounting(modules);
  const personal = await createOwnedWorkspace(t);
  const records = new Map<string, string>();
  const native: LocalInputCustody = {
    inputPut: async (owner, id, text) => { expect(owner).toBe("draft"); records.set(id, text); },
    inputList: async owner => { expect(owner).toBe("draft"); return [...records.values()]; },
    inputDelete: async (owner, id) => { expect(owner).toBe("draft"); records.delete(id); },
  };
  const original: AccountSetupDraft = { kind: "account-setup", stage: "confirmed", id: "setup-retry", workspaceId: personal.id,
    target: { kind: "household", request: { functionalCurrency: "COP", idempotencyKey: "setup-retry-household", now: septNow } },
    request: { name: "Home cash", productKind: "cash", amount: { currency: "COP", minorUnits: 250000 },
      accountingDate: "2026-09-24", description: "Start tracking", idempotencyKey: "setup-retry-account" } };
  await accountSetupStore(native, 1, personal.id).put(original);
  const attempt = async (draft: AccountSetupDraft, discardResponse: boolean) => {
    if (draft.target.kind !== "household") throw new Error("Household retry expected");
    const workspace = await t.mutation(api.accounting.createHouseholdWorkspace, draft.target.request);
    if (discardResponse && lost === "household") throw new Error("Response lost after commit");
    const opening = await t.mutation(api.accounting.setupFinancialAccount, { ...draft.request, workspaceId: workspace.id });
    if (discardResponse && lost === "account") throw new Error("Response lost after commit");
    return { workspace, opening };
  };
  await expect(attempt(original, true)).rejects.toThrow("Response lost after commit");
  const restored = (await accountSetupStore(native, 2, personal.id).list())[0];
  expect(restored).toEqual(original);
  if (!restored) throw new Error("Confirmed setup was not retained");
  const final = await attempt(restored, false);
  const repeated = await attempt(restored, false);
  expect(repeated.workspace.id).toBe(final.workspace.id);
  expect(repeated.opening.profile.id).toBe(final.opening.profile.id);
  expect(repeated.opening.journalEntry?.id).toBe(final.opening.journalEntry?.id);
  expect(await t.run(async ctx => ({ workspaces: (await ctx.db.query("workspaces").collect()).length,
    profiles: (await ctx.db.query("financialAccountProfiles").collect()).length,
    entries: (await ctx.db.query("journalEntries").collect()).length }))).toEqual({ workspaces: 2, profiles: 1, entries: 1 });
  expect(await t.query(api.accounting.balances, { workspaceId: final.workspace.id })).toMatchObject([
    { financialAccountProfileId: final.opening.profile.id, balance: { currency: "COP", minorUnits: 250000 } },
  ]);
  expect(await accountSetupStore(native, 2, personal.id).list()).toEqual([original]);
});
