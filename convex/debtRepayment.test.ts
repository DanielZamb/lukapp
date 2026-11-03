import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  createProfile,
  reader,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

async function fixture(productKind: "loan" | "creditCard", owed = 12_300_000) {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const bank = await createDaily(t, workspace.id);
  const debt = await createProfile(t, workspace.id, `SEN-97 ${productKind}`, productKind);
  for (const [profile, amount] of [[bank, 100_000_000], [debt, owed]] as const) {
    await t.action(api.accounting.recordOpeningPosition, {
      workspaceId: workspace.id,
      financialAccountProfileId: profile.id,
      amount: { currency: "COP", minorUnits: amount },
      accountingDate: "2026-09-01",
      description: "SEN-97 exact test fixture, not the user's original balance",
      idempotencyKey: `opening-${profile.id}`,
    });
  }
  const payment = (minorUnits: number, idempotencyKey = "repayment") => ({
    workspaceId: workspace.id,
    sourceFinancialAccountProfileId: bank.id,
    destinationFinancialAccountProfileId: debt.id,
    amount: { currency: "COP", minorUnits },
    accountingDate: "2026-09-24",
    description: "SEN-97 repayment",
    idempotencyKey,
  });
  const read = reader(t, workspace.id);
  return { t, workspace, bank, debt, payment, read };
}

test.each(["loan", "creditCard"] as const)("%s rejects COP 450,000 against an exact COP 123,000 fixture atomically", async (kind) => {
  const { t, payment, read } = await fixture(kind);
  const before = { balances: await read.balances(), entries: await read.entries() };
  await expect(t.action(api.accounting.recordAccountTransfer, payment(45_000_000)))
    .rejects.toMatchObject({ data: { kind: "accounting", code: "repayment_exceeds_debt" } });
  expect({ balances: await read.balances(), entries: await read.entries() }).toEqual(before);
});
