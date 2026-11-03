import { expect, test } from "vitest";
import { classifyFinancialAccountProfile } from "./classification";
import { requireRepaymentsWithinDebt } from "./debtRepayment";
import { personalChartTemplate } from "./chartOfAccounts";
import type { AccountTotals } from "./ledgerTotals";
import type { DraftJournalLine, JournalEntryDraft, LedgerAccount } from "./types";

function fixture(kind: "loan" | "creditCard", owed = 12_300_000) {
  const classification = classifyFinancialAccountProfile(personalChartTemplate, kind);
  const account: LedgerAccount = { id: "debt", workspaceId: "w", code: "21051001",
    name: kind, nature: classification.nature, normalSide: "Credit", role: "Posting" };
  const accounts = new Map([[account.id, account]]);
  const totals = new Map<string, AccountTotals>([[account.id, { debitMinorUnits: 9_000_000,
    creditMinorUnits: 9_000_000 + owed }]]);
  const store = { accountTotals: async (workspaceId: string, month?: string) => {
    expect(workspaceId).toBe("w");
    expect(month).toBeUndefined();
    return totals;
  } };
  const draft = (amount: number): JournalEntryDraft => ({ policy: "account-transfer@1",
    accountingDate: "2026-09-24", description: "Exact fixture, not the user's balance",
    idempotencyKey: "payment", lines: [
      { ledgerAccountId: "debt", debitMinorUnits: amount, creditMinorUnits: 0 },
      { ledgerAccountId: "bank", debitMinorUnits: 0, creditMinorUnits: amount },
    ] });
  const check = (value: JournalEntryDraft) => requireRepaymentsWithinDebt(store, "w", value, accounts);
  return { check, draft, totals, accounts, store };
}

for (const kind of ["loan", "creditCard"] as const) {
  test.each([500_000, 1_500_000, 12_300_000])(`${kind} accepts %i against total debt, regardless of an illustrative COP 10,000 statement`, async (amount) => {
    const s = fixture(kind);
    await expect(s.check(s.draft(amount))).resolves.toBeUndefined();
    expect(s.totals.get("debt")).toEqual({ debitMinorUnits: 9_000_000, creditMinorUnits: 21_300_000 });
  });

  test.each([12_300_001, 45_000_000])(`${kind} rejects %i without changing canonical totals`, async (amount) => {
    const s = fixture(kind);
    await expect(s.check(s.draft(amount))).rejects.toMatchObject({ code: "repayment_exceeds_debt" });
    expect(s.totals.get("debt")).toEqual({ debitMinorUnits: 9_000_000, creditMinorUnits: 21_300_000 });
  });

  test.each([0, -1, -3_000_000])(`${kind} rejects a new payment when current debt is %i`, async (owed) => {
    const s = fixture(kind, owed);
    await expect(s.check(s.draft(1))).rejects.toMatchObject({ code: "repayment_exceeds_debt" });
  });

  test(`${kind} reevaluates a stale draft after a prior payment and after its reversal`, async () => {
    const s = fixture(kind);
    const stale = s.draft(12_300_000);
    await expect(s.check(stale)).resolves.toBeUndefined();
    s.totals.set("debt", { debitMinorUnits: 12_000_000, creditMinorUnits: 21_300_000 });
    await expect(s.check(stale)).rejects.toMatchObject({ code: "repayment_exceeds_debt" });
    await expect(s.check(s.draft(9_300_000))).resolves.toBeUndefined();
    s.totals.set("debt", { debitMinorUnits: 12_000_000, creditMinorUnits: 24_300_000 });
    await expect(s.check(stale)).resolves.toBeUndefined();
  });

  test(`${kind} permits reversal corrections beyond current debt but caps subsequent payments`, async () => {
    const s = fixture(kind, 0);
    const reversal: JournalEntryDraft = { ...s.draft(3_000_000), policy: "reversal@1", reversesEntryId: "original" };
    await expect(s.check(reversal)).resolves.toBeUndefined();
    await expect(s.check({ ...reversal, policy: "account-transfer@1" }))
      .rejects.toMatchObject({ code: "repayment_exceeds_debt" });
  });
}

test("splitting a debit across lines cannot evade the cap, and independent debts cannot share capacity", async () => {
  const s = fixture("loan", 100);
  const other: LedgerAccount = { id: "other", workspaceId: "w", code: "21051002",
    name: "Other debt", nature: "Liability", normalSide: "Credit", role: "Posting" };
  s.accounts.set(other.id, other);
  s.totals.set(other.id, { debitMinorUnits: 0, creditMinorUnits: 1_000_000 });
  await expect(s.check({ ...s.draft(101), lines: [
    { ledgerAccountId: "debt", debitMinorUnits: 50, creditMinorUnits: 0 },
    { ledgerAccountId: "debt", debitMinorUnits: 51, creditMinorUnits: 0 },
    { ledgerAccountId: "other", debitMinorUnits: 1, creditMinorUnits: 0 },
    { ledgerAccountId: "bank", debitMinorUnits: 0, creditMinorUnits: 102 },
  ] })).rejects.toMatchObject({ code: "repayment_exceeds_debt" });
});

test("same-account offsets use the net reduction, and debt increases and asset transfers have no debt cap", async () => {
  const s = fixture("loan", 100);
  const lines: DraftJournalLine[] = [
    { ledgerAccountId: "debt", debitMinorUnits: 200, creditMinorUnits: 0 },
    { ledgerAccountId: "debt", debitMinorUnits: 0, creditMinorUnits: 100 },
    { ledgerAccountId: "bank", debitMinorUnits: 0, creditMinorUnits: 100 },
  ];
  await expect(s.check({ ...s.draft(100), lines })).resolves.toBeUndefined();
  await expect(s.check({ ...s.draft(1_000), lines: s.draft(1_000).lines.map((line) => ({
    ...line, debitMinorUnits: line.creditMinorUnits, creditMinorUnits: line.debitMinorUnits,
  })) })).resolves.toBeUndefined();
  s.accounts.clear();
  await expect(s.check(s.draft(1_000_000))).resolves.toBeUndefined();
});

test("missing account totals mean nothing owed, but summary-readiness failures propagate", async () => {
  const s = fixture("loan");
  s.totals.clear();
  await expect(s.check(s.draft(1))).rejects.toMatchObject({ code: "repayment_exceeds_debt" });
  await expect(requireRepaymentsWithinDebt({ accountTotals: async () => {
    throw new Error("summary unavailable");
  } }, "w", s.draft(1), s.accounts)).rejects.toThrow("summary unavailable");
});
