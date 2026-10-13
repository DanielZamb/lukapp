import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, septNow } from "../src/accounting/convexHarness";
import type { FinancialAccountProductKind, ProfileClassificationAnswers } from "../src/accounting/types";
const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => vi.unstubAllEnvs());

for (const template of ["co-puc-personal@1", "us-gaap-personal@1"]) test(`${template}: required profile facts select real parents and normal-side canonical openings`, async () => {
  const t = convexAccounting(modules);
  const workspace = await t.mutation(api.accounting.createHouseholdWorkspace, { functionalCurrency: "COP", chartOfAccountsTemplate: template, now: septNow, idempotencyKey: "house" });
  const co = template.startsWith("co-");
  const fixtures = [
    ["receivable", { kind: "receivable", security: "unsecured", counterpartyName: " Juan " }, co ? "137010" : "1260", "Asset"],
    ["receivable", { kind: "receivable", security: "secured", counterpartyName: "Ana" }, co ? "137005" : "1250", "Asset"],
    ["investment", { kind: "investment", form: "termDeposit" }, co ? "122505" : "1110", "Asset"],
    ["investment", { kind: "investment", form: "fund", counterpartyName: "Fund operator" }, co ? "124505" : "1120", "Asset"],
    ["personalDebt", { kind: "personalDebt", counterpartyName: "Mamá" }, co ? "219505" : "2120", "Liability"],
  ] satisfies Array<[FinancialAccountProductKind, ProfileClassificationAnswers, string, string]>;
  for (const [productKind, classificationAnswers, parent, nature] of fixtures) {
    const input = { workspaceId: workspace.id, name: `${parent} product`, productKind, classificationAnswers,
      amount: { currency: "COP", minorUnits: 500 }, accountingDate: "2026-09-01", description: "Money held or still owed", idempotencyKey: parent };
    const setup = await t.mutation(api.accounting.setupFinancialAccount, input);
    expect(setup.profile.productKind).toBe(productKind);
    expect(setup.profile.classificationAnswers?.counterpartyName).toBe(("counterpartyName" in classificationAnswers ? classificationAnswers.counterpartyName.trim() : undefined));
    const line = setup.journalEntry?.lines.find(l => l.financialAccountProfileId === setup.profile.id);
    expect(line).toMatchObject({ code: `${parent}01`, nature, debitMinorUnits: nature === "Asset" ? 500 : 0, creditMinorUnits: nature === "Liability" ? 500 : 0 });
    expect((await t.mutation(api.accounting.setupFinancialAccount, input)).replay).toBe(true);
    expect(await t.mutation(api.accounting.setupFinancialAccount, { ...input, amount: { currency: "COP", minorUnits: 501 } }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  }
  expect((await t.query(api.accounting.balances, { workspaceId: workspace.id })).map(p => p.balance.minorUnits)).toEqual([500, 500, 500, 500, 500]);
});

test("profile answers fail closed and invalid atomic setup leaves no profile or ledger account", async () => {
  const t = convexAccounting(modules);
  const workspace = await t.mutation(api.accounting.createPersonalWorkspace, { functionalCurrency: "COP", now: septNow });
  for (const productKind of ["receivable", "investment", "personalDebt"] satisfies FinancialAccountProductKind[]) {
    expect(await t.mutation(api.accounting.createFinancialAccountProfile, { workspaceId: workspace.id, name: "Missing", productKind }).catch(e => e)).toMatchObject({ data: { code: "profile_classification_answers_required" } });
  }
  expect(await t.mutation(api.accounting.createFinancialAccountProfile, { workspaceId: workspace.id, name: "Blank", productKind: "receivable", classificationAnswers: { kind: "receivable", security: "unsecured", counterpartyName: " " } }).catch(e => e)).toMatchObject({ data: { code: "profile_classification_answers_required" } });
  expect(await t.mutation(api.accounting.createFinancialAccountProfile, { workspaceId: workspace.id, name: "Wrong", productKind: "bankAccount", classificationAnswers: { kind: "personalDebt", counterpartyName: "Mom" } }).catch(e => e)).toMatchObject({ data: { code: "profile_classification_answers_required" } });
  expect(await t.mutation(api.accounting.setupFinancialAccount, { workspaceId: workspace.id, name: "Bad opening", productKind: "personalDebt", classificationAnswers: { kind: "personalDebt", counterpartyName: "Mom" }, amount: { currency: "COP", minorUnits: -1 }, accountingDate: "2026-09-01", description: "Still owed", idempotencyKey: "bad-opening" }).catch(e => e)).toMatchObject({ data: { code: "opening_amount_invalid" } });
  expect(await t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: workspace.id })).toEqual([]);
  expect((await t.query(api.accounting.listLedgerAccounts, { workspaceId: workspace.id }))).toHaveLength(3);
});
