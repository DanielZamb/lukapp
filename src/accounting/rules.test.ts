import { expect, test } from "vitest";
import { increasesWithDebit, normalBalance, personalChartTemplate } from "./chartOfAccounts";
import { classifyFinancialAccountProfile } from "./classification";
import { totalsByAccount } from "./ledgerTotals";
import { requireFunctionalAmount, requireFunctionalCurrencyCode } from "./money";
import {
  clockMonth,
  dateFromTimestamp,
  firstDayOf,
  nextPeriod,
  periodFromAccountingDate,
  requirePeriodKey,
} from "./period";
import { assertBalancedLines } from "./posting";
import type { StoredJournalEntry, StoredWorkspace } from "./types";

function expectAccountingError(work: () => unknown, code: string) {
  try {
    work();
    expect.fail(`expected ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ name: "AccountingError", code });
  }
}

const cop: StoredWorkspace = {
  id: "w",
  kind: "Personal",
  functionalCurrency: "COP",
  chartOfAccountsTemplate: "personal@1",
};

function line(ledgerAccountId: string, debitMinorUnits: number, creditMinorUnits: number) {
  return { ledgerAccountId, debitMinorUnits, creditMinorUnits };
}

test("a balanced two-line entry passes Posting's line rules", () => {
  expect(() => assertBalancedLines([line("a", 10, 0), line("b", 0, 10)])).not.toThrow();
  expect(() =>
    assertBalancedLines([line("a", 10, 0), line("b", 0, 4), line("c", 0, 6)]),
  ).not.toThrow();
});

test("an entry with fewer than two lines is incomplete", () => {
  expectAccountingError(() => assertBalancedLines([]), "journal_entry_incomplete");
  expectAccountingError(
    () => assertBalancedLines([line("a", 10, 0)]),
    "journal_entry_incomplete",
  );
});

test("each Journal Line needs exactly one positive whole side", () => {
  const other = line("b", 0, 10);
  for (const bad of [
    line("a", 0, 0),
    line("a", 10, 10),
    line("a", -10, 0),
    line("a", 0, -10),
    line("a", 1.5, 0),
    line("a", 0, 1.5),
    line("a", Number.POSITIVE_INFINITY, 0),
    line("a", 0, Number.NaN),
  ]) {
    expectAccountingError(() => assertBalancedLines([bad, other]), "journal_line_invalid");
  }
});

test("debits must equal credits, and totals must stay safe integers", () => {
  expectAccountingError(
    () => assertBalancedLines([line("a", 10, 0), line("b", 0, 9)]),
    "posted_journal_entry_unbalanced",
  );
  const big = Number.MAX_SAFE_INTEGER;
  expectAccountingError(
    () =>
      assertBalancedLines([
        line("a", big, 0),
        line("b", big, 0),
        line("c", 0, big),
        line("d", 0, big),
      ]),
    "posted_journal_entry_unbalanced",
  );
});

test("product kinds classify into Posting Account natures", () => {
  expect(classifyFinancialAccountProfile("cash").nature).toBe("Asset");
  expect(classifyFinancialAccountProfile("bankAccount").nature).toBe("Asset");
  expect(classifyFinancialAccountProfile("creditCard").nature).toBe("Liability");
  expect(classifyFinancialAccountProfile("loan")).toEqual({
    productKind: "loan",
    nature: "Liability",
    policy: "financial-account-profile@1",
  });
  expectAccountingError(
    () => classifyFinancialAccountProfile("toString"),
    "financial_account_product_kind_unknown",
  );
  expectAccountingError(
    () => classifyFinancialAccountProfile("savings"),
    "financial_account_product_kind_unknown",
  );
});

test("natures decide the side that increases an account", () => {
  expect(increasesWithDebit("Asset")).toBe(true);
  expect(increasesWithDebit("Expense")).toBe(true);
  expect(increasesWithDebit("Liability")).toBe(false);
  expect(increasesWithDebit("Equity")).toBe(false);
  expect(increasesWithDebit("Revenue")).toBe(false);
  const totals = { debitMinorUnits: 30, creditMinorUnits: 100 };
  expect(normalBalance("Asset", totals)).toBe(-70);
  expect(normalBalance("Liability", totals)).toBe(70);
  expect(Object.is(normalBalance("Liability", { debitMinorUnits: 0, creditMinorUnits: 0 }), 0)).toBe(true);
});

test("the personal template provisions one account per nature it needs", () => {
  expect(personalChartTemplate.version).toBe("personal@1");
  expect(
    personalChartTemplate.accounts.map((account) => [account.systemKey, account.nature]),
  ).toEqual([
    ["expenses", "Expense"],
    ["income", "Revenue"],
    ["openingBalanceEquity", "Equity"],
  ]);
});

test("Functional Currency is a three-letter ISO code", () => {
  expect(requireFunctionalCurrencyCode("COP")).toBe("COP");
  for (const bad of ["", "cop", "CO", "COPX", " COP"]) {
    expectAccountingError(
      () => requireFunctionalCurrencyCode(bad),
      "functional_currency_invalid",
    );
  }
});

test("amounts are positive safe integers in Functional Currency", () => {
  expect(requireFunctionalAmount(cop, { currency: "COP", minorUnits: 5 })).toBe(5);
  for (const minorUnits of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    expectAccountingError(
      () => requireFunctionalAmount(cop, { currency: "COP", minorUnits }),
      "amount_must_be_positive",
    );
  }
  expectAccountingError(
    () => requireFunctionalAmount(cop, { currency: "USD", minorUnits: 5 }),
    "currency_mismatch",
  );
});

test("totals accumulate debits and credits per Ledger Account", () => {
  const entry = (lines: StoredJournalEntry["lines"]): StoredJournalEntry => ({
    id: "e",
    workspaceId: "w",
    accountingDate: "2026-09-24",
    period: { year: 2026, month: 9 },
    description: "x",
    idempotencyKey: "k",
    policy: "cash-expense@1",
    postedBy: "u",
    postedAt: 0,
    lines,
  });
  const totals = totalsByAccount([
    entry([line("exp", 10, 0), line("bank", 0, 10)]),
    entry([line("bank", 10, 0), line("exp", 0, 10)]),
    entry([line("exp", 5, 0), line("bank", 0, 5)]),
  ]);
  expect(totals.get("exp")).toEqual({ debitMinorUnits: 15, creditMinorUnits: 10 });
  expect(totals.get("bank")).toEqual({ debitMinorUnits: 10, creditMinorUnits: 15 });
  expect(totals.get("income")).toBeUndefined();
});

test("period helpers reject malformed clocks and dates", () => {
  expectAccountingError(() => dateFromTimestamp(Number.POSITIVE_INFINITY), "clock_required");
  expectAccountingError(() => dateFromTimestamp(Number.NaN), "clock_required");
  expectAccountingError(() => dateFromTimestamp(Number.MAX_VALUE), "clock_required");
  expectAccountingError(() => clockMonth(new Date(Number.NaN)), "clock_required");
  expect(clockMonth(dateFromTimestamp(Date.UTC(2026, 8, 24))).month).toBe(9);
  for (const bad of [
    "not-a-date",
    "x2026-09-24",
    "2026-09-24x",
    "0000-01-01",
    "2026-13-01",
    "2026-02-30",
    "2026-09-31",
  ]) {
    expectAccountingError(() => periodFromAccountingDate(bad), "accounting_date_required");
  }
  expect(periodFromAccountingDate("2026-09-24")).toEqual({ year: 2026, month: 9 });
});

test("period keys are real months, and the calendar rolls over at December", () => {
  expect(requirePeriodKey({ year: 2026, month: 12 })).toEqual({ year: 2026, month: 12 });
  expect(requirePeriodKey({ year: 1, month: 1 })).toEqual({ year: 1, month: 1 });
  expect(requirePeriodKey({ year: 9999, month: 1 })).toEqual({ year: 9999, month: 1 });
  for (const bad of [
    { year: 2026, month: 0 },
    { year: 2026, month: 13 },
    { year: 2026, month: 1.5 },
    { year: 0, month: 1 },
    { year: 10000, month: 1 },
    { year: 2026.5, month: 1 },
  ]) {
    expectAccountingError(() => requirePeriodKey(bad), "accounting_period_invalid");
  }
  expect(nextPeriod({ year: 2026, month: 9 })).toEqual({ year: 2026, month: 10 });
  expect(nextPeriod({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
  expect(firstDayOf({ year: 2026, month: 3 })).toBe("2026-03-01");
  expect(firstDayOf({ year: 987, month: 11 })).toBe("0987-11-01");
});
