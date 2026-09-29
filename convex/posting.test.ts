/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { postJournalEntry } from "../src/accounting/posting";
import type { DraftJournalLine, JournalEntryDraft } from "../src/accounting/types";
import {
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  owner,
  reader,
} from "../src/accounting/convexHarness";
import { convexStore } from "./store";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

const postedAt = Date.UTC(2026, 8, 24, 18);

async function kernel() {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const accounts = await reader(t, workspace.id).ledgerAccounts();
  const expenses = accounts.find((account) => account.systemKey === "expenses");
  if (!expenses) {
    throw new Error("template is missing Expenses");
  }
  function post(
    lines: DraftJournalLine[],
    idempotencyKey = "k",
    changes: Partial<JournalEntryDraft> = {},
  ) {
    return t.run((ctx) =>
      postJournalEntry(convexStore(ctx.db), { now: () => new Date(postedAt) }, {
        actor: owner,
        workspaceId: workspace.id,
        draft: {
          accountingDate: "2026-09-24",
          description: "Direct",
          idempotencyKey,
          policy: "cash-expense@1",
          lines,
          ...changes,
        },
      }).catch((error: { code?: string }) => ({ code: error.code })),
    );
  }
  const balanced = [
    { ledgerAccountId: expenses.id, debitMinorUnits: 10, creditMinorUnits: 0 },
    { ledgerAccountId: daily.ledgerAccountId, debitMinorUnits: 0, creditMinorUnits: 10 },
  ];
  return { t, workspace, daily, expenses, post, balanced };
}

test("Posting records actor and time provenance on the entry", async () => {
  const { post, balanced } = await kernel();

  const result = await post(balanced);

  expect(result).toMatchObject({
    replay: false,
    entry: { postedBy: owner.userId, postedAt, period: { year: 2026, month: 9 } },
  });
});

test("Posting rejects lines on missing or foreign Ledger Accounts", async () => {
  const { t, post, balanced } = await kernel();
  const other = await createOwnedWorkspace(t);
  const otherDaily = await createDaily(t, other.id);

  const missing = await post([balanced[0]!, { ...balanced[1]!, ledgerAccountId: "nope" }]);
  const foreign = await post([
    balanced[0]!,
    { ...balanced[1]!, ledgerAccountId: otherDaily.ledgerAccountId },
  ]);

  expect(missing).toMatchObject({ code: "ledger_account_not_found" });
  expect(foreign).toMatchObject({ code: "ledger_account_not_found" });
});

test("Posting rejects incomplete, one-sided, or unbalanced drafts before writing", async () => {
  const { t, workspace, post, balanced } = await kernel();

  const incomplete = await post([balanced[0]!]);
  const twoSided = await post([{ ...balanced[0]!, creditMinorUnits: 10 }, balanced[1]!]);
  const unbalanced = await post([balanced[0]!, { ...balanced[1]!, creditMinorUnits: 9 }]);
  const negativeDebit = await post([
    { ...balanced[0]!, debitMinorUnits: -5, creditMinorUnits: 10 },
    { ...balanced[1]!, debitMinorUnits: 15, creditMinorUnits: 0 },
  ]);
  const negativeCredit = await post([
    { ...balanced[0]!, debitMinorUnits: 10, creditMinorUnits: -5 },
    { ...balanced[1]!, debitMinorUnits: 0, creditMinorUnits: 15 },
  ]);
  const noKey = await post(balanced, "");

  expect(incomplete).toMatchObject({ code: "journal_entry_incomplete" });
  expect(twoSided).toMatchObject({ code: "journal_line_invalid" });
  expect(unbalanced).toMatchObject({ code: "posted_journal_entry_unbalanced" });
  expect(negativeDebit).toMatchObject({ code: "journal_line_invalid" });
  expect(negativeCredit).toMatchObject({ code: "journal_line_invalid" });
  expect(noKey).toMatchObject({ code: "idempotency_key_required" });
  expect(await reader(t, workspace.id).entries()).toEqual([]);
});

test("Posting replays an identical draft and refuses a changed one under the same key", async () => {
  const { post, balanced } = await kernel();

  const first = await post(balanced);
  const again = await post(balanced);
  const reordered = await post([balanced[1]!, balanced[0]!]);

  expect(again).toEqual({ ...(first as object), replay: true });
  expect(reordered).toMatchObject({ code: "idempotency_key_conflict" });
});

test("Posting requires Workspace Membership", async () => {
  const { t, balanced } = await kernel();
  const stranger = await t.run((ctx) =>
    postJournalEntry(convexStore(ctx.db), { now: () => new Date(postedAt) }, {
      actor: { userId: "stranger" },
      workspaceId: "anything",
      draft: {
        accountingDate: "2026-09-24",
        description: "x",
        idempotencyKey: "k",
        policy: "cash-expense@1",
        lines: balanced,
      },
    }).catch((error: { code?: string }) => ({ code: error.code })),
  );

  expect(stranger).toMatchObject({ code: "workspace_membership_required" });
});

test("Posting treats any changed fact under a used key as a conflict", async () => {
  const { t, workspace, daily, expenses, post, balanced } = await kernel();
  const card = await t.mutation(api.accounting.createFinancialAccountProfile, {
    userId: owner.userId,
    workspaceId: workspace.id,
    name: "Visa",
    productKind: "creditCard",
  });
  await post(balanced);
  const [debit, credit] = balanced as [DraftJournalLine, DraftJournalLine];
  const variants: Array<[string, DraftJournalLine[], Partial<JournalEntryDraft>]> = [
    ["date", balanced, { accountingDate: "2026-09-25" }],
    ["description", balanced, { description: "Other" }],
    ["policy", balanced, { policy: "cash-income@1" }],
    ["profile", balanced, { financialAccountProfileId: daily.id }],
    ["reverses", balanced, { reversesEntryId: "some-entry" }],
    ["account", [debit, { ...credit, ledgerAccountId: card.ledgerAccountId }], {}],
    ["debit amount", [{ ...debit, debitMinorUnits: 11 }, credit], {}],
    ["credit amount", [debit, { ...credit, creditMinorUnits: 11 }], {}],
    [
      "sides",
      [
        { ledgerAccountId: expenses.id, debitMinorUnits: 0, creditMinorUnits: 10 },
        { ledgerAccountId: daily.ledgerAccountId, debitMinorUnits: 10, creditMinorUnits: 0 },
      ],
      {},
    ],
    ["extra line", [debit, credit, { ...credit, ledgerAccountId: card.ledgerAccountId }], {}],
  ];

  for (const [label, lines, changes] of variants) {
    expect([label, await post(lines, "k", changes)]).toEqual([
      label,
      { code: "idempotency_key_conflict" },
    ]);
  }
});

test("Posting refuses links to a profile or entry outside the Workspace", async () => {
  const { t, workspace, post, balanced } = await kernel();
  const other = await createOwnedWorkspace(t);
  const otherDaily = await createDaily(t, other.id);
  const otherEntry = await t.mutation(api.accounting.recordCashExpense, {
    userId: owner.userId,
    workspaceId: other.id,
    financialAccountProfileId: otherDaily.id,
    amount: { currency: "COP", minorUnits: 10 },
    accountingDate: "2026-09-24",
    description: "Elsewhere",
    idempotencyKey: "elsewhere",
  });

  const foreignProfile = await post(balanced, "profile", {
    financialAccountProfileId: otherDaily.id,
  });
  const missingProfile = await post(balanced, "missing-profile", {
    financialAccountProfileId: "not-an-id",
  });
  const foreignEntry = await post(balanced, "entry", { reversesEntryId: otherEntry.id });
  const missingEntry = await post(balanced, "missing-entry", { reversesEntryId: "not-an-id" });

  expect(foreignProfile).toMatchObject({ code: "financial_account_profile_not_found" });
  expect(missingProfile).toMatchObject({ code: "financial_account_profile_not_found" });
  expect(foreignEntry).toMatchObject({ code: "journal_entry_not_found" });
  expect(missingEntry).toMatchObject({ code: "journal_entry_not_found" });
  expect(await reader(t, workspace.id).entries()).toEqual([]);
});

test("Posting accepts links to records in its own Workspace", async () => {
  const { t, workspace, daily, post, balanced } = await kernel();

  const first = await post(balanced, "first", { financialAccountProfileId: daily.id });
  const linked = await post(balanced, "linked", {
    reversesEntryId: (first as { entry: { id: string } }).entry.id,
  });

  expect(linked).toMatchObject({ replay: false });
  expect(await reader(t, workspace.id).entries()).toHaveLength(2);
});
