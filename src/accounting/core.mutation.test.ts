import { expect, test } from "vitest";
import { createAccountingCore } from "./core";
import {
  assertBalanced,
  ensureOpenPeriod,
  postedAmount,
  requireWorkspace,
  toPostedCashExpense,
} from "./helpers";
import { clockMonth, dateFromTimestamp, periodFromAccountingDate } from "./period";
import type {
  AccountingPeriod,
  AccountingStore,
  JournalLine,
  LedgerAccount,
  StoredCashExpense,
  StoredProfile,
  StoredWorkspace,
} from "./types";

const actor = { userId: "owner-1" };
const sept = new Date("2026-09-24T15:00:00.000Z");

function expectAccountingError(work: () => unknown, code: string) {
  try {
    work();
    expect.fail(`expected ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ name: "AccountingError", code });
  }
}

function createFakeStore(): AccountingStore & {
  workspaces: Map<string, StoredWorkspace>;
  members: Map<string, Set<string>>;
  accounts: Map<string, LedgerAccount>;
  profiles: Map<string, StoredProfile>;
  entries: Map<string, StoredCashExpense[]>;
  periods: Map<string, AccountingPeriod[]>;
  lockCalls: number;
  insertPeriodCalls: number;
} {
  const workspaces = new Map<string, StoredWorkspace>();
  const members = new Map<string, Set<string>>();
  const accounts = new Map<string, LedgerAccount>();
  const profiles = new Map<string, StoredProfile>();
  const entries = new Map<string, StoredCashExpense[]>();
  const periods = new Map<string, AccountingPeriod[]>();
  let next = 1;
  const id = () => `id-${next++}`;

  return {
    workspaces,
    members,
    accounts,
    profiles,
    entries,
    periods,
    lockCalls: 0,
    insertPeriodCalls: 0,
    async insertWorkspace(workspace, ownerUserId) {
      const created = { ...workspace, id: id() };
      workspaces.set(created.id, created);
      members.set(created.id, new Set([ownerUserId]));
      entries.set(created.id, []);
      periods.set(created.id, []);
      return created;
    },
    async getWorkspace(workspaceId) {
      return workspaces.get(workspaceId);
    },
    async setExpenseAccount(workspaceId, expenseAccountId) {
      const workspace = workspaces.get(workspaceId);
      if (workspace) {
        workspaces.set(workspaceId, { ...workspace, expenseAccountId });
      }
    },
    async isMember(workspaceId, userId) {
      return members.get(workspaceId)?.has(userId) ?? false;
    },
    async insertLedgerAccount(account) {
      const created = { ...account, id: id() };
      accounts.set(created.id, created);
      return created;
    },
    async listLedgerAccounts(workspaceId) {
      return [...accounts.values()].filter((account) => account.workspaceId === workspaceId);
    },
    async insertProfile(profile) {
      const created = { ...profile, id: id() };
      profiles.set(created.id, created);
      return created;
    },
    async getProfile(profileId) {
      return profiles.get(profileId);
    },
    async listProfiles(workspaceId) {
      return [...profiles.values()].filter((profile) => profile.workspaceId === workspaceId);
    },
    async insertPostedCashExpense(input) {
      const postedId = id();
      const posted: StoredCashExpense = {
        id: postedId,
        financialAccountProfileId: input.financialAccountProfileId,
        description: input.description,
        accountingDate: input.accountingDate,
        period: input.period,
        idempotencyKey: input.idempotencyKey,
        lines: input.lines.map((line) => ({
          ...line,
          journalEntryId: postedId,
          name: "",
        })),
      };
      entries.get(input.workspaceId)?.push(posted);
      return posted;
    },
    async findPostedCashExpense(workspaceId, idempotencyKey) {
      return entries.get(workspaceId)?.find((entry) => entry.idempotencyKey === idempotencyKey);
    },
    async listPostedCashExpenses(workspaceId) {
      return entries.get(workspaceId) ?? [];
    },
    async insertAccountingPeriod(workspaceId, period) {
      this.insertPeriodCalls += 1;
      const list = periods.get(workspaceId) ?? [];
      const existing = list.find((item) => item.year === period.year && item.month === period.month);
      if (existing) {
        return existing;
      }
      list.push(period);
      periods.set(workspaceId, list);
      return period;
    },
    async getAccountingPeriod(workspaceId, period) {
      return periods
        .get(workspaceId)
        ?.find((item) => item.year === period.year && item.month === period.month);
    },
    async lockAccountingPeriod(workspaceId, period) {
      this.lockCalls += 1;
      const list = periods.get(workspaceId) ?? [];
      const index = list.findIndex(
        (item) => item.year === period.year && item.month === period.month,
      );
      if (index < 0) {
        throw new AccountingError("accounting_period_not_found");
      }
      const locked = { year: period.year, month: period.month, status: "locked" as const };
      list[index] = locked;
      return locked;
    },
  };
}

async function seeded() {
  const store = createFakeStore();
  const core = createAccountingCore(store, { now: () => sept });
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });
  return { store, core, workspace, daily };
}

test("empty idempotency key cannot become Posted", async () => {
  const { core, workspace, daily } = await seeded();
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 100 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "",
    }),
  ).rejects.toMatchObject({ code: "idempotency_key_required" });
});

test("a missing expense account cannot become Posted", async () => {
  const { store, core, workspace, daily } = await seeded();
  const stored = store.workspaces.get(workspace.id);
  if (stored) {
    store.workspaces.set(workspace.id, { ...stored, expenseAccountId: undefined });
  }
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 100 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "no-expense",
    }),
  ).rejects.toMatchObject({ code: "expense_account_not_found" });
});

test("a missing or foreign profile cannot become Posted", async () => {
  const { core, workspace } = await seeded();
  const other = await core.createPersonalWorkspace({
    actor: { userId: "other-1" },
    functionalCurrency: "COP",
  });
  const otherDaily = await core.createFinancialAccountProfile({
    actor: { userId: "other-1" },
    workspaceId: other.id,
    name: "Other Daily",
  });
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: "missing",
      amount: { currency: "COP", minorUnits: 100 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "missing-profile",
    }),
  ).rejects.toMatchObject({ code: "financial_account_profile_not_found" });
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: otherDaily.id,
      amount: { currency: "COP", minorUnits: 100 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "foreign-profile",
    }),
  ).rejects.toMatchObject({ code: "financial_account_profile_not_found" });
});

test("an idempotency key cannot replay a different profile or description", async () => {
  const { core, workspace, daily } = await seeded();
  const savings = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Savings",
  });
  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 100 },
    accountingDate: "2026-09-24",
    description: "Groceries",
    idempotencyKey: "same-key",
  });
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: savings.id,
      amount: { currency: "COP", minorUnits: 100 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "same-key",
    }),
  ).rejects.toMatchObject({ code: "idempotency_key_conflict" });
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 100 },
      accountingDate: "2026-09-24",
      description: "Rent",
      idempotencyKey: "same-key",
    }),
  ).rejects.toMatchObject({ code: "idempotency_key_conflict" });
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 100 },
      accountingDate: "2026-09-20",
      description: "Groceries",
      idempotencyKey: "same-key",
    }),
  ).rejects.toMatchObject({ code: "idempotency_key_conflict" });
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 50 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "same-key",
    }),
  ).rejects.toMatchObject({ code: "idempotency_key_conflict" });
});

test("a negative or unsafe integer amount cannot become Posted", async () => {
  const { core, workspace, daily } = await seeded();
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: -1 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "neg",
    }),
  ).rejects.toMatchObject({ code: "amount_must_be_positive" });
  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: Number.MAX_SAFE_INTEGER + 1 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "unsafe",
    }),
  ).rejects.toMatchObject({ code: "amount_must_be_positive" });
});

test("locking a missing or not-opened period fails, and locking twice is idempotent", async () => {
  const { store, core, workspace } = await seeded();
  await expect(
    core.lockAccountingPeriod({
      actor,
      workspaceId: workspace.id,
      period: { year: 2025, month: 1 },
    }),
  ).rejects.toMatchObject({ code: "accounting_period_not_found" });
  store.periods.set(workspace.id, [
    ...(store.periods.get(workspace.id) ?? []),
    { year: 2024, month: 2, status: "not_opened" },
  ]);
  await expect(
    core.lockAccountingPeriod({
      actor,
      workspaceId: workspace.id,
      period: { year: 2024, month: 2 },
    }),
  ).rejects.toMatchObject({ code: "accounting_period_not_found" });

  const once = await core.lockAccountingPeriod({
    actor,
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });
  const twice = await core.lockAccountingPeriod({
    actor,
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });
  expect(once.status).toBe("locked");
  expect(twice).toEqual(once);
  expect(store.lockCalls).toBe(1);
});

test("openWorkspace uses the injected clock when now is omitted", async () => {
  const { core, workspace } = await seeded();
  const opened = await core.openWorkspace({ actor, workspaceId: workspace.id });
  expect(opened.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 9,
    status: "open",
  });
  const later = await core.openWorkspace({
    actor,
    workspaceId: workspace.id,
    now: Date.UTC(2026, 9, 1),
  });
  expect(later.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 10,
    status: "not_opened",
  });
});

test("createAccountingCore uses the system clock when none is injected", async () => {
  const { store, workspace } = await seeded();
  const core = createAccountingCore(store);
  const opened = await core.openWorkspace({ actor, workspaceId: workspace.id });
  const today = clockMonth(new Date());
  expect(opened.currentAccountingPeriod).toEqual({
    ...today,
    status: today.year === 2026 && today.month === 9 ? "open" : "not_opened",
  });
});

test("a Personal Workspace opens Expenses and Opening Balance Equity accounts", async () => {
  const { store, workspace } = await seeded();
  expect(
    [...store.accounts.values()]
      .filter((account) => account.workspaceId === workspace.id)
      .map((account) => account.name),
  ).toEqual(expect.arrayContaining(["Expenses", "Opening Balance Equity"]));
});

test("an already-open Accounting Period is not inserted again", async () => {
  const { store, workspace } = await seeded();
  const before = store.insertPeriodCalls;
  const first = await ensureOpenPeriod(store, workspace.id, { year: 2026, month: 9 });
  const second = await ensureOpenPeriod(store, workspace.id, { year: 2026, month: 9 });
  expect(first).toEqual({ year: 2026, month: 9, status: "open" });
  expect(second).toEqual(first);
  expect(store.insertPeriodCalls).toBe(before);
});

test("a member without a workspace row is rejected", async () => {
  const store = createFakeStore();
  store.members.set("ghost", new Set([actor.userId]));
  await expect(requireWorkspace(store, "ghost", actor)).rejects.toMatchObject({
    code: "workspace_membership_required",
  });
});

test("period helpers reject malformed clocks and dates", () => {
  expectAccountingError(() => dateFromTimestamp(Number.POSITIVE_INFINITY), "clock_required");
  expectAccountingError(() => dateFromTimestamp(Number.NaN), "clock_required");
  expectAccountingError(() => dateFromTimestamp(Number.MAX_VALUE), "clock_required");
  expectAccountingError(() => clockMonth(new Date(Number.NaN)), "clock_required");
  expect(clockMonth(dateFromTimestamp(Date.UTC(2026, 8, 24))).month).toBe(9);
  expectAccountingError(() => periodFromAccountingDate("not-a-date"), "accounting_date_required");
  expectAccountingError(() => periodFromAccountingDate("x2026-09-24"), "accounting_date_required");
  expectAccountingError(() => periodFromAccountingDate("2026-09-24x"), "accounting_date_required");
  expectAccountingError(() => periodFromAccountingDate("0000-01-01"), "accounting_date_required");
  expectAccountingError(() => periodFromAccountingDate("2026-13-01"), "accounting_date_required");
  expectAccountingError(() => periodFromAccountingDate("2026-02-30"), "accounting_date_required");
  expectAccountingError(() => periodFromAccountingDate("2026-09-31"), "accounting_date_required");
  expect(periodFromAccountingDate("2026-09-24")).toEqual({ year: 2026, month: 9 });
});

test("unbalanced draft lines cannot become Posted", () => {
  expectAccountingError(
    () =>
      assertBalanced([
        { ledgerAccountId: "a", debitMinorUnits: 10, creditMinorUnits: 0 },
        { ledgerAccountId: "b", debitMinorUnits: 0, creditMinorUnits: 9 },
      ]),
    "posted_journal_entry_unbalanced",
  );
});

test("posted amount is zero when the expense line is missing", () => {
  expect(
    postedAmount(
      { id: "w", kind: "Personal", functionalCurrency: "COP", expenseAccountId: "exp" },
      {
        id: "e",
        financialAccountProfileId: "p",
        description: "x",
        accountingDate: "2026-09-24",
        period: { year: 2026, month: 9 },
        idempotencyKey: "k",
        lines: [
          {
            journalEntryId: "e",
            ledgerAccountId: "other",
            name: "",
            debitMinorUnits: 5,
            creditMinorUnits: 0,
          },
        ],
      },
    ),
  ).toBe(0);
});

test("reading a posted expense requires its period, profile, and falls back to account ids", async () => {
  const store = createFakeStore();
  const workspace: StoredWorkspace = {
    id: "w",
    kind: "Personal",
    functionalCurrency: "COP",
    expenseAccountId: "exp",
  };
  const line: JournalLine = {
    journalEntryId: "e",
    ledgerAccountId: "unknown",
    name: "",
    debitMinorUnits: 1,
    creditMinorUnits: 0,
  };
  const entry: StoredCashExpense = {
    id: "e",
    financialAccountProfileId: "p",
    description: "x",
    accountingDate: "2026-09-24",
    period: { year: 2026, month: 9 },
    idempotencyKey: "k",
    lines: [line],
  };
  await expect(toPostedCashExpense(store, workspace, entry, false)).rejects.toMatchObject({
    code: "accounting_period_not_found",
  });
  store.periods.set("w", [{ year: 2026, month: 9, status: "open" }]);
  await expect(toPostedCashExpense(store, workspace, entry, false)).rejects.toMatchObject({
    code: "financial_account_profile_not_found",
  });
  store.profiles.set("p", {
    id: "p",
    workspaceId: "w",
    name: "Daily",
    postingAccountId: "daily",
  });
  const posted = await toPostedCashExpense(store, workspace, entry, false);
  expect(posted.lines[0]?.name).toBe("unknown");
});

test("profile balances use debit minus credit", async () => {
  const { store, core, workspace, daily } = await seeded();
  const profile = store.profiles.get(daily.id);
  const expenseAccountId = store.workspaces.get(workspace.id)?.expenseAccountId;
  if (!profile || !expenseAccountId) {
    throw new Error("seeded workspace is missing accounts");
  }
  await store.insertPostedCashExpense({
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    accountingDate: "2026-09-24",
    description: "Adjust",
    period: { year: 2026, month: 9 },
    idempotencyKey: "adjust",
    lines: [
      {
        ledgerAccountId: profile.postingAccountId,
        debitMinorUnits: 40,
        creditMinorUnits: 0,
      },
      {
        ledgerAccountId: expenseAccountId,
        debitMinorUnits: 0,
        creditMinorUnits: 40,
      },
    ],
  });
  expect(await core.balances({ actor, workspaceId: workspace.id })).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinorUnits: 40,
      creditMinorUnits: 0,
      debitMinusCredit: { currency: "COP", minorUnits: 40 },
    },
  ]);
});

test("trial balance hides unused ledger accounts", async () => {
  const { core, workspace, daily } = await seeded();
  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 50 },
    accountingDate: "2026-09-24",
    description: "Coffee",
    idempotencyKey: "coffee",
  });
  const trial = await core.trialBalance({ actor, workspaceId: workspace.id });
  expect(trial.some((row) => row.name === "Opening Balance Equity")).toBe(false);
});
